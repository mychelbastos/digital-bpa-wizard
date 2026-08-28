import { useEffect, useRef, useState } from "react";
import { Loader2, X, Search } from "lucide-react";
import { buscarProcedimentosPorNome } from "@/lib/bpa-i-v2/procedimentos-sigtap";
import { carregarNomesProcedimentos } from "@/lib/dashboard-producao";

// Campo INTELIGENTE de procedimento: digita 3+ caracteres (código OU nome) e sugere as
// opções; ao escolher (ou completar 10 dígitos) fixa o código e mostra o nome. `value` é o
// código de 10 dígitos ("" = nenhum/todos). Reutilizado nos relatórios.
export function ProcedimentoPicker({ value, onChange, placeholder }: { value: string; onChange: (codigo: string) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<{ codigo: string; nome: string }[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [nome, setNome] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Resolve o nome quando há um código completo selecionado.
  useEffect(() => {
    let vivo = true;
    if (value && value.length === 10) carregarNomesProcedimentos([value]).then((m) => { if (vivo) setNome(m[value] ?? null); });
    else setNome(null);
    return () => { vivo = false; };
  }, [value]);

  // Busca com debounce. Se digitar os 10 dígitos exatos, fixa direto e mostra o nome.
  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 3) { setOpts([]); setAberto(false); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      if (/^\d{10}$/.test(termo)) {
        const m = await carregarNomesProcedimentos([termo]);
        onChange(termo); setNome(m[termo] ?? null); setQ(""); setOpts([]); setAberto(false); setBuscando(false);
        return;
      }
      const r = await buscarProcedimentosPorNome(termo);
      setOpts(r); setAberto(true); setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, onChange]);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const selecionar = (o: { codigo: string; nome: string }) => { onChange(o.codigo); setNome(o.nome); setQ(""); setOpts([]); setAberto(false); };
  const limpar = () => { onChange(""); setNome(null); setQ(""); setOpts([]); };

  const inputCls = "w-full rounded-md border border-border bg-background px-2.5 py-2 pl-8 text-sm";

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => opts.length > 0 && setAberto(true)}
          inputMode="text"
          placeholder={placeholder ?? "Código ou nome (3+ caracteres)"}
          className={inputCls}
        />
        {buscando && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {value && (
        <div className="mt-1 flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px]">
          <span className="font-mono font-semibold text-foreground">{value}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{nome ? `— ${nome}` : value.length === 10 ? "— (não encontrado no SIGTAP)" : ""}</span>
          <button type="button" onClick={limpar} title="Limpar procedimento" className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
        </div>
      )}

      {aberto && opts.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {opts.map((o) => (
            <li key={o.codigo}>
              <button type="button" onClick={() => selecionar(o)} className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted">
                <span className="shrink-0 font-mono font-semibold text-foreground">{o.codigo}</span>
                <span className="min-w-0 flex-1 text-muted-foreground">{o.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {aberto && !buscando && opts.length === 0 && q.trim().length >= 3 && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-border bg-popover px-2.5 py-2 text-xs text-muted-foreground shadow-lg">Nenhum procedimento encontrado.</div>
      )}
    </div>
  );
}
