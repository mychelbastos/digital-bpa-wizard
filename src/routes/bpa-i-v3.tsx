import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { registrarLeituraFicha } from "@/lib/producoes";
import { Snowflake, GitBranch } from "lucide-react";
import { exportSheetPdf, rasterizarFolhaJpeg } from "@/lib/export-pdf";
import bpaiBg from "@/assets/bpa-i.png";
import { DigitBoxes, TextField } from "@/components/DigitBoxes";
import { buscarCbosVinculo } from "@/lib/bpa-i-v2/profissionais";
import { ProfissionalAutocomplete } from "@/components/bpa-i-v2/ProfissionalAutocomplete";
import { EstabelecimentoAutocomplete } from "@/components/bpa-i-v2/EstabelecimentoAutocomplete";
import { FieldClear } from "@/components/bpa-i-v2/FieldClear";
import { SequenciaFields } from "@/components/bpa-i-v3/SequenciaFields";
import { ConfigModal } from "@/components/bpa-i-v2/ConfigModal";
import { MinhasFichas } from "@/components/bpa-i-v2/MinhasFichas";
import { SalvarFichaModal } from "@/components/bpa-i-v2/SalvarFichaModal";
import { carregarFicha } from "@/lib/bpa-i-v2/fichas";
import { type FichaDuplicada } from "@/lib/bpa-i-v2/folha-duplicidade";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/bpa-i-v2/ConfirmModal";
import { ConfirmarResponsavel } from "@/components/bpa-i-v2/ConfirmarResponsavel";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import { CboField } from "@/components/bpa-i-v3/CboField";
import * as L from "@/lib/bpai-v2-layout";
import { emptySeq, type SeqData } from "@/lib/bpai-v2-layout";
import {
  useBpaIEngine, initialState, normalizarSeqs3, loadState, cells,
  FICHA_ID_KEY, FICHA_TITULO_KEY, type State,
} from "@/lib/bpa-i-v3/engine";
import { PacienteSeqCard } from "@/components/bpa-i-v3/PacienteSeqCard";
import type { Paciente } from "@/lib/pacientes";

export const Route = createFileRoute("/bpa-i-v3")({
  head: () => ({
    meta: [
      { title: "BPA-I — Boletim Individualizado" },
      { name: "description", content: "Versão de teste do BPA-I com campo inteligente CPF/CNS (layout DATASUS 04.00). Mesma estrutura do BPA-I v2." },
    ],
  }),
  component: BpaI,
});

function BpaI() {
  // ===== MOTOR compartilhado (mesmo do V4). A tela abaixo é só apresentação. =====
  const eng = useBpaIEngine();
  const {
    state, setState, hydrated, setHydrated,
    orgId, cboOpcoes, setCboOpcoes,
    congelada, substituidaPor, refreshStatus, retificando, retificar,
    fichaIdRef, fichaTituloRef, fichaTitulo, setFichaTitulo,
    pdfPendente, setPdfPendente,
    errosSeq, onValidacaoChangeSeq,
    cnsProfInvalido, temSeqAtiva, motivosInvalidos, temCamposInvalidos,
    competencia, cnesEstab, profCnsDig, profCboDig,
    estabAutoCnesRef, cnsResolvidoRef,
    persistFicha, nomeSugerido: nomeSugeridoEng,
    set, updateSeq, repetirPaciente, prevTemPaciente,
    vincularPaciente, desvincularPaciente, reidratarPaciente, usarUltimoProc,
    checarDuplicidade, reconciliarESalvar, registrarExportacao,
    carregarFichaSalva: engCarregarFichaSalva, novaFicha,
  } = eng;
  void hydrated; void errosSeq;

  // ---- Estado só de UI (fica na tela; o V4 tem a própria apresentação) ----
  const [printing, setPrinting] = useState(false);
  const [zerarSeqsOpen, setZerarSeqsOpen] = useState(false);
  const [novaFichaOpen, setNovaFichaOpen] = useState(false);
  const [manterProf, setManterProf] = useState(true);
  const [zerarTudoOpen, setZerarTudoOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<State | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [fichasOpen, setFichasOpen] = useState(false);
  const [salvarOpen, setSalvarOpen] = useState(false);
  const [salvarComoNovo, setSalvarComoNovo] = useState(false);
  const [salvarMenuOpen, setSalvarMenuOpen] = useState(false);
  const [salvandoDireto, setSalvandoDireto] = useState(false);
  const [dupModal, setDupModal] = useState<{ dup: FichaDuplicada; prosseguir: () => void } | null>(null);
  const user = useAuthUser();
  const sheetRef = useRef<HTMLDivElement>(null);
  const autoPrintRef = useRef(false);
  const capturaRef = useRef(false);
  const [prontoImprimir, setProntoImprimir] = useState(false);
  // Registro das caixinhas por id, p/ auto-avanço contínuo entre campos vizinhos.
  const boxRefs = useRef<Record<string, HTMLInputElement[]>>({});
  const regBox = (key: string) => (els: HTMLInputElement[]) => { boxRefs.current[key] = els; };
  const focusBox = (key: string) => boxRefs.current[key]?.[0]?.focus();
  const inputsOf = (...keys: string[]) => keys.flatMap((k) => boxRefs.current[k] ?? []);
  const endOf = (arr: { left: number; width: number }[]) => arr[arr.length - 1].left + arr[arr.length - 1].width;

  // Montagem: captura (?capture=1), impressão (?print=1), ficha (?ficha=id) ou localStorage.
  useEffect(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const fichaParam = params?.get("ficha") ?? null;
    autoPrintRef.current = params?.get("print") === "1";
    capturaRef.current = params?.get("capture") === "1";
    if (fichaParam && capturaRef.current) {
      carregarParaCaptura(fichaParam);
    } else if (fichaParam) {
      engCarregarFichaSalva(fichaParam).then((ok) => { if (ok && autoPrintRef.current) setProntoImprimir(true); });
    } else {
      setState(loadState());
      try {
        fichaIdRef.current = localStorage.getItem(FICHA_ID_KEY);
        fichaTituloRef.current = localStorage.getItem(FICHA_TITULO_KEY);
        setFichaTitulo(fichaTituloRef.current);
      } catch { /* noop */ }
      refreshStatus(fichaIdRef.current);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abrir ficha salva (Minhas fichas) — sem auto-print.
  const carregarFichaSalva = (id: string, titulo?: string) => { void engCarregarFichaSalva(id, titulo); };
  // Nome sugerido ao salvar (depende do modo "Salvar como" da UI).
  const nomeSugerido = () => nomeSugeridoEng(salvarComoNovo);

  // ---- Save (orquestração de diálogo; chama as primitivas do engine) ----
  const gravarNaNuvem = async (titulo: string) => {
    const idAlvo = salvarComoNovo ? null : fichaIdRef.current;
    const id = await reconciliarESalvar(titulo, idAlvo);
    if (!id) { toast.error("Não foi possível salvar. Verifique sua conexão e tente novamente."); return; }
    const atualizou = Boolean(idAlvo);
    setSalvarOpen(false);
    setSalvarComoNovo(false);
    toast.success(atualizou ? "Alterações salvas na nuvem." : `Ficha “${titulo}” salva na nuvem.`);
  };
  const salvarNaNuvem = async (titulo: string) => {
    const dup = await checarDuplicidade(salvarComoNovo ? null : fichaIdRef.current);
    if (dup) {
      setSalvarOpen(false);
      setDupModal({ dup, prosseguir: () => { setDupModal(null); void gravarNaNuvem(titulo); } });
      return;
    }
    await gravarNaNuvem(titulo);
  };
  const gravarNaFichaAtual = async () => {
    setSalvandoDireto(true);
    const id = await reconciliarESalvar(fichaTituloRef.current!, fichaIdRef.current);
    setSalvandoDireto(false);
    if (!id) { toast.error("Não foi possível salvar. Verifique sua conexão e tente novamente."); return; }
    toast.success("Alterações salvas na nuvem.");
  };
  // Confirmação eletrônica do Responsável obrigatória para salvar e gerar o PDF.
  const semConfirmacao = !state.respConfirmacao;
  const exigirConfirmacao = (): boolean => {
    if (semConfirmacao) { toast.error("Confirme como Responsável (assinatura eletrônica) antes de salvar ou gerar o PDF."); return true; }
    return false;
  };
  const salvarClique = async () => {
    if (congelada) { toast.error("Ficha congelada (produção fechada). Reabra a produção ou retifique para alterar."); return; }
    if (temCamposInvalidos) { toast.error("Corrija os campos em vermelho antes de salvar a ficha."); return; }
    if (exigirConfirmacao()) return;
    if (!fichaIdRef.current || !fichaTituloRef.current) { setSalvarComoNovo(false); setSalvarOpen(true); return; }
    const dup = await checarDuplicidade(fichaIdRef.current);
    if (dup) { setDupModal({ dup, prosseguir: () => { setDupModal(null); void gravarNaFichaAtual(); } }); return; }
    await gravarNaFichaAtual();
  };
  const salvarComoClique = () => {
    if (temCamposInvalidos) { toast.error("Corrija os campos em vermelho antes de salvar a ficha."); return; }
    if (exigirConfirmacao()) return;
    setSalvarComoNovo(true);
    setSalvarOpen(true);
    setSalvarMenuOpen(false);
  };
  // "Gerar PDF" interativo — exige a confirmação; o auto-print (?print=1) não passa por aqui.
  const gerarPdfClique = () => { if (exigirConfirmacao()) return; void exportPdf(); };

  // ---- Captura (iframe de /imprimir): só lê + rasteriza, sem persistir ----
  const carregarParaCaptura = async (id: string) => {
    const ficha = await carregarFicha(id);
    if (!ficha) { avisarCapturaFalhou(id, "ficha não encontrada"); return; }
    const merged = { ...initialState(), ...(ficha.dados as Partial<State>) };
    merged.seqs = normalizarSeqs3(merged.seqs);
    fichaIdRef.current = id;
    setState(merged);
    setProntoImprimir(true);
  };
  const avisarCapturaFalhou = (id: string, erro: string) => {
    try { window.parent?.postMessage({ tipo: "bpa-captura", ficha: id, erro }, window.location.origin); } catch { /* noop */ }
  };
  const capturarEEnviar = async () => {
    if (!sheetRef.current) return avisarCapturaFalhou(fichaIdRef.current ?? "", "sem folha");
    setPrinting(true);
    await new Promise((r) => setTimeout(r, 80));
    try {
      await document.fonts?.ready;
      const folhas = Array.from(document.querySelectorAll<HTMLElement>(".form-sheet"));
      const alvos = folhas.length ? folhas : [sheetRef.current];
      const imgs: string[] = [];
      for (const el of alvos) imgs.push(await rasterizarFolhaJpeg(el));
      if (fichaIdRef.current) registrarLeituraFicha(fichaIdRef.current, "impressao");
      try { window.parent?.postMessage({ tipo: "bpa-captura", ficha: fichaIdRef.current, imgs }, window.location.origin); } catch { /* noop */ }
    } catch (err) {
      avisarCapturaFalhou(fichaIdRef.current ?? "", err instanceof Error ? err.message : "falha ao rasterizar");
    } finally { setPrinting(false); }
  };

  // Fonte cursiva (Caveat) da "assinatura" do Responsável — injetada uma vez.
  useEffect(() => {
    if (document.getElementById("bpa-v2-fonte-assinatura")) return;
    const link = document.createElement("link");
    link.id = "bpa-v2-fonte-assinatura";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&display=swap";
    document.head.appendChild(link);
  }, []);

  // ---- Zerar / desfazer (só UI) ----
  const clearSeqs = () => { setManterProf(true); setZerarSeqsOpen(true); };
  const confirmarZerarSeqs = () => {
    setSnapshot(state);
    setState((p) => ({
      ...p,
      seqs: [emptySeq(), emptySeq(), emptySeq()],
      ...(manterProf ? {} : { profNome: "", profCns: Array(15).fill(""), profCbo: Array(6).fill("") }),
    }));
    if (!manterProf) setCboOpcoes([]);
    setZerarSeqsOpen(false);
  };
  const clearAll = () => setZerarTudoOpen(true);
  const confirmarZerarTudo = () => {
    setSnapshot(state);
    setState(initialState());
    setCboOpcoes([]);
    setZerarTudoOpen(false);
  };
  const restaurarProfissional = () => {
    if (!snapshot) return;
    setState((p) => ({
      ...p,
      cnes: snapshot.cnes, nomeEstab: snapshot.nomeEstab,
      profCns: snapshot.profCns, profNome: snapshot.profNome, profCbo: snapshot.profCbo,
      profMes: snapshot.profMes, profAno: snapshot.profAno, profEquipe: snapshot.profEquipe, profFolha: snapshot.profFolha,
    }));
    setUndoOpen(false);
  };
  const restaurarTudo = () => {
    if (!snapshot) return;
    setState(snapshot);
    setUndoOpen(false);
  };

  // ---- PDF oficial (rasteriza a folha do V3) ----
  const exportPdf = async () => {
    if (temCamposInvalidos) { toast.error("Corrija os campos em vermelho antes de gerar o PDF."); return; }
    if (!sheetRef.current) return;
    setPrinting(true);
    await new Promise((r) => setTimeout(r, 80));
    try {
      await document.fonts?.ready;
      await exportSheetPdf(sheetRef.current, "BPA-I.pdf");
      setPdfPendente(false); // PDF gerado p/ o estado atual
      if (fichaIdRef.current) registrarLeituraFicha(fichaIdRef.current, "impressao");
      await registrarExportacao();
    } catch (err) {
      console.error("PDF export failed", err);
      alert("Falha ao gerar PDF. Veja o console.");
    } finally { setPrinting(false); }
  };

  // Auto-impressão / captura: dispara após a folha carregar.
  useEffect(() => {
    if (!prontoImprimir) return;
    setProntoImprimir(false);
    (async () => {
      await new Promise((r) => setTimeout(r, 350));
      if (capturaRef.current) await capturarEEnviar();
      else await exportPdf();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prontoImprimir]);

  // Tem conteúdo preenchido que valha avisar antes de zerar?
  const temConteudo =
    state.nomeEstab.trim() !== "" ||
    state.cnes.some(Boolean) ||
    state.profNome.trim() !== "" ||
    state.profCns.some(Boolean) ||
    state.seqs.some((s) => s.nomePac.trim() !== "" || s.cnsPac.some(Boolean) || s.codProc.some(Boolean) || s.cep.some(Boolean));
  const avisarPdf = pdfPendente && temConteudo;

  // Campo Data do rodapé: dia/mês/ano (3 grupos de dígitos) entre as barras impressas.
  type DataField = "respData" | "gestData";
  const renderData = (campo: DataField, dia: typeof L.RESP_DATA_DIA, mes: typeof L.RESP_DATA_MES, ano: typeof L.RESP_DATA_ANO) => {
    const vals = state[campo];
    const setPart = (start: number, part: string[]) => {
      const next = [...vals];
      for (let i = 0; i < part.length; i++) next[start + i] = part[i] ?? "";
      set(campo, next);
    };
    return (
      <>
        <DigitBoxes id={`${campo}-d`} top={L.DATA_TOP} height={L.DATA_H} boxes={dia} values={vals.slice(0, 2)} onChange={(v) => setPart(0, v)} compact />
        <DigitBoxes id={`${campo}-m`} top={L.DATA_TOP} height={L.DATA_H} boxes={mes} values={vals.slice(2, 4)} onChange={(v) => setPart(2, v)} compact />
        <DigitBoxes id={`${campo}-a`} top={L.DATA_TOP} height={L.DATA_H} boxes={ano} values={vals.slice(4, 8)} onChange={(v) => setPart(4, v)} compact />
      </>
    );
  };
  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <ConfirmModal
        open={novaFichaOpen}
        title="Nova ficha"
        confirmLabel="Começar nova ficha"
        onCancel={() => setNovaFichaOpen(false)}
        onConfirm={() => { setNovaFichaOpen(false); novaFicha(); }}
      >
        Começar uma nova ficha em branco? Alterações não salvas serão perdidas.
      </ConfirmModal>

      <ConfirmModal
        open={Boolean(dupModal)}
        title="Ficha duplicada"
        confirmLabel="Salvar mesmo assim"
        onCancel={() => setDupModal(null)}
        onConfirm={() => dupModal?.prosseguir()}
      >
        <p>Já existe uma ficha <strong>idêntica</strong> salva (mesmo profissional, competência e produção):</p>
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{dupModal?.dup.titulo}</p>
        <p className="mt-2 text-sm text-muted-foreground">Salvar assim mesmo cria uma duplicata. Cancele se não for isso que você quer.</p>
      </ConfirmModal>

      <ConfirmModal
        open={zerarSeqsOpen}
        title="Zerar sequências"
        confirmLabel="Zerar sequências"
        onCancel={() => setZerarSeqsOpen(false)}
        onConfirm={confirmarZerarSeqs}
      >
        <p>Isto vai apagar os pacientes e procedimentos das 3 sequências.</p>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-primary,#1e3a8a)]"
            checked={manterProf}
            onChange={(e) => setManterProf(e.target.checked)}
          />
          Manter o mesmo profissional (Nome, CNS e CBO)
        </label>
      </ConfirmModal>

      <ConfirmModal
        open={zerarTudoOpen}
        title="Zerar tudo"
        confirmLabel="Zerar tudo"
        danger
        onCancel={() => setZerarTudoOpen(false)}
        onConfirm={confirmarZerarTudo}
      >
        <p>Isto vai apagar <strong>todas</strong> as informações do formulário (estabelecimento, profissional e as 3 sequências).</p>
        {avisarPdf && (
          <p className="mt-3 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 font-medium text-amber-900">
            ⚠️ Você ainda <strong>não gerou o PDF</strong> desta ficha. Se zerar agora, os dados serão perdidos sem o PDF. Deseja continuar mesmo assim?
          </p>
        )}
      </ConfirmModal>

      <header className="sticky top-[52px] z-30 border-b bg-background/95 backdrop-blur md:top-0">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
            <h1 className="max-w-[46vw] truncate text-base font-semibold" title={fichaTitulo ?? undefined}>
              {fichaTitulo || "Nova ficha"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-sky-100 px-2 py-1 text-xs font-bold tracking-wide text-sky-700">BPA-I</span>
            {user && (
              <div className="group relative flex">
                <button
                  onClick={salvarClique}
                  disabled={salvandoDireto || congelada}
                  title={congelada ? "Ficha congelada — reabra a produção ou retifique" : semConfirmacao ? "Confirme como Responsável antes de salvar" : temCamposInvalidos ? "Corrija os campos em vermelho antes de salvar" : fichaTituloRef.current ? "Salvar alterações nesta ficha" : "Salvar esta ficha na sua conta (nuvem)"}
                  className={`rounded-l-md border border-r-0 border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60${temCamposInvalidos || congelada || semConfirmacao ? " opacity-50" : ""}`}
                >
                  {salvandoDireto ? "Salvando…" : `💾 Salvar${fichaTituloRef.current ? "" : " ficha"}`}
                </button>
                <button
                  type="button"
                  onClick={() => setSalvarMenuOpen((o) => !o)}
                  title="Mais opções de salvar"
                  className="rounded-r-md border border-primary/40 bg-primary/5 px-1.5 py-2 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  ▾
                </button>
                {salvarMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setSalvarMenuOpen(false)} />
                    <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-md border border-border bg-background py-1 text-xs shadow-lg">
                      <button type="button" onClick={salvarComoClique} className="block w-full px-3 py-2 text-left hover:bg-muted">
                        Salvar como… <span className="text-muted-foreground">(nova cópia)</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {user && (
              <button onClick={() => setNovaFichaOpen(true)} title="Começar uma ficha em branco" className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
                ➕ Nova ficha
              </button>
            )}
            {state.respConfirmacao && (
              <button onClick={() => set("respConfirmacao", null)} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100">
                Desfazer confirmação
              </button>
            )}
            <div className="group relative">
              <button
                type="button"
                title="Opções de limpeza"
                className="flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 group-focus-within:bg-destructive/10"
              >
                🗑 Zerar <span aria-hidden className="text-[10px]">▾</span>
              </button>
              {/* pt-1 faz "ponte" p/ o hover não cair no vão entre botão e menu */}
              <div className="invisible absolute right-0 top-full z-50 pt-1 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <div className="w-56 overflow-hidden rounded-md border border-border bg-background py-1 text-xs shadow-lg">
                  <button type="button" onClick={clearSeqs} className="block w-full px-3 py-2 text-left hover:bg-muted">
                    Zerar sequências <span className="text-muted-foreground">(mantém o cabeçalho)</span>
                  </button>
                  <button type="button" onClick={clearAll} className="block w-full px-3 py-2 text-left text-destructive hover:bg-destructive/10">
                    Zerar tudo <span className="opacity-70">(apaga o formulário inteiro)</span>
                  </button>
                </div>
              </div>
            </div>
            {snapshot && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUndoOpen((o) => !o)}
                  title="Desfazer a última limpeza"
                  className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-2 text-xs font-medium hover:bg-muted"
                >
                  <span aria-hidden>↩︎</span> Desfazer <span aria-hidden className="text-[10px]">▾</span>
                </button>
                {undoOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUndoOpen(false)} />
                    <div className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-md border border-border bg-background py-1 text-xs shadow-lg">
                      <button type="button" onClick={restaurarProfissional} className="block w-full px-3 py-2 text-left hover:bg-muted">
                        Restaurar profissional + CNES
                      </button>
                      <button type="button" onClick={restaurarTudo} className="block w-full px-3 py-2 text-left hover:bg-muted">
                        Restaurar tudo que estava preenchido
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <button onClick={() => setConfigOpen(true)} title="Configuração do estabelecimento (arquivo magnético)" className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
              ⚙ Config
            </button>
            <button onClick={gerarPdfClique} disabled={printing} title={semConfirmacao ? "Confirme como Responsável antes de gerar" : temCamposInvalidos ? "Corrija os campos em vermelho antes de gerar" : undefined} className={`rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60${temCamposInvalidos || semConfirmacao ? " opacity-50" : ""}`}>
              {printing ? "Gerando..." : "Gerar PDF"}
            </button>
          </div>
        </div>
        {temCamposInvalidos && (
          <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800">
            <div className="mx-auto max-w-[1100px]">
              <p className="font-semibold">
                {motivosInvalidos.length === 1 ? "1 campo em vermelho" : `${motivosInvalidos.length} campos em vermelho`} — corrija antes de salvar a ficha ou gerar o PDF:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {motivosInvalidos.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          </div>
        )}
      </header>

      <ConfigModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
      />

      <SalvarFichaModal
        open={salvarOpen}
        defaultNome={nomeSugerido()}
        atualizando={!salvarComoNovo && Boolean(fichaIdRef.current)}
        comoNovo={salvarComoNovo}
        onSalvar={salvarNaNuvem}
        onClose={() => { setSalvarOpen(false); setSalvarComoNovo(false); }}
      />

      <MinhasFichas
        open={fichasOpen}
        fichaAtualId={fichaIdRef.current}
        onClose={() => setFichasOpen(false)}
        onCarregar={carregarFichaSalva}
        onNova={novaFicha}
        onRenomeada={persistFicha}
      />

      <main className="mx-auto mt-4 max-w-[1400px] px-4">
        {substituidaPor ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <GitBranch className="size-4 shrink-0" />
            Esta ficha foi <strong>substituída por uma versão mais nova</strong> (retificação). Ela permanece só como histórico.
            <a href={`/bpa-i-v3?ficha=${substituidaPor}`} className="font-semibold text-primary hover:underline">Abrir a versão vigente →</a>
          </div>
        ) : congelada ? (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            <Snowflake className="size-4 shrink-0" />
            <span><strong>Ficha congelada</strong> — a produção deste mês foi fechada. Para corrigir: reabra a produção (em Fechamento) ou emita uma <strong>retificação</strong> (nova versão).</span>
            <button onClick={retificar} disabled={retificando} className="ml-auto inline-flex items-center gap-1 rounded-md border border-sky-400 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60">
              <GitBranch className="size-3.5" /> {retificando ? "Retificando…" : "Retificar (nova versão)"}
            </button>
          </div>
        ) : null}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="lg:min-w-0 lg:flex-1">
        <div ref={sheetRef} className={`form-sheet ${printing ? "form-sheet--print" : ""}`} style={{ aspectRatio: "1653 / 2339" }}>
          <img src={bpaiBg} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />

          {/* Header */}
          <EstabelecimentoAutocomplete
            uppercase
            {...L.NOME_ESTAB}
            nome={state.nomeEstab}
            onChangeNome={(v) =>
              // Edição manual do Nome: se havia um CNES preenchido, os dois passam a
              // divergir -> limpa o CNES (silenciosamente). Nome digitado deixa de ser "auto".
              setState((prev) => {
                const tinhaCnes = prev.cnes.some(Boolean);
                if (tinhaCnes) estabAutoCnesRef.current = "";
                return { ...prev, nomeEstab: v, cnes: tinhaCnes ? Array(7).fill("") : prev.cnes };
              })
            }
            onPick={(e) => {
              // Escolha na lista (nome -> CNES): preenche ambos de forma consistente.
              estabAutoCnesRef.current = e.cnes;
              setState((prev) => ({ ...prev, nomeEstab: e.nome, cnes: cells(e.cnes, 7) }));
            }}
          />
          <DigitBoxes id="cnes" top={L.CNES_TOP} height={L.HEADER_DIGIT_H} boxes={L.CNES_BOXES} values={state.cnes} onChange={(v) => set("cnes", v)} clearable compact />

          {/* Profissional */}
          <DigitBoxes id="pcns" top={L.PROF_CNS_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_CNS_BOXES} values={state.profCns} onChange={(v) => set("profCns", v)} invalid={cnsProfInvalido} title="CNS inválido (dígito verificador não confere)." clearable compact />
          <ProfissionalAutocomplete
            uppercase
            cnes={cnesEstab}
            top={L.PROF_NOME.top} left={L.PROF_NOME.left} width={L.PROF_NOME.width} height={L.PROF_NOME.height}
            nome={state.profNome}
            onChangeNome={(v) => set("profNome", v)}
            onPick={(p) => {
              // Nome -> CNS: escolher no autocomplete preenche o CNS. Marca como resolvido p/
              // o efeito CNS->nome não repetir a busca de CBO abaixo.
              cnsResolvidoRef.current = `${cnesEstab}:${p.cns}`;
              setState((prev) => ({ ...prev, profNome: p.nome, profCns: cells(p.cns, 15) }));
              setCboOpcoes([]);
              // CBO do vínculo NESTE estabelecimento (CNS + CNES).
              buscarCbosVinculo(p.cns, cnesEstab).then((cbos) => {
                if (cbos.length === 1) {
                  setState((prev) => ({ ...prev, profCbo: cells(cbos[0].codigo, 6) }));
                } else if (cbos.length > 1) {
                  setCboOpcoes(cbos); // mostra o seletor p/ a pessoa escolher
                }
                // 0 -> deixa em branco p/ digitação manual
              });
            }}
          />
          <CboField id="pcbo" top={L.PROF_ROW2_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_CBO_BOXES} values={state.profCbo} onChange={(v) => set("profCbo", v)} clearable />
          {cboOpcoes.length > 1 && (
            <div
              className="absolute z-[70]"
              style={{ top: `calc(${L.PROF_ROW2_TOP + L.HEADER_DIGIT_H}% + 2px)`, left: `${L.PROF_CBO_BOXES[0].left}%` }}
            >
              <ul className="min-w-[300px] overflow-hidden rounded-md border border-amber-300 bg-white text-sm shadow-lg">
                <li className="flex items-center justify-between bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                  Este profissional tem mais de um CBO aqui — escolha:
                  <button type="button" className="ml-2 text-amber-700 hover:underline" onMouseDown={(e) => { e.preventDefault(); setCboOpcoes([]); }}>fechar</button>
                </li>
                {cboOpcoes.map((c) => (
                  <li
                    key={c.codigo}
                    className="cursor-pointer px-3 py-1.5 hover:bg-primary/10"
                    onMouseDown={(e) => { e.preventDefault(); set("profCbo", cells(c.codigo, 6)); setCboOpcoes([]); }}
                  >
                    <span className="font-mono">{c.codigo}</span> — {c.descricao}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DigitBoxes id="pmes" top={L.PROF_ROW2_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_MES_BOXES} values={state.profMes} onChange={(v) => set("profMes", v)} registerRefs={regBox("pmes")} onComplete={() => focusBox("pano")} compact />
          <DigitBoxes id="pano" top={L.PROF_ROW2_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_ANO_BOXES} values={state.profAno} onChange={(v) => set("profAno", v)} registerRefs={regBox("pano")} compact />
          <FieldClear top={L.PROF_ROW2_TOP} left={endOf(L.PROF_ANO_BOXES) + 0.5} height={L.HEADER_DIGIT_H}
            getInputs={() => inputsOf("pmes", "pano")}
            onClear={() => setState((p) => ({ ...p, profMes: Array(2).fill(""), profAno: Array(4).fill("") }))} />
          <TextField {...L.PROF_EQUIPE} value={state.profEquipe} onChange={(v) => set("profEquipe", v)} uppercase />
          {/* Folha: automática (sequência por profissional/unidade + competência) e editável —
              é organizacional (não vai para o .txt); dá pra ajustar à mão se precisar. */}
          <DigitBoxes id="pfolha" top={L.PROF_ROW2_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_FOLHA_BOXES} values={state.profFolha} onChange={(v) => set("profFolha", v)} rightAlign compact />

          {/* 3 Sequências */}
          {L.SEQ_TOPS.map((seqTop, si) => (
            <SequenciaFields
              key={si}
              si={si}
              seqTop={seqTop}
              s={state.seqs[si]}
              profMes={state.profMes}
              profAno={state.profAno}
              hydrated={hydrated}
              onUpdate={(field, value) => updateSeq(si, field, value)}
              regBox={regBox}
              focusBox={focusBox}
              inputsOf={inputsOf}
              endOf={endOf}
              onValidacaoChange={onValidacaoChangeSeq}
              onRepetirPaciente={prevTemPaciente(si) ? () => repetirPaciente(si) : undefined}
              identidadeTravada={Boolean(state.seqs[si].pacienteId)}
              orgId={orgId}
              onVincularPaciente={(p) => vincularPaciente(si, p)}
            />
          ))}

          {/* Footer — responsável + gestor */}
          <ConfirmarResponsavel
            pos={L.RESP_CONFIRM}
            user={user}
            cnesEstab={cnesEstab}
            confirmacao={state.respConfirmacao}
            onConfirmado={(c) => set("respConfirmacao", c)}
            getSnapshot={() => ({ ...state, respConfirmacao: undefined })}
          />
          {renderData("respData", L.RESP_DATA_DIA, L.RESP_DATA_MES, L.RESP_DATA_ANO)}
          <TextField {...L.GEST_CARIMBO} value={state.gestCarimbo} onChange={(v) => set("gestCarimbo", v)} uppercase />
          <TextField {...L.GEST_RUBRICA} value={state.gestRubrica} onChange={(v) => set("gestRubrica", v)} uppercase />
          {renderData("gestData", L.GEST_DATA_DIA, L.GEST_DATA_MES, L.GEST_DATA_ANO)}
        </div>
        </div>
        {!capturaRef.current && (
          <aside className="lg:w-72 lg:shrink-0">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pacientes por sequência</div>
            <div className="space-y-3">
              {L.SEQ_TOPS.map((_, si) => (
                <PacienteSeqCard key={si} si={si} seq={state.seqs[si]} orgId={orgId}
                  profCnsDig={profCnsDig} profCboDig={profCboDig} travado={congelada}
                  onVincular={(p) => vincularPaciente(si, p)} onDesvincular={() => desvincularPaciente(si)}
                  onReidratar={reidratarPaciente} onUsarUltimoProc={(f) => usarUltimoProc(si, f)} />
              ))}
            </div>
          </aside>
        )}
        </div>
      </main>
    </div>
  );
}
