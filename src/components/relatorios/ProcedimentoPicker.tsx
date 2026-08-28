import { useEffect, useRef, useState } from "react";
import { Loader2, X, Search, AlertCircle } from "lucide-react";
import { buscarProcedimentosPorNome } from "@/lib/bpa-i-v2/procedimentos-sigtap";
import { carregarNomesProcedimentos } from "@/lib/dashboard-producao";

// Campo INTELIGENTE e MULTI de procedimento: digita 3+ caracteres (código OU nome) e sugere
// as opções do SIGTAP; ao escolher (ou completar 10 dígitos) ACRESCENTA o código à seleção e
// mostra o nome. Cada selecionado vira um chip removível. Código de 10 dígitos inexistente no
// SIGTAP mostra aviso de erro. `value` = lista de códigos (vazia = todos/nenhum).
export function ProcedimentoPicker({ value, onChange, placeholder }: { value: string[]; onChange: (codigos: string[]) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<{ codigo: string; nome: string }[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const boxRef = useRef<HTMLDivElement>(null);

  // Resolve os nomes dos códigos selecionados.
  useEffect(() => {
    let vivo = true;
    if (value.length) carregarNomesProcedimentos(value).then((m) => { if (vivo) setNomes(m); });
    else setNomes({});
    return () => { vivo = false; };
  }, [value]);

  const adicionar = (codigo: string, nome?: string) => {
    setErro(null);
    if (value.includes(codigo)) { setQ(""); setOpts([]); setAberto(false); return; }
    if (nome) setNomes((n) => ({ ...n, [codigo]: nome }));
    onChange([...value, codigo]);
    setQ(""); setOpts([]); setAberto(false);
  };
  const remover = (codigo: string) => onChange(value.filter((c) => c !== codigo));

  // Busca com debounce. Se digitar 10 dígitos exatos: valida no SIGTAP — existe → acrescenta;
  // não existe → aviso de erro.
  useEffect(() => {
    const termo = q.trim();
    setErro(null);
    if (termo.length < 3) { setOpts([]); setAberto(false); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      if (/^\d{10}$/.test(termo)) {
        const m = await carregarNomesProcedimentos([termo]);
        if (m[termo]) adicionar(termo, m[termo]);
        else { setErro(`Código ${termo} não existe no SIGTAP.`); setOpts([]); setAberto(false); }
        setBuscando(false);
        return;
      }
      const r = await buscarProcedimentosPorNome(termo);
      setOpts(r); setAberto(true); setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const inputCls = "w-full rounded-md border border-border bg-background px-2.5 py-2 pl-8 text-sm";

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => opts.length > 0 && setAberto(true)}
          placeholder={placeholder ?? "Código ou nome (3+ caracteres) — adiciona vários"}
          className={inputCls}
        />
        {buscando && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {erro && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-600"><AlertCircle className="size-3.5" /> {erro}</p>
      )}

      {value.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {value.map((c) => (
            <div key={c} className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px]">
              <span className="font-mono font-semibold text-foreground">{c}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{nomes[c] ? `— ${nomes[c]}` : "— …"}</span>
              <button type="button" onClick={() => remover(c)} title="Remover" className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {aberto && opts.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {opts.map((o) => {
            const jaTem = value.includes(o.codigo);
            return (
              <li key={o.codigo}>
                <button type="button" disabled={jaTem} onClick={() => adicionar(o.codigo, o.nome)} className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50">
                  <span className="shrink-0 font-mono font-semibold text-foreground">{o.codigo}</span>
                  <span className="min-w-0 flex-1 text-muted-foreground">{o.nome}</span>
                  {jaTem && <span className="shrink-0 text-[10px] font-semibold text-primary">✓ já</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {aberto && !buscando && opts.length === 0 && q.trim().length >= 3 && !/^\d{10}$/.test(q.trim()) && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-border bg-popover px-2.5 py-2 text-xs text-muted-foreground shadow-lg">Nenhum procedimento encontrado.</div>
      )}
    </div>
  );
}
