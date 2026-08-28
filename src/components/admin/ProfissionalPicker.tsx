import { useEffect, useRef, useState } from "react";
import { Loader2, X, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { buscarProfissionais, buscarNomePorCns, sincronizarProfissionais } from "@/lib/bpa-i-v2/profissionais";

// Autocomplete de PROFISSIONAL por CNES (crivo nome↔CNS): busca por nome OU CNS no cadastro
// SCNES da unidade (tabela `profissionais`, com sync sob demanda). Selecionar fixa nome+cns e
// marca "confere". Digitar 15 dígitos de CNS resolve o nome. `confere` indica se veio do
// cadastro da unidade (crivo ok). Controlado: value={nome,cns,confere}.
export function ProfissionalPicker({ cnes, nome, cns, confere, onChange }: {
  cnes: string;
  nome: string; cns: string; confere: boolean;
  onChange: (nome: string, cns: string, confere: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<{ cns: string; nome: string }[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Ao trocar de CNES, esquenta o cache do SCNES (uma vez) e zera a seleção.
  useEffect(() => {
    if (/^[0-9]{7}$/.test(cnes)) { sincronizarProfissionais(cnes); }
    onChange("", "", false); setQ(""); setOpts([]); setAviso(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnes]);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  // Busca com debounce. 15 dígitos = tenta resolver o nome pelo CNS (crivo direto).
  useEffect(() => {
    const termo = q.trim();
    setAviso(null);
    if (!cnes) { setOpts([]); return; }
    if (termo.length < 2) { setOpts([]); setAberto(false); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      if (/^[0-9]{15}$/.test(termo)) {
        const nm = await buscarNomePorCns(cnes, termo);
        if (nm) { onChange(nm, termo, true); setQ(""); setOpts([]); setAberto(false); }
        else setAviso("CNS não encontrado no cadastro (SCNES) desta unidade.");
        setBuscando(false);
        return;
      }
      const r = await buscarProfissionais(cnes, termo);
      setOpts(r); setAberto(true); setBuscando(false);
      if (r.length === 0) setAviso("Ninguém encontrado no cadastro (SCNES) desta unidade.");
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, cnes]);

  const selecionar = (o: { cns: string; nome: string }) => { onChange(o.nome, o.cns, true); setQ(""); setOpts([]); setAberto(false); setAviso(null); };
  const limpar = () => { onChange("", "", false); setQ(""); setOpts([]); setAviso(null); };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => opts.length > 0 && setAberto(true)}
          disabled={!cnes}
          placeholder={cnes ? "Nome ou CNS do profissional" : "Escolha a unidade antes"}
          className="w-full rounded-md border border-border bg-background px-2 py-1 pl-7 text-xs text-foreground disabled:opacity-50"
        />
        {buscando && <Loader2 className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {aviso && <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-600"><AlertTriangle className="size-3" /> {aviso}</p>}

      {nome && (
        <div className={`mt-1 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${confere ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
          {confere ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" /> : <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />}
          <span className="min-w-0 flex-1 truncate"><strong className="text-foreground">{nome}</strong>{cns ? <span className="ml-1 font-mono text-muted-foreground">CNS {cns}</span> : null}</span>
          <button type="button" onClick={limpar} title="Limpar" className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"><X className="size-3" /></button>
        </div>
      )}

      {aberto && opts.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {opts.map((o) => (
            <li key={o.cns}>
              <button type="button" onClick={() => selecionar(o)} className="flex w-full flex-col items-start gap-0.5 px-2.5 py-1.5 text-left hover:bg-muted">
                <span className="text-xs font-medium text-foreground">{o.nome}</span>
                <span className="font-mono text-[10px] text-muted-foreground">CNS {o.cns}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
