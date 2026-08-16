import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Copy, Trash2, FileText, Save, Loader2, UserRound, AlertTriangle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useBpaIEngine, cells, loadState, type State } from "@/lib/bpa-i-v3/engine";
import { buscarEstabelecimentosPorNome } from "@/lib/bpa-i-v2/estabelecimentos";
import { buscarProfissionais, buscarCbosVinculo, type ProfissionalCache } from "@/lib/bpa-i-v2/profissionais";
import { buscarProcedimentosPorNome, buscarServClassDoProcedimento, type ServClassOpcao } from "@/lib/bpa-i-v2/procedimentos-sigtap";
import { PacienteSeqCard } from "@/components/bpa-i-v3/PacienteSeqCard";
import { useValidacaoProcedimento } from "@/lib/bpa-i-v2/use-validacao-procedimento";
import { useExigenciasSigtap } from "@/lib/bpa-i-v3/exigencias-sigtap";
import { motivosObrigatoriosSeq } from "@/lib/bpa-i-v3/obrigatorios";
import { seqPreenchida } from "@/lib/bpa-i-v2/bpa-magnetico";
import { buscarNomeServicoClasse, buscarNomeCid } from "@/lib/bpa-i-v2/nomes-sigtap";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";
import { souSuperAdmin } from "@/lib/permissoes";
import type { SeqData } from "@/lib/bpai-v2-layout";

export const Route = createFileRoute("/bpa-i-v4")({
  head: () => ({ meta: [{ title: "BPA-I" }] }),
  component: GateV4,
});

// ---- Gate: só "Dono do sistema" (super-admin). Checa ANTES de montar a tela; quem não é
// dono recebe o mesmo 404 de uma rota inexistente (não vaza que a tela existe). ----
function GateV4() {
  const [estado, setEstado] = useState<"checando" | "ok" | "nao">("checando");
  useEffect(() => { souSuperAdmin().then((ok) => setEstado(ok ? "ok" : "nao")); }, []);
  if (estado === "checando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }
  if (estado === "nao") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-2 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <Link to="/" className="mt-4 text-sm font-medium text-primary hover:underline">Voltar ao início</Link>
      </div>
    );
  }
  return <BpaIV4 />;
}

// Paleta da proposta: fundo branco-quente, azul-petróleo de saúde, mono nos códigos.
const TEAL = "oklch(0.56 0.17 258)";
const dig = (a: string[] | undefined) => (a ?? []).join("");

function BpaIV4() {
  const eng = useBpaIEngine({
    origemUi: "v4",
    storageKey: "bpa-i-v4-state-v1",
    fichaIdKey: "bpa-i-v4-ficha-id",
    fichaTituloKey: "bpa-i-v4-ficha-titulo",
  });
  const {
    state, setState, orgId, cboOpcoes, congelada, substituidaPor, retificar, retificando,
    fichaTitulo, temCamposInvalidos, motivosInvalidos, competencia, profCnsDig, profCboDig,
    onValidacaoChangeSeq, set, updateSeq, setHydrated, setFichaTitulo, refreshStatus,
    vincularPaciente, desvincularPaciente, reidratarPaciente, usarUltimoProc,
    adicionarSeq, duplicarUltimaSeq, removerSeq,
    reconciliarESalvar, checarDuplicidade, novaFicha,
    storageKey, fichaIdKey, fichaTituloKey,
    setCboOpcoes, estabAutoCnesRef, cnsResolvidoRef,
  } = eng;
  void checarDuplicidade;
  const cnesEstab = dig(state.cnes);

  // onPick do estabelecimento (nome → CNES): mesma lógica do V3.
  const escolherEstab = (e: { cnes: string; nome: string }) => {
    estabAutoCnesRef.current = e.cnes;
    set("nomeEstab", e.nome);
    set("cnes", cells(e.cnes, 7));
  };
  // onPick do profissional (nome → CNS + CBO do vínculo): mesma lógica do V3.
  const escolherProf = (p: { cns: string; nome: string }) => {
    cnsResolvidoRef.current = `${cnesEstab}:${p.cns}`;
    set("profNome", p.nome);
    set("profCns", cells(p.cns, 15));
    setCboOpcoes([]);
    buscarCbosVinculo(p.cns, cnesEstab).then((cbos) => {
      if (cbos.length === 1) set("profCbo", cells(cbos[0].codigo, 6));
      else if (cbos.length > 1) setCboOpcoes(cbos);
    });
  };

  const [salvando, setSalvando] = useState(false);
  const [visualizando, setVisualizando] = useState(false);

  // Montagem: carrega o rascunho/ficha persistida (chaves PRÓPRIAS do V4, isoladas do V3) e
  // LIBERA os efeitos do motor (folha automática, CNES→nome, CNS→nome/CBO, autosave) — todos
  // são gated por `hydrated`.
  useEffect(() => {
    setState(loadState(storageKey));
    try {
      eng.fichaIdRef.current = localStorage.getItem(fichaIdKey);
      eng.fichaTituloRef.current = localStorage.getItem(fichaTituloKey);
      setFichaTitulo(eng.fichaTituloRef.current);
    } catch { /* noop */ }
    refreshStatus(eng.fichaIdRef.current);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave já é do engine (localStorage). Aqui só a apresentação.
  const totalQtd = state.seqs.reduce((s, sq) => s + (Number(dig(sq.qtde)) || 0), 0);
  const nSeqsAtivas = state.seqs.filter(seqPreenchida).length;

  // Confirmação eletrônica do Responsável obrigatória para salvar e gerar o PDF.
  const semConfirmacao = !state.respConfirmacao;
  const exigirConfirmacao = (): boolean => {
    if (semConfirmacao) { toast.error("Confirme como Responsável (assinatura eletrônica) antes de salvar ou gerar o PDF."); return true; }
    return false;
  };

  const salvar = async (): Promise<string | null> => {
    if (congelada) { toast.error("Ficha congelada — reabra a produção ou retifique."); return null; }
    if (temCamposInvalidos) { toast.error("Corrija as pendências antes de salvar."); return null; }
    if (exigirConfirmacao()) return null;
    setSalvando(true);
    const titulo = fichaTitulo ?? `BPA-I · ${competencia()}`;
    const id = await reconciliarESalvar(titulo, eng.fichaIdRef.current);
    setSalvando(false);
    if (!id) { toast.error("Não foi possível salvar. Verifique a conexão."); return null; }
    toast.success("Ficha salva.");
    return id;
  };

  // PDF OFICIAL: salva e imprime pela rota de captura do V3 — o papel sai LITERALMENTE do V3
  // (prova de equivalência). Não reabre/destrava congelada (a captura só lê).
  const visualizarPdf = async () => {
    if (exigirConfirmacao()) return;
    setVisualizando(true);
    const id = eng.fichaIdRef.current ?? await salvar();
    setVisualizando(false);
    if (!id) return;
    window.open(`/imprimir?itens=I~${id}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-slate-800">
      {/* Top bar */}
      <div className="sticky top-[52px] z-30 border-b border-border bg-background/90 backdrop-blur md:top-0">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-slate-500 hover:text-slate-800"><ArrowLeft className="size-5" /></Link>
            <div>
              <div className="flex items-center gap-2 text-sm font-bold" style={{ color: TEAL }}>
                BPA-I <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">nova experiência</span>
              </div>
              <div className="text-[11px] text-slate-500">{fichaTitulo ?? "Rascunho"} · mesmo motor e mesmo arquivo do sistema atual</div>
            </div>
          </div>
          <button onClick={novaFicha} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Nova ficha</button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-5">
        {substituidaPor ? (
          <Aviso cor="slate">Esta ficha foi substituída por uma versão mais nova (retificação). <Link to="/bpa-i-v4" className="font-semibold underline">abrir vigente</Link></Aviso>
        ) : congelada ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <strong>Ficha congelada</strong> — produção fechada.
            <button onClick={retificar} disabled={retificando} className="ml-auto rounded-lg border border-sky-400 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60">{retificando ? "Retificando…" : "Retificar"}</button>
          </div>
        ) : null}

        {/* ===== Cabeçalho da folha ===== */}
        <section className="mb-5 rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">Estabelecimento e profissional</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="CNES">
              <input inputMode="numeric" value={dig(state.cnes)} onChange={(e) => set("cnes", cells(e.target.value.replace(/\D/g, ""), 7))}
                className={inputMono} maxLength={7} placeholder="0000000" />
            </Campo>
            <Campo label="Nome do estabelecimento" hint="digite p/ buscar, ou preenche pelo CNES">
              <CardAutocomplete value={state.nomeEstab} onChange={(v) => set("nomeEstab", v.toUpperCase())}
                busca={async (t) => (await buscarEstabelecimentosPorNome(t)).map((e) => ({ code: e.cnes, label: e.nome, sub: `CNES ${e.cnes}` }))}
                onPick={(it) => escolherEstab({ cnes: it.code, nome: it.label })} />
            </Campo>
            <Campo label="CNS do profissional">
              <input inputMode="numeric" value={dig(state.profCns)} onChange={(e) => set("profCns", cells(e.target.value.replace(/\D/g, ""), 15))}
                className={inputMono} maxLength={15} placeholder="000000000000000" />
            </Campo>
            <Campo label="Nome do profissional" hint={cnesEstab.length === 7 ? "digite p/ buscar, ou preenche pelo CNS" : "preencha o CNES primeiro"}>
              <CardAutocomplete value={state.profNome} onChange={(v) => set("profNome", v.toUpperCase())} disabled={cnesEstab.length !== 7}
                busca={async (t) => (await buscarProfissionais(cnesEstab, t)).map((p) => ({ code: p.cns, label: p.nome, sub: `CNS ${p.cns}` }))}
                onPick={(it) => escolherProf({ cns: it.code, nome: it.label })} />
            </Campo>
            <Campo label="CBO">
              <input inputMode="numeric" value={dig(state.profCbo)} onChange={(e) => set("profCbo", cells(e.target.value.replace(/\D/g, ""), 6))} className={inputMono} maxLength={6} />
              {cboOpcoes.length > 1 && (
                <select value={dig(state.profCbo)} onChange={(e) => set("profCbo", cells(e.target.value, 6))} className={`${input} mt-1`}>
                  <option value="">Escolha o CBO do vínculo…</option>
                  {cboOpcoes.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo}{c.descricao ? ` — ${c.descricao}` : ""}</option>)}
                </select>
              )}
            </Campo>
            <div className="grid grid-cols-3 gap-2">
              <Campo label="Mês"><input inputMode="numeric" value={dig(state.profMes)} onChange={(e) => set("profMes", cells(e.target.value.replace(/\D/g, ""), 2))} className={inputMono} maxLength={2} /></Campo>
              <Campo label="Ano"><input inputMode="numeric" value={dig(state.profAno)} onChange={(e) => set("profAno", cells(e.target.value.replace(/\D/g, ""), 4))} className={inputMono} maxLength={4} /></Campo>
              <Campo label="Folha" hint="auto/edit."><input inputMode="numeric" value={dig(state.profFolha)} onChange={(e) => set("profFolha", cells(e.target.value.replace(/\D/g, ""), 3))} className={inputMono} maxLength={3} /></Campo>
            </div>
          </div>
        </section>

        {/* ===== Sequências ===== */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Sequências ({state.seqs.length})</h2>
          <div className="flex gap-2">
            <button onClick={duplicarUltimaSeq} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"><Copy className="size-3.5" /> Duplicar última</button>
            <button onClick={adicionarSeq} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90" style={{ background: TEAL }}><Plus className="size-3.5" /> Nova sequência</button>
          </div>
        </div>

        <div className="space-y-4">
          {state.seqs.map((sq, si) => (
            <SeqCardV4
              key={si} si={si} seq={sq} orgId={orgId} profCnsDig={profCnsDig} profCboDig={profCboDig} travado={congelada}
              onUpdate={(field, value) => updateSeq(si, field, value)}
              onValidacao={(m) => onValidacaoChangeSeq(si, m)}
              onVincular={(p) => vincularPaciente(si, p)}
              onDesvincular={() => desvincularPaciente(si)}
              onReidratar={reidratarPaciente}
              onUsarUltimoProc={(f) => usarUltimoProc(si, f)}
              onRemover={state.seqs.length > 1 ? () => removerSeq(si) : undefined}
            />
          ))}
        </div>
      </div>

      {/* ===== Barra fixa: soma + pendências + ações ===== */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="text-sm">
            <span className="font-semibold text-slate-800">{totalQtd}</span> <span className="text-slate-500">procedimento(s) em</span> <span className="font-semibold text-slate-800">{nSeqsAtivas}</span> <span className="text-slate-500">sequência(s)</span>
          </div>
          {motivosInvalidos.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"><AlertTriangle className="size-3.5" /> {motivosInvalidos.length} pendência(s) antes de fechar a folha</span>
          ) : nSeqsAtivas > 0 ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">Sem pendências ✓</span>
          ) : null}
          <div className="ml-auto flex gap-2">
            <button onClick={visualizarPdf} disabled={visualizando || salvando} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
              {visualizando ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Visualizar PDF oficial
            </button>
            <button onClick={salvar} disabled={salvando || congelada} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ background: TEAL }}>
              {salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar ficha
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Um cartão de sequência (paciente reusa o PacienteSeqCard; procedimento é card novo) ----
function SeqCardV4(props: {
  si: number; seq: SeqData; orgId: string | null; profCnsDig: string; profCboDig: string; travado: boolean;
  onUpdate: <K extends keyof SeqData>(field: K, value: SeqData[K]) => void;
  onValidacao: (motivos: string[]) => void;
  onVincular: (p: import("@/lib/pacientes").Paciente) => void;
  onDesvincular: () => void;
  onReidratar: (p: import("@/lib/pacientes").Paciente) => void;
  onUsarUltimoProc: (f: import("@/lib/bpa-i-v3/paciente-seq").UltimoProcedimento) => void;
  onRemover?: () => void;
}) {
  const { si, seq: s, onUpdate: u } = props;
  const val = useValidacaoProcedimento(s);
  const exig = useExigenciasSigtap(dig(s.codProc));
  const ativa = seqPreenchida(s);
  const vinculado = Boolean(s.pacienteId);

  // Motivos de erro desta seq (mesma regra do V3) → reporta ao motor (barra de pendências).
  const motivos = useMemo(() => {
    const m = ativa ? motivosObrigatoriosSeq(s, exig) : [];
    return [...new Set([...m, ...val.motivos])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(s), exig.exigeServico, exig.exigeCid, val.motivos.join("|")]);
  useEffect(() => { props.onValidacao(motivos); /* eslint-disable-next-line */ }, [motivos.join("|")]);

  const [procBusca, setProcBusca] = useState(""); // busca de procedimento por nome
  // Nome do serviço/classe e CID (informativo).
  const [nomeSC, setNomeSC] = useState<string | null>(null);
  useEffect(() => {
    const sv = dig(s.servico), cl = dig(s.classProc);
    if (sv.length !== 3 || cl.length !== 3) { setNomeSC(null); return; }
    let cancel = false; buscarNomeServicoClasse(sv, cl).then((n) => { if (!cancel) setNomeSC(n); });
    return () => { cancel = true; };
  }, [s.servico, s.classProc]);

  // Auto-preenche Serviço/Classificação pelo procedimento (SIGTAP): uma combinação →
  // preenche; várias → seletor. Respeita serviço já preenchido (ficha carregada).
  const codProcSC = dig(s.codProc);
  const [servClassOpcoes, setServClassOpcoes] = useState<ServClassOpcao[]>([]);
  const servClassProcRef = useRef("");
  useEffect(() => {
    if (codProcSC.length !== 10) { setServClassOpcoes([]); return; }
    const anterior = servClassProcRef.current;
    if (anterior === codProcSC) return;
    const eraTroca = anterior.length === 10;
    servClassProcRef.current = codProcSC;
    setServClassOpcoes([]);
    buscarServClassDoProcedimento(codProcSC).then((combos) => {
      if (servClassProcRef.current !== codProcSC) return;
      const vazio = !dig(s.servico) && !dig(s.classProc);
      if (!vazio && !eraTroca) return;
      if (combos.length === 1) { u("servico", cells(combos[0].servico, 3)); u("classProc", cells(combos[0].classificacao, 3)); }
      else if (combos.length > 1) setServClassOpcoes(combos);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codProcSC]);
  const [nomeCid, setNomeCid] = useState<string | null>(null);
  useEffect(() => {
    const c = dig(s.cid).trim();
    if (c.length < 3) { setNomeCid(null); return; }
    let cancel = false; buscarNomeCid(c).then((n) => { if (!cancel) setNomeCid(n); });
    return () => { cancel = true; };
  }, [s.cid]);

  const dataAtendISO = (() => { const d = dig(s.dataAtend); return d.length === 8 ? `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}` : ""; })();
  const setDataAtend = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    u("dataAtend", m ? `${m[3]}${m[2]}${m[1]}`.split("") : Array(8).fill(""));
  };

  const erro = ativa && motivos.length > 0;
  return (
    <section className={`rounded-2xl border bg-white p-4 shadow-sm ${erro ? "border-amber-400" : "border-border"}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><UserRound className="size-3.5" /> Sequência {si + 1}</div>
        {props.onRemover && <button onClick={props.onRemover} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"><Trash2 className="size-3.5" /> Remover sequência</button>}
      </div>

      {/* Paciente (reusa o cartão do trilho: busca/cadastro, vincular, editar, trocar/remover) */}
      <div className="mb-3">
        <PacienteSeqCard
          si={si} seq={s} orgId={props.orgId} profCnsDig={props.profCnsDig} profCboDig={props.profCboDig} travado={props.travado} semCabecalho
          onVincular={props.onVincular} onDesvincular={props.onDesvincular} onReidratar={props.onReidratar} onUsarUltimoProc={props.onUsarUltimoProc}
        />
      </div>

      {/* Procedimento — só quando há paciente vinculado (fluxo da proposta). */}
      {vinculado && (
        <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50/70 p-3 sm:grid-cols-2">
          <Campo label="Procedimento (SIGTAP)" hint={val.proc?.nome ?? (val.procNaoEncontrado ? "não encontrado" : undefined)} erro={val.procNaoEncontrado}>
            <input inputMode="numeric" value={dig(s.codProc)} onChange={(e) => u("codProc", cells(e.target.value.replace(/\D/g, ""), 10))} className={inputMono} maxLength={10} placeholder="0000000000" />
            <CardAutocomplete value={procBusca} onChange={setProcBusca} minChars={3}
              busca={async (t) => (await buscarProcedimentosPorNome(t)).map((pp) => ({ code: pp.codigo, label: pp.nome, sub: pp.codigo }))}
              onPick={(it) => { u("codProc", cells(it.code, 10)); setProcBusca(""); }} />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Data atend." erro={val.idadeInvalida}><input type="date" value={dataAtendISO} onChange={(e) => setDataAtend(e.target.value)} className={input} /></Campo>
            <Campo label="Qtde" erro={val.qtdeInvalida}><input inputMode="numeric" value={dig(s.qtde)} onChange={(e) => u("qtde", cells(e.target.value.replace(/\D/g, ""), 3))} className={inputMono} maxLength={3} /></Campo>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Campo label={`Serviço${exig.exigeServico ? " *" : ""}`} erro={val.servicoInvalido}><input inputMode="numeric" value={dig(s.servico)} onChange={(e) => u("servico", cells(e.target.value.replace(/\D/g, ""), 3))} className={inputMono} maxLength={3} /></Campo>
            <Campo label="Classificação" erro={val.servicoInvalido}><input inputMode="numeric" value={dig(s.classProc)} onChange={(e) => u("classProc", cells(e.target.value.replace(/\D/g, ""), 3))} className={inputMono} maxLength={3} /></Campo>
            {servClassOpcoes.length > 1 && (
              <Campo label="Serviço/Classificação (escolha)">
                <select
                  value={servClassOpcoes.findIndex((o) => o.servico === dig(s.servico) && o.classificacao === dig(s.classProc))}
                  onChange={(e) => { const o = servClassOpcoes[Number(e.target.value)]; if (o) { u("servico", cells(o.servico, 3)); u("classProc", cells(o.classificacao, 3)); } }}
                  className={input}
                >
                  <option value={-1}>Escolha o da unidade…</option>
                  {servClassOpcoes.map((o, k) => <option key={k} value={k}>{o.label}</option>)}
                </select>
              </Campo>
            )}
          </div>
          {nomeSC && <div className="-mt-1 text-[11px] text-slate-500 sm:col-span-2">Serviço/Classe: {nomeSC}</div>}
          <Campo label={`CID${exig.exigeCid ? " *" : ""}`} hint={nomeCid ?? undefined} erro={val.cidInvalido}>
            <input value={dig(s.cid)} onChange={(e) => u("cid", cells(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""), 4))} className={inputMono} maxLength={4} placeholder="A000" />
          </Campo>
          <Campo label="Caráter de atendimento">
            <select value={dig(s.carater)} onChange={(e) => u("carater", cells(e.target.value, 2))} className={input}>
              <option value="">—</option>
              {CARATERES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
            </select>
          </Campo>
        </div>
      )}

      {erro && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-amber-700">
          {motivos.slice(0, 4).map((m, i) => <li key={i}>• {m}</li>)}
        </ul>
      )}
    </section>
  );
}

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const inputMono = input + " font-mono tracking-wide";

interface ItemAC { code: string; label: string; sub?: string }
// Autocomplete de card (reusa as MESMAS buscas do V3: estabelecimento/profissional por nome).
function CardAutocomplete(props: {
  value: string; onChange: (v: string) => void; disabled?: boolean; minChars?: number;
  busca: (termo: string) => Promise<ItemAC[]>;
  onPick: (it: ItemAC) => void;
}) {
  const [sug, setSug] = useState<ItemAC[]>([]);
  const [open, setOpen] = useState(false);
  const min = props.minChars ?? 2;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onInput = (v: string) => {
    props.onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (props.disabled || v.trim().length < min) { setSug([]); setOpen(false); return; }
    timer.current = setTimeout(async () => { const r = await props.busca(v.trim()); setSug(r); setOpen(r.length > 0); }, 220);
  };
  return (
    <div className="relative">
      <input value={props.value} disabled={props.disabled} onChange={(e) => onInput(e.target.value)}
        onFocus={() => { if (sug.length) setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={input + (props.disabled ? " bg-slate-50 text-slate-400" : "")} />
      {open && sug.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {sug.map((it) => (
            <button key={it.code} type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { props.onPick(it); setOpen(false); setSug([]); }}
              className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-50">
              <span className="text-sm font-medium text-slate-800">{it.label}</span>
              {it.sub && <span className="font-mono text-[11px] text-slate-400">{it.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Campo({ label, hint, erro, children }: { label: string; hint?: string; erro?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`mb-1 block text-[11px] font-medium ${erro ? "text-amber-700" : "text-slate-500"}`}>{label}{hint ? <span className="ml-1 font-normal text-slate-400">· {hint}</span> : null}</span>
      {children}
    </label>
  );
}

function Aviso({ cor, children }: { cor: "slate"; children: React.ReactNode }) {
  void cor;
  return <div className="mb-4 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">{children}</div>;
}
