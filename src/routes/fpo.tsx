import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, AlertTriangle, X, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import { carregarVinculosUsuario } from "@/lib/dashboard-producao";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { parseFpoHtml, type FpoArquivoParsed } from "@/lib/fpo/parse-fpo";
import {
  carregarComparacaoFpo, resolverLinhasFpo, salvarTetosFpo, definirTetoVigente,
  cnesEditaveisFpo, type FpoComparacaoRow, type FpoItemResolvido,
} from "@/lib/fpo/fpo";

export const Route = createFileRoute("/fpo")({
  head: () => ({ meta: [{ title: "FPO — Ficha de Programação Orçamentária" }] }),
  component: FpoPage,
});

const competenciaAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (n: number) => n.toLocaleString("pt-BR");
const compLabel = (c: string) => `${c.slice(4, 6)}/${c.slice(0, 4)}`;

function FpoPage() {
  const user = useAuthUser();
  const [cnesOpcoes, setCnesOpcoes] = useState<{ cnes: string; nome: string }[]>([]);
  const [editaveis, setEditaveis] = useState<Set<string>>(new Set());
  const [cnes, setCnes] = useState("");
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [rows, setRows] = useState<FpoComparacaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const podeEditar = cnes ? editaveis.has(cnes) : false;

  // Carrega as unidades do usuário (vínculos) + em quais pode editar FPO.
  useEffect(() => {
    (async () => {
      const [vincs, edit] = await Promise.all([carregarVinculosUsuario(), cnesEditaveisFpo()]);
      const unicos = [...new Set(vincs.map((v) => v.cnes).filter(Boolean))];
      const nomes = await Promise.all(unicos.map(async (c) => ({ cnes: c, nome: (await buscarEstabelecimento(c)) || c })));
      setCnesOpcoes(nomes);
      setEditaveis(new Set(edit));
      if (unicos[0]) setCnes((atual) => atual || unicos[0]);
    })();
  }, []);

  const carregar = useCallback(async () => {
    if (!cnes || !competencia) { setRows([]); return; }
    setLoading(true);
    setRows(await carregarComparacaoFpo(cnes, competencia));
    setLoading(false);
  }, [cnes, competencia]);
  useEffect(() => { carregar(); }, [carregar]);

  const totais = useMemo(() => rows.reduce((acc, r) => ({
    teto: acc.teto + r.qtdOrcada, prod: acc.prod + r.produzido, saldo: acc.saldo + r.saldo,
    tetoRS: acc.tetoRS + r.tetoRS, prodRS: acc.prodRS + r.produzidoRS, saldoRS: acc.saldoRS + r.saldoRS,
  }), { teto: 0, prod: 0, saldo: 0, tetoRS: 0, prodRS: 0, saldoRS: 0 }), [rows]);
  const pendencias = rows.filter((r) => !r.resolvido).length;
  const semTeto = rows.filter((r) => !r.temTeto && r.produzido > 0).length;

  // Edita o teto criando/atualizando a VIGÊNCIA na competência visualizada (vale dessa
  // competência em diante; as anteriores mantêm o valor). Funciona também em linha sem teto.
  const editarCampo = async (r: FpoComparacaoRow, campo: "qtd" | "valor", valor: number) => {
    if (!podeEditar) return;
    const ok = await definirTetoVigente(cnes, r.procedimento, competencia, {
      qtdOrcada: campo === "qtd" ? Math.max(0, Math.round(valor)) : r.qtdOrcada,
      valorUnitario: campo === "valor" ? Math.max(0, valor) : r.valorUnitario,
      codigoFpo: r.codigoFpo,
      descricaoFpo: r.descricao,
      resolvido: r.resolvido,
    }, user?.id ?? null);
    if (!ok) { toast.error("Não foi possível salvar. Verifique sua permissão de edição nesta unidade."); return; }
    if (r.herdado || !r.temTeto) toast.success(`Teto definido a partir de ${compLabel(competencia)}.`);
    carregar();
  };

  const nomeUnidade = cnesOpcoes.find((o) => o.cnes === cnes)?.nome ?? cnes;

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
            <h1 className="flex items-center gap-2 text-base font-semibold"><FileSpreadsheet className="size-4" /> FPO — Ficha de Programação Orçamentária</h1>
          </div>
          {podeEditar && (
            <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Upload className="size-4" /> Importar arquivo
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto mt-5 max-w-[1200px] px-4">
        {/* Filtros */}
        <div className="mb-4 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto]">
          <label className="text-sm">
            <span className="text-xs font-medium text-muted-foreground">Unidade</span>
            <select value={cnes} onChange={(e) => setCnes(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              {cnesOpcoes.length === 0 && <option value="">Sem unidade vinculada</option>}
              {cnesOpcoes.map((o) => <option key={o.cnes} value={o.cnes}>{o.nome} ({o.cnes})</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs font-medium text-muted-foreground">Competência</span>
            <input type="month" value={`${competencia.slice(0, 4)}-${competencia.slice(4, 6)}`}
              onChange={(e) => e.target.value && setCompetencia(e.target.value.replace("-", ""))}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <div className="flex items-end text-xs text-muted-foreground">
            {podeEditar ? "Você pode editar os tetos desta unidade." : "Somente leitura (sem permissão de edição nesta unidade)."}
          </div>
        </div>

        {/* Resumo */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card titulo="Teto orçado" qtd={totais.teto} valor={totais.tetoRS} />
          <Card titulo="Produzido" qtd={totais.prod} valor={totais.prodRS} />
          <Card titulo="Saldo" qtd={totais.saldo} valor={totais.saldoRS} saldo />
        </div>

        {(pendencias > 0 || semTeto > 0) && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="size-4 shrink-0" />
            {pendencias > 0 && <span><strong>{pendencias}</strong> procedimento(s) da FPO não casaram no SIGTAP (revisar/corrigir o código).</span>}
            {semTeto > 0 && <span><strong>{semTeto}</strong> procedimento(s) com produção <strong>sem teto</strong> orçado.</span>}
          </div>
        )}

        {/* Tabela */}
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Procedimento</th>
                <th className="px-3 py-2 text-right font-medium">Teto</th>
                <th className="px-3 py-2 text-right font-medium">Produzido</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
                <th className="px-3 py-2 text-right font-medium">Valor unit.</th>
                <th className="px-3 py-2 text-right font-medium">Teto R$</th>
                <th className="px-3 py-2 text-right font-medium">Produzido R$</th>
                <th className="px-3 py-2 text-right font-medium">Saldo R$</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="mx-auto size-4 animate-spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">Sem FPO para esta unidade/competência. {podeEditar && "Importe o arquivo do estado para começar."}</td></tr>
              ) : rows.map((r) => (
                <tr key={r.procedimento} className={`border-b border-border/60 ${!r.resolvido ? "bg-amber-50/60" : !r.temTeto ? "bg-sky-50/50" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="min-w-0 truncate">{r.descricao}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{r.codigoFpo ?? r.procedimento}</span>
                      {!r.resolvido && <span className="shrink-0 rounded bg-amber-200 px-1 text-[9px] font-semibold text-amber-800">revisar</span>}
                      {r.resolvido && !r.temTeto && <span className="shrink-0 rounded bg-sky-200 px-1 text-[9px] font-semibold text-sky-800">sem teto</span>}
                      {r.herdado && r.tetoCompetencia && <span className="shrink-0 rounded bg-muted px-1 text-[9px] font-semibold text-muted-foreground" title="Teto herdado de uma competência anterior (base). Edite para criar uma nova vigência a partir deste mês.">base {compLabel(r.tetoCompetencia)}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {podeEditar
                      ? <CampoNum valor={r.qtdOrcada} onSalvar={(v) => editarCampo(r, "qtd", v)} />
                      : int(r.qtdOrcada)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{int(r.produzido)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.saldo < 0 ? "text-rose-600" : r.saldo === 0 ? "text-muted-foreground" : "text-emerald-600"}`}>{int(r.saldo)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {podeEditar
                      ? <CampoNum valor={r.valorUnitario} decimal onSalvar={(v) => editarCampo(r, "valor", v)} />
                      : brl(r.valorUnitario)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(r.tetoRS)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(r.produzidoRS)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.saldoRS < 0 ? "text-rose-600" : "text-foreground"}`}>{brl(r.saldoRS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Produção casada por mês de apresentação. Saldo verde = ainda pode produzir · vermelho = estourou o teto.
          {podeEditar && " Clique nos campos Teto / Valor unit. para editar — o valor vale desta competência em diante; as anteriores mantêm o valor antigo."}
        </p>
      </main>

      {importOpen && (
        <ImportarFpoModal
          cnesEsperado={cnes}
          nomeUnidade={nomeUnidade}
          userId={user?.id ?? null}
          onClose={() => setImportOpen(false)}
          onImportado={(comp) => { setImportOpen(false); if (comp) setCompetencia(comp); carregar(); }}
        />
      )}
    </div>
  );
}

function Card({ titulo, qtd, valor, saldo }: { titulo: string; qtd: number; valor: number; saldo?: boolean }) {
  const cor = saldo ? (qtd < 0 ? "text-rose-600" : qtd === 0 ? "text-muted-foreground" : "text-emerald-600") : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${cor}`}>{int(qtd)}</p>
      <p className="text-xs text-muted-foreground tabular-nums">{brl(valor)}</p>
    </div>
  );
}

// Campo numérico editável inline (salva no blur / Enter). `decimal` para valores em R$.
function CampoNum({ valor, onSalvar, decimal }: { valor: number; onSalvar: (v: number) => void; decimal?: boolean }) {
  const [txt, setTxt] = useState(String(valor));
  useEffect(() => { setTxt(decimal ? String(valor) : String(valor)); }, [valor, decimal]);
  const commit = () => {
    const n = Number(txt.replace(",", "."));
    if (Number.isFinite(n) && n !== valor) onSalvar(n);
    else setTxt(String(valor));
  };
  return (
    <input
      value={txt}
      inputMode={decimal ? "decimal" : "numeric"}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums hover:border-border focus:border-primary focus:bg-background focus:outline-none"
    />
  );
}

// Modal de importação: lê o arquivo, resolve os códigos e pede confirmação (CNES +
// competência + prévia) antes de gravar.
function ImportarFpoModal({ cnesEsperado, nomeUnidade, userId, onClose, onImportado }: {
  cnesEsperado: string;
  nomeUnidade: string;
  userId: string | null;
  onClose: () => void;
  onImportado: (competencia: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<FpoArquivoParsed | null>(null);
  const [itens, setItens] = useState<FpoItemResolvido[]>([]);
  const [competencia, setCompetencia] = useState("");
  const [processando, setProcessando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const aoEscolher = async (file: File) => {
    setProcessando(true);
    try {
      const buf = await file.arrayBuffer();
      const html = new TextDecoder("iso-8859-1").decode(buf);
      const p = parseFpoHtml(html, file.name);
      setParsed(p);
      setCompetencia(p.competencia ?? "");
      setItens(await resolverLinhasFpo(p.linhas));
    } catch {
      toast.error("Não consegui ler o arquivo. Confirme que é o .xls (HTML) da FPO.");
    } finally {
      setProcessando(false);
    }
  };

  const cnesArquivo = parsed?.cnes ?? null;
  const cnesDivergente = Boolean(cnesArquivo && cnesEsperado && cnesArquivo !== cnesEsperado);
  const naoResolvidos = itens.filter((i) => !i.resolvido).length;
  const compValida = /^\d{6}$/.test(competencia);

  const salvar = async () => {
    if (!cnesArquivo || !compValida || itens.length === 0) return;
    setSalvando(true);
    const n = await salvarTetosFpo(cnesArquivo, competencia, itens, userId);
    setSalvando(false);
    if (n == null) { toast.error("Falha ao gravar. Verifique sua permissão de edição nesta unidade."); return; }
    toast.success(`FPO importada: ${n} procedimento(s) em ${compLabel(competencia)}.`);
    onImportado(competencia);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <h2 className="flex items-center gap-2 text-base font-bold"><Upload className="size-4" /> Importar FPO</h2>
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </header>

        <div className="space-y-4 p-5">
          <div>
            <input ref={inputRef} type="file" accept=".xls,.xlsx,.html,.htm" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) aoEscolher(f); }} />
            <button onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
              {processando ? <><Loader2 className="size-4 animate-spin" /> Lendo arquivo…</> : <><FileSpreadsheet className="size-5" /> Escolher o arquivo .xls da FPO</>}
            </button>
            <p className="mt-1 text-center text-[11px] text-muted-foreground">Um arquivo = uma unidade + uma competência.</p>
          </div>

          {parsed && (
            <>
              {/* Confirmação: CNES + competência */}
              <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-2">
                <div className="text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Unidade (do arquivo)</span>
                  <p className="font-semibold">{cnesArquivo ?? "—"}</p>
                  {cnesDivergente && <p className="text-[11px] text-rose-600">Diverge da unidade selecionada ({cnesEsperado} — {nomeUnidade}). Vai salvar na do arquivo.</p>}
                </div>
                <label className="text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Competência (confirme)</span>
                  <input type="month" value={compValida ? `${competencia.slice(0, 4)}-${competencia.slice(4, 6)}` : ""}
                    onChange={(e) => e.target.value && setCompetencia(e.target.value.replace("-", ""))}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </label>
              </div>

              {parsed.avisos.length > 0 && (
                <ul className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  {parsed.avisos.map((a, i) => <li key={i}>• {a}</li>)}
                </ul>
              )}

              {/* Prévia */}
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  <strong className="text-foreground">{itens.length}</strong> procedimento(s){naoResolvidos > 0 && <> · <strong className="text-amber-700">{naoResolvidos}</strong> não resolvido(s) no SIGTAP (importados p/ revisão)</>}
                </p>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/60 text-left text-muted-foreground">
                      <tr><th className="px-2 py-1 font-medium">Código</th><th className="px-2 py-1 font-medium">Descrição</th><th className="px-2 py-1 text-right font-medium">Qtd</th><th className="px-2 py-1 text-right font-medium">Vlr unit.</th></tr>
                    </thead>
                    <tbody>
                      {itens.map((it) => (
                        <tr key={it.codigoFpo} className={`border-t border-border/50 ${!it.resolvido ? "bg-amber-50" : ""}`}>
                          <td className="px-2 py-1 font-mono">
                            {it.codigoFpo}{it.resolvido && <span className="text-[9px] text-muted-foreground"> → {it.procedimento}</span>}
                          </td>
                          <td className="px-2 py-1"><span className="line-clamp-1">{it.descricaoFpo}</span></td>
                          <td className="px-2 py-1 text-right tabular-nums">{int(it.qtdOrcada)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{brl(it.valorUnitario)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <button onClick={salvar} disabled={!cnesArquivo || !compValida || itens.length === 0 || salvando}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {salvando ? <><Loader2 className="size-4 animate-spin" /> Gravando…</> : <><Save className="size-4" /> Confirmar e importar {compValida ? `(${compLabel(competencia)})` : ""}</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
