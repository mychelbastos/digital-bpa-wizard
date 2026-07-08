import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { exportSheetPdf } from "@/lib/export-pdf";
import bpaiBg from "@/assets/bpa-i.png";
import { DigitBoxes, TextField } from "@/components/DigitBoxes";
import { ComboField } from "@/components/bpa-i-v2/ComboField";
import { RACAS, RACA_INDIGENA } from "@/lib/bpa-i-v2/racas";
import { ETNIAS } from "@/lib/bpa-i-v2/etnias";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";
import { NACIONALIDADES } from "@/lib/bpa-i-v2/nacionalidades";
import { TIPOS_LOGRADOURO } from "@/lib/bpa-i-v2/tipos-logradouro";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { sincronizarProfissionais, buscarCbosVinculo, type CboVinculo } from "@/lib/bpa-i-v2/profissionais";
import { ProfissionalAutocomplete } from "@/components/bpa-i-v2/ProfissionalAutocomplete";
import { EstabelecimentoAutocomplete } from "@/components/bpa-i-v2/EstabelecimentoAutocomplete";
import { FieldClear } from "@/components/bpa-i-v2/FieldClear";
import { cnsInvalido, dataFuturaOuInvalida, atendimentoAntigo } from "@/lib/bpa-i-v2/validacao";
import { AtendimentoAntigoAviso } from "@/components/bpa-i-v2/AtendimentoAntigoAviso";
import { ConfigModal } from "@/components/bpa-i-v2/ConfigModal";
import { loadConfig, configCompleta } from "@/lib/bpa-i-v2/config";
import { gerarArquivoBpa, seqPreenchida } from "@/lib/bpa-i-v2/bpa-magnetico";
import { baixarTxt } from "@/lib/export-txt";
import { MinhasFichas } from "@/components/bpa-i-v2/MinhasFichas";
import { SalvarFichaModal } from "@/components/bpa-i-v2/SalvarFichaModal";
import { salvarFicha, carregarFicha } from "@/lib/bpa-i-v2/fichas";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/bpa-i-v2/ConfirmModal";
import { LoginControl } from "@/components/bpa-i-v2/LoginControl";
import { ConfirmarResponsavel } from "@/components/bpa-i-v2/ConfirmarResponsavel";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import type { Confirmacao } from "@/lib/bpa-i-v2/confirmacao";
import { HistoricoField } from "@/components/bpa-i-v2/HistoricoField";
import { ProcedimentoField } from "@/components/bpa-i-v2/ProcedimentoField";
import { registrarUso } from "@/lib/bpa-i-v2/historico";
import { buscarProcedimentoSigtap } from "@/lib/bpa-i-v2/procedimentos-sigtap";
import * as L from "@/lib/bpai-v2-layout";
import { emptySeq, type SeqData } from "@/lib/bpai-v2-layout";

export const Route = createFileRoute("/bpa-i-v2")({
  head: () => ({
    meta: [
      { title: "BPA-I v2 (beta) — Boletim de Produção Ambulatorial Individualizado" },
      { name: "description", content: "Preencha digitalmente o formulário BPA-I do Ministério da Saúde com layout pixel-perfect e exportação em PDF." },
    ],
  }),
  component: BpaI,
});

const STORAGE_KEY = "bpa-i-v2-state-v5";

interface State {
  nomeEstab: string;
  cnes: string[];
  profCns: string[];
  profNome: string;
  profCbo: string[];
  profMes: string[];
  profAno: string[];
  profEquipe: string;
  profFolha: string[];
  seqs: SeqData[];
  respConfirmacao: Confirmacao | null;
  respData: string[];
  gestCarimbo: string;
  gestRubrica: string;
  gestData: string[];
}

// Mês/Ano da competência atual (preenchidos por padrão; o usuário pode alterar).
const competenciaAtual = () => {
  const agora = new Date();
  return {
    mes: String(agora.getMonth() + 1).padStart(2, "0").split(""),
    ano: String(agora.getFullYear()).padStart(4, "0").split(""),
  };
};

// Data de hoje como 8 dígitos [D,D,M,M,A,A,A,A] — pré-preenche o campo Data do rodapé.
const hojeDigits = (): string[] => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = String(d.getFullYear()).padStart(4, "0");
  return `${dd}${mm}${aaaa}`.split("");
};

const initialState = (): State => ({
  nomeEstab: "",
  cnes: Array(7).fill(""),
  profCns: Array(15).fill(""),
  profNome: "",
  profCbo: Array(6).fill(""),
  profMes: competenciaAtual().mes,
  profAno: competenciaAtual().ano,
  profEquipe: "",
  profFolha: Array(3).fill(""),
  seqs: [emptySeq(), emptySeq(), emptySeq()],
  respConfirmacao: null,
  respData: hojeDigits(),
  gestCarimbo: "",
  gestRubrica: "",
  gestData: hojeDigits(),
});

// Ajusta um vetor de dígitos para exatamente n posições, justificado à direita
// (mantém os dígitos preenchidos, alinhados à direita; descarta excedente à esquerda).
function rjust(arr: string[] | undefined, n: number): string[] {
  const digs = (arr ?? []).filter(Boolean).slice(-n);
  return [...Array(Math.max(0, n - digs.length)).fill(""), ...digs];
}

function loadState(): State {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const merged = { ...initialState(), ...(JSON.parse(raw) as Partial<State>) };
    // Migração: campo Quantidade passou de 6 -> 3 dígitos (justificado à direita).
    merged.seqs = merged.seqs.map((s) => ({ ...s, qtde: rjust(s.qtde, 3) }));
    return merged;
  } catch {
    return initialState();
  }
}

function BpaI() {
  const [state, setState] = useState<State>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Quando o profissional escolhido tem >1 CBO no estabelecimento, guardamos as opções
  // para a pessoa escolher (em vez de preencher um qualquer automaticamente).
  const [cboOpcoes, setCboOpcoes] = useState<CboVinculo[]>([]);
  // Modais de confirmação (substituem o confirm() nativo).
  const [zerarSeqsOpen, setZerarSeqsOpen] = useState(false);
  const [manterProf, setManterProf] = useState(true);
  const [zerarTudoOpen, setZerarTudoOpen] = useState(false);
  // Snapshot do que havia antes de zerar, p/ desfazer (restaurar profissional ou tudo).
  const [snapshot, setSnapshot] = useState<State | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  // Guarda a intenção de gerar o .txt logo após salvar a config (quando estava incompleta).
  const [gerarAposConfig, setGerarAposConfig] = useState(false);
  const [fichasOpen, setFichasOpen] = useState(false);
  const [salvarOpen, setSalvarOpen] = useState(false);
  // true = diálogo está em modo "Salvar como" (força criar uma cópia nova).
  const [salvarComoNovo, setSalvarComoNovo] = useState(false);
  const [salvarMenuOpen, setSalvarMenuOpen] = useState(false);
  const [salvandoDireto, setSalvandoDireto] = useState(false);
  // Id da ficha no Supabase (persistido p/ continuar atualizando a mesma após reload).
  const fichaIdRef = useRef<string | null>(null);
  // Título da ficha atual (quando já salva/carregada), p/ pré-preencher o "Salvar".
  const fichaTituloRef = useRef<string | null>(null);
  const FICHA_ID_KEY = "bpa-i-v2-ficha-id";
  const FICHA_TITULO_KEY = "bpa-i-v2-ficha-titulo";
  // Houve alterações desde a última geração de PDF? (p/ avisar antes de zerar tudo)
  const [pdfPendente, setPdfPendente] = useState(false);
  const user = useAuthUser(); // pessoa logada (Responsável), p/ a confirmação eletrônica
  const sheetRef = useRef<HTMLDivElement>(null);
  const cells = (s: string, n: number) => Array.from({ length: n }, (_, i) => s[i] ?? "");
  // Guarda o CNES que gerou o Nome do Estabelecimento auto-preenchido. Serve p/ a
  // validação cruzada CNES <-> Nome: se o CNES mudar, o nome auto vira inconsistente.
  const estabAutoCnesRef = useRef("");
  // Registro das caixinhas por id, p/ auto-avanço contínuo entre campos vizinhos
  // (DDD -> telefone; dia -> mês -> ano das datas). regBox expõe; focusBox pula.
  const boxRefs = useRef<Record<string, HTMLInputElement[]>>({});
  const regBox = (key: string) => (els: HTMLInputElement[]) => { boxRefs.current[key] = els; };
  const focusBox = (key: string) => boxRefs.current[key]?.[0]?.focus();
  // Junta os inputs de vários grupos (ex.: dia+mês+ano) p/ a lixeira do campo composto.
  const inputsOf = (...keys: string[]) => keys.flatMap((k) => boxRefs.current[k] ?? []);
  // Borda direita (%) do último grupo — onde a lixeira do campo composto é ancorada.
  const endOf = (arr: { left: number; width: number }[]) => arr[arr.length - 1].left + arr[arr.length - 1].width;

  useEffect(() => {
    setState(loadState());
    try {
      fichaIdRef.current = localStorage.getItem(FICHA_ID_KEY);
      fichaTituloRef.current = localStorage.getItem(FICHA_TITULO_KEY);
    } catch { /* noop */ }
    setHydrated(true);
  }, []);

  // Nome sugerido ao salvar: "primeiro nome do profissional · data de hoje · Folha nnn".
  // Se a ficha já foi salva antes, sugere o título atual (para não trocar sem querer).
  const nomeSugerido = (): string => {
    if (salvarComoNovo && fichaTituloRef.current) return `${fichaTituloRef.current} (cópia)`;
    if (fichaTituloRef.current) return fichaTituloRef.current;
    const primeiroNome = state.profNome.trim().split(/\s+/)[0] ?? "";
    const hoje = new Date().toLocaleDateString("pt-BR");
    const folha = state.profFolha.join("").replace(/^0+(?=\d)/, "");
    const partes = [primeiroNome, hoje, folha ? `Folha ${folha}` : ""].filter(Boolean);
    return partes.join(" · ") || "Ficha BPA-I";
  };

  // Mantém os refs e o localStorage sincronizados (sobrevive a reload da página).
  const persistFicha = (id: string, titulo: string) => {
    fichaIdRef.current = id;
    fichaTituloRef.current = titulo;
    try {
      localStorage.setItem(FICHA_ID_KEY, id);
      localStorage.setItem(FICHA_TITULO_KEY, titulo);
    } catch { /* noop */ }
  };
  const limparFichaPersistida = () => {
    fichaIdRef.current = null;
    fichaTituloRef.current = null;
    try {
      localStorage.removeItem(FICHA_ID_KEY);
      localStorage.removeItem(FICHA_TITULO_KEY);
    } catch { /* noop */ }
  };

  // Salva (cria ou atualiza) a ficha na nuvem com o nome informado no diálogo.
  // Quando comoNovo=true, ignora a ficha atual e sempre cria uma cópia nova.
  const salvarNaNuvem = async (titulo: string) => {
    const comp = state.profAno.join("") + state.profMes.join("");
    const idAlvo = salvarComoNovo ? null : fichaIdRef.current;
    const id = await salvarFicha(idAlvo, titulo, comp, state);
    if (!id) {
      toast.error("Não foi possível salvar. Verifique sua conexão e tente novamente.");
      return;
    }
    const atualizou = Boolean(idAlvo);
    persistFicha(id, titulo);
    setSalvarOpen(false);
    setSalvarComoNovo(false);
    toast.success(atualizou ? "Alterações salvas na nuvem." : `Ficha “${titulo}” salva na nuvem.`);
  };

  // Clique direto no botão "Salvar": se a ficha já existe, grava sem pedir nome de
  // novo. Se ainda não foi salva, abre o diálogo (primeira vez precisa de nome).
  const salvarClique = async () => {
    if (!fichaIdRef.current || !fichaTituloRef.current) {
      setSalvarComoNovo(false);
      setSalvarOpen(true);
      return;
    }
    setSalvandoDireto(true);
    const comp = state.profAno.join("") + state.profMes.join("");
    const id = await salvarFicha(fichaIdRef.current, fichaTituloRef.current, comp, state);
    setSalvandoDireto(false);
    if (!id) {
      toast.error("Não foi possível salvar. Verifique sua conexão e tente novamente.");
      return;
    }
    persistFicha(id, fichaTituloRef.current);
    toast.success("Alterações salvas na nuvem.");
  };

  // "Salvar como…": sempre abre o diálogo pedindo um nome novo p/ criar uma cópia.
  const salvarComoClique = () => {
    setSalvarComoNovo(true);
    setSalvarOpen(true);
    setSalvarMenuOpen(false);
  };

  // Carrega uma ficha salva; começa uma nova (limpa e desvincula da ficha atual).
  const carregarFichaSalva = async (id: string, titulo?: string) => {
    const dados = await carregarFicha(id);
    if (!dados) return;
    setState({ ...initialState(), ...(dados as Partial<State>) });
    persistFicha(id, titulo ?? "Ficha BPA-I");
  };
  const novaFicha = () => {
    setState(initialState());
    limparFichaPersistida();
  };
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
    setPdfPendente(true); // mudou algo -> PDF desta versão ainda não foi gerado
  }, [state, hydrated]);

  // Validação cruzada CNES -> Nome do Estabelecimento (mantém os dois sincronizados):
  //  - Se o CNES mudou e o nome atual havia sido auto-preenchido por OUTRO CNES, o nome
  //    ficou inconsistente -> limpa na hora (silenciosamente).
  //  - Com 7 dígitos, busca na tabela: achou -> preenche (e registra o CNES-fonte);
  //    não achou -> deixa em branco. Nome digitado à mão (sem CNES-fonte) nunca é mexido aqui.
  const cnesEstab = state.cnes.join("");
  useEffect(() => {
    if (!hydrated) return;
    if (estabAutoCnesRef.current && estabAutoCnesRef.current !== cnesEstab) {
      estabAutoCnesRef.current = "";
      setState((p) => ({ ...p, nomeEstab: "" }));
    }
    if (cnesEstab.length !== 7) return;
    let cancelled = false;
    buscarEstabelecimento(cnesEstab).then((nome) => {
      if (cancelled || !nome) return;
      estabAutoCnesRef.current = cnesEstab;
      setState((p) => ({ ...p, nomeEstab: nome }));
    });
    // Popula (uma vez) o cache de profissionais deste estabelecimento p/ o autocomplete.
    sincronizarProfissionais(cnesEstab);
    return () => { cancelled = true; };
  }, [cnesEstab, hydrated]);

  // Fonte cursiva (Caveat) para a "assinatura" eletrônica do Responsável — injetada
  // uma vez (mantém isolado no v2, sem mexer no HTML global).
  useEffect(() => {
    if (document.getElementById("bpa-v2-fonte-assinatura")) return;
    const link = document.createElement("link");
    link.id = "bpa-v2-fonte-assinatura";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&display=swap";
    document.head.appendChild(link);
  }, []);

  const set = <K extends keyof State>(k: K, v: State[K]) => setState((p) => ({ ...p, [k]: v }));
  const updateSeq = <K extends keyof SeqData>(i: number, field: K, value: SeqData[K]) => {
    setState((p) => {
      const seqs = [...p.seqs];
      // Editar a data de atendimento invalida uma confirmação de "aviso >120 dias"
      // anterior (a pessoa precisa reconfirmar se a data mudou).
      const desconfirmar = field === "dataAtend" && (value as string[]).join("") !== seqs[i].dataAtend.join("")
        ? { dataAtendConfirmada: false } : {};
      seqs[i] = { ...seqs[i], [field]: value, ...desconfirmar };
      return { ...p, seqs };
    });
  };

  const clearSeqs = () => {
    setManterProf(true);
    setZerarSeqsOpen(true);
  };
  const confirmarZerarSeqs = () => {
    setSnapshot(state); // guarda p/ desfazer
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
    setSnapshot(state); // guarda p/ desfazer
    setState(initialState());
    setCboOpcoes([]);
    setZerarTudoOpen(false);
  };

  // Desfazer: restaura o cabeçalho (estabelecimento + profissional) ou tudo.
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

  const exportPdf = async () => {
    if (!sheetRef.current) return;
    setPrinting(true);
    await new Promise((r) => setTimeout(r, 80));
    try {
      await document.fonts?.ready; // garante a fonte cursiva carregada antes da captura
      await exportSheetPdf(sheetRef.current, "BPA-I.pdf");
      setPdfPendente(false); // PDF gerado p/ o estado atual
      registrarUsoDaFicha();
    } catch (err) {
      console.error("PDF export failed", err);
      alert("Falha ao gerar PDF. Veja o console.");
    } finally { setPrinting(false); }
  };

  // Gera e baixa o arquivo magnético BPA (.txt). Exige config do estabelecimento
  // completa (senão abre o painel) e ao menos uma sequência com procedimento.
  const exportTxt = () => {
    if (!state.seqs.some(seqPreenchida)) {
      alert("Preencha ao menos um procedimento antes de gerar o arquivo magnético.");
      return;
    }
    const cfg = loadConfig();
    if (!configCompleta(cfg)) {
      setGerarAposConfig(true);
      setConfigOpen(true);
      return;
    }
    try {
      const arq = gerarArquivoBpa(state, cfg);
      baixarTxt(arq.nome, arq.conteudo);
      registrarUsoDaFicha();
    } catch (err) {
      console.error("Falha ao gerar arquivo magnético", err);
      alert("Falha ao gerar o arquivo magnético. Veja o console.");
    }
  };

  // Ao exportar, registra no histórico o CBO do profissional e os procedimentos
  // preenchidos em cada sequência (alimenta o autocomplete). Só registra o código do
  // procedimento se ele existir de verdade no SIGTAP — evita que um código digitado
  // errado vire sugestão de autocomplete pra outras pessoas.
  const registrarUsoDaFicha = () => {
    const cbo = state.profCbo.join("");
    if (cbo.length === L.PROF_CBO_BOXES.length) registrarUso("cbo", cbo);
    for (const sq of state.seqs) {
      const proc = sq.codProc.join("");
      if (proc.length !== L.REL.codProc.length) continue;
      buscarProcedimentoSigtap(proc).then((p) => { if (p) registrarUso("procedimento", proc); });
    }
  };

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

      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
            <h1 className="text-base font-semibold">BPA-I v2 (beta) — Boletim Individualizado</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LoginControl user={user} />
            {user && (
              <div className="group relative flex">
                <button
                  onClick={salvarClique}
                  disabled={salvandoDireto}
                  title={fichaTituloRef.current ? "Salvar alterações nesta ficha" : "Salvar esta ficha na sua conta (nuvem)"}
                  className="rounded-l-md border border-r-0 border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
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
              <button onClick={() => setFichasOpen(true)} title="Fichas salvas na sua conta" className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
                📁 Minhas fichas
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
            <button onClick={() => { setGerarAposConfig(false); setConfigOpen(true); }} title="Configuração do estabelecimento (arquivo magnético)" className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
              ⚙ Config
            </button>
            <button onClick={exportTxt} title="Gerar arquivo magnético BPA (.txt) p/ importar no SIA/SUS" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
              Gerar .txt
            </button>
            <button onClick={exportPdf} disabled={printing} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {printing ? "Gerando..." : "Gerar PDF"}
            </button>
          </div>
        </div>
      </header>

      <ConfigModal
        open={configOpen}
        onClose={() => { setConfigOpen(false); setGerarAposConfig(false); }}
        onSaved={() => { if (gerarAposConfig) { setGerarAposConfig(false); exportTxt(); } }}
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

      <main className="mx-auto mt-4 max-w-[1100px] px-4">
        <div ref={sheetRef} className={`form-sheet ${printing ? "form-sheet--print" : ""}`} style={{ aspectRatio: "1653 / 2339" }}>
          <img src={bpaiBg} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />

          {/* Header */}
          <EstabelecimentoAutocomplete
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
          <DigitBoxes id="pcns" top={L.PROF_CNS_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_CNS_BOXES} values={state.profCns} onChange={(v) => set("profCns", v)} invalid={hydrated && cnsInvalido(state.profCns.join(""))} clearable compact />
          <ProfissionalAutocomplete
            cnes={cnesEstab}
            top={L.PROF_NOME.top} left={L.PROF_NOME.left} width={L.PROF_NOME.width} height={L.PROF_NOME.height}
            nome={state.profNome}
            onChangeNome={(v) => set("profNome", v)}
            onPick={(p) => {
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
          <HistoricoField id="pcbo" top={L.PROF_ROW2_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_CBO_BOXES} values={state.profCbo} onChange={(v) => set("profCbo", v)} tabela="cbo" clearable />
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
          <TextField {...L.PROF_EQUIPE} value={state.profEquipe} onChange={(v) => set("profEquipe", v)} />
          <DigitBoxes id="pfolha" top={L.PROF_ROW2_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_FOLHA_BOXES} values={state.profFolha} onChange={(v) => set("profFolha", v)} compact />

          {/* 3 Sequências */}
          {L.SEQ_TOPS.map((seqTop, si) => {
            const s = state.seqs[si];
            const R = L.REL;
            const u = <K extends keyof SeqData>(f: K, v: SeqData[K]) => updateSeq(si, f, v);
            const dnInvalida = hydrated && dataFuturaOuInvalida(s.dataNasc);
            const daInvalida = hydrated && dataFuturaOuInvalida(s.dataAtend);
            const daAntiga = hydrated && atendimentoAntigo(s.dataAtend) && !s.dataAtendConfirmada;
            return (
              <div key={si}>
                {/* Paciente row 1: CNS + Nome */}
                <DigitBoxes id={`s${si}-cns`} top={seqTop + R.cnsPac} height={L.DIGIT_H} boxes={R.cnsPacBoxes}
                  values={s.cnsPac} onChange={(v) => u("cnsPac", v)} invalid={hydrated && cnsInvalido(s.cnsPac.join(""))} clearable compact />
                <TextField top={seqTop + R.cnsPac} left={R.nomePac.left} width={R.nomePac.width} height={L.DIGIT_H}
                  value={s.nomePac} onChange={(v) => u("nomePac", v)} />

                {/* Row 2: Sexo / Data Nasc / Nacion / RaçaCor / Etnia / CEP / IBGE */}
                <TextField top={seqTop + R.row2} left={R.sexoM.left} width={R.sexoM.width} height={L.DIGIT_H} align="center"
                  value={s.sexo === "M" ? "X" : ""} onChange={(v) => u("sexo", v ? "M" : "")} />
                <TextField top={seqTop + R.row2} left={R.sexoF.left} width={R.sexoF.width} height={L.DIGIT_H} align="center"
                  value={s.sexo === "F" ? "X" : ""} onChange={(v) => u("sexo", v ? "F" : "")} />
                <DigitBoxes id={`s${si}-dnd`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascDia}
                  values={s.dataNasc.slice(0, 2)} onChange={(v) => u("dataNasc", [...v, ...s.dataNasc.slice(2)])} registerRefs={regBox(`s${si}-dnd`)} onComplete={() => focusBox(`s${si}-dnm`)} invalid={dnInvalida} compact />
                <DigitBoxes id={`s${si}-dnm`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascMes}
                  values={s.dataNasc.slice(2, 4)} onChange={(v) => u("dataNasc", [...s.dataNasc.slice(0, 2), ...v, ...s.dataNasc.slice(4)])} registerRefs={regBox(`s${si}-dnm`)} onComplete={() => focusBox(`s${si}-dna`)} invalid={dnInvalida} compact />
                <DigitBoxes id={`s${si}-dna`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascAno}
                  values={s.dataNasc.slice(4, 8)} onChange={(v) => u("dataNasc", [...s.dataNasc.slice(0, 4), ...v])} registerRefs={regBox(`s${si}-dna`)} invalid={dnInvalida} compact />
                <FieldClear top={seqTop + R.row2} left={endOf(R.dataNascAno) + 0.5} height={L.DIGIT_H}
                  getInputs={() => inputsOf(`s${si}-dnd`, `s${si}-dnm`, `s${si}-dna`)}
                  onClear={() => u("dataNasc", Array(8).fill(""))} />
                <ComboField top={seqTop + R.row2} left={R.nacionalidade.left} width={R.nacionalidade.width} height={L.DIGIT_H}
                  options={NACIONALIDADES} value={s.nacionalidade} onChange={(v) => u("nacionalidade", v)} />
                <ComboField top={seqTop + R.row2} left={R.racaCor.left} width={R.racaCor.width} height={L.DIGIT_H}
                  options={RACAS} value={s.racaCor}
                  onChange={(v) => {
                    updateSeq(si, "racaCor", v);
                    // Etnia só vale para Indígena; em qualquer mudança de Raça/Cor, limpa.
                    updateSeq(si, "etnia", "");
                  }} />
                <ComboField top={seqTop + R.row2} left={R.etnia.left} width={R.etnia.width} height={L.DIGIT_H}
                  options={ETNIAS} value={s.etnia} onChange={(v) => u("etnia", v)}
                  disabled={s.racaCor !== RACA_INDIGENA} />
                <DigitBoxes id={`s${si}-cep`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.cep}
                  values={s.cep} onChange={(v) => u("cep", v)} clearable compact />
                <DigitBoxes id={`s${si}-ibge`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.ibge}
                  values={s.ibge} onChange={(v) => u("ibge", v)} clearable compact />

                {/* Row 3: Cod Logradouro / Endereço / Número / Complemento */}
                <ComboField top={seqTop + R.row3} left={R.codLog[0].left}
                  width={R.codLog[R.codLog.length - 1].left + R.codLog[R.codLog.length - 1].width - R.codLog[0].left}
                  height={L.DIGIT_H} options={TIPOS_LOGRADOURO}
                  value={s.codLog.join("")} onChange={(v) => u("codLog", v.split(""))} />
                <TextField top={seqTop + R.row3} left={R.endereco.left} width={R.endereco.width} height={L.DIGIT_H}
                  value={s.endereco} onChange={(v) => u("endereco", v)} />
                <TextField top={seqTop + R.row3} left={R.numero.left} width={R.numero.width} height={L.DIGIT_H}
                  value={s.numero} onChange={(v) => u("numero", v)} />
                <TextField top={seqTop + R.row3} left={R.complemento.left} width={R.complemento.width} height={L.DIGIT_H}
                  value={s.complemento} onChange={(v) => u("complemento", v)} />

                {/* Row 4: Bairro / DDD / Telefone / Email */}
                <TextField top={seqTop + R.row4} left={R.bairro.left} width={R.bairro.width} height={L.DIGIT_H}
                  value={s.bairro} onChange={(v) => u("bairro", v)} />
                <DigitBoxes id={`s${si}-ddd`} top={seqTop + R.row4} height={L.DIGIT_H} boxes={R.ddd}
                  values={s.ddd} onChange={(v) => u("ddd", v)} registerRefs={regBox(`s${si}-ddd`)} onComplete={() => focusBox(`s${si}-tel`)} compact />
                <DigitBoxes id={`s${si}-tel`} top={seqTop + R.row4} height={L.DIGIT_H} boxes={R.telefone}
                  values={s.telefone} onChange={(v) => u("telefone", v)} registerRefs={regBox(`s${si}-tel`)} compact />
                <FieldClear top={seqTop + R.row4} left={endOf(R.telefone) + 0.5} height={L.DIGIT_H}
                  getInputs={() => inputsOf(`s${si}-ddd`, `s${si}-tel`)}
                  onClear={() => { u("ddd", Array(2).fill("")); u("telefone", Array(8).fill("")); }} />
                <TextField top={seqTop + R.row4} left={R.email.left} width={R.email.width} height={L.DIGIT_H}
                  value={s.email} onChange={(v) => u("email", v)} />

                {/* Procedimento row 1: Data atend / Cód proc / Qtde / CNPJ */}
                <DigitBoxes id={`s${si}-dad`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendDia}
                  values={s.dataAtend.slice(0, 2)} onChange={(v) => u("dataAtend", [...v, ...s.dataAtend.slice(2)])} registerRefs={regBox(`s${si}-dad`)} onComplete={() => focusBox(`s${si}-dam`)} invalid={daInvalida} warn={daAntiga} compact />
                <DigitBoxes id={`s${si}-dam`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendMes}
                  values={s.dataAtend.slice(2, 4)} onChange={(v) => u("dataAtend", [...s.dataAtend.slice(0, 2), ...v, ...s.dataAtend.slice(4)])} registerRefs={regBox(`s${si}-dam`)} onComplete={() => focusBox(`s${si}-daa`)} invalid={daInvalida} warn={daAntiga} compact />
                <DigitBoxes id={`s${si}-daa`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendAno}
                  values={s.dataAtend.slice(4, 8)} onChange={(v) => u("dataAtend", [...s.dataAtend.slice(0, 4), ...v])} registerRefs={regBox(`s${si}-daa`)} invalid={daInvalida} warn={daAntiga} compact />
                <FieldClear top={seqTop + R.procRow1} left={endOf(R.dataAtendAno) + 0.5} height={L.DIGIT_H}
                  getInputs={() => inputsOf(`s${si}-dad`, `s${si}-dam`, `s${si}-daa`)}
                  onClear={() => u("dataAtend", Array(8).fill(""))} />
                <AtendimentoAntigoAviso top={seqTop + R.procRow1} left={96} height={L.DIGIT_H}
                  ativo={daAntiga} onConfirmar={() => u("dataAtendConfirmada", true)} />
                <ProcedimentoField id={`s${si}-cp`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.codProc}
                  values={s.codProc} onChange={(v) => u("codProc", v)} clearable />
                <DigitBoxes id={`s${si}-q`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.qtde}
                  values={s.qtde} onChange={(v) => u("qtde", v)} clearable compact />
                <DigitBoxes id={`s${si}-cnpj`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.cnpj}
                  values={s.cnpj} onChange={(v) => u("cnpj", v)} clearable compact />

                {/* Procedimento row 2: Serviço / Class / CID / Caráter / Autorização */}
                <DigitBoxes id={`s${si}-srv`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.servico}
                  values={s.servico} onChange={(v) => u("servico", v)} compact />
                <DigitBoxes id={`s${si}-cls`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.classProc}
                  values={s.classProc} onChange={(v) => u("classProc", v)} compact />
                <DigitBoxes id={`s${si}-cid`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.cid}
                  values={s.cid} onChange={(v) => u("cid", v)} numeric={false} compact />
                <ComboField top={seqTop + R.procRow2} left={R.carater[0].left}
                  width={R.carater[R.carater.length - 1].left + R.carater[R.carater.length - 1].width - R.carater[0].left}
                  height={L.DIGIT_H} options={CARATERES} display="code"
                  value={s.carater.join("")} onChange={(v) => u("carater", v.split(""))} />
                <DigitBoxes id={`s${si}-aut`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.autorizacao}
                  values={s.autorizacao} onChange={(v) => u("autorizacao", v)} clearable compact />
              </div>
            );
          })}

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
          <TextField {...L.GEST_CARIMBO} value={state.gestCarimbo} onChange={(v) => set("gestCarimbo", v)} />
          <TextField {...L.GEST_RUBRICA} value={state.gestRubrica} onChange={(v) => set("gestRubrica", v)} />
          {renderData("gestData", L.GEST_DATA_DIA, L.GEST_DATA_MES, L.GEST_DATA_ANO)}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Dados salvos automaticamente neste navegador. Posições do BPA-I são uma primeira aproximação — me diga quais campos precisam de ajuste.
        </p>
      </main>
    </div>
  );
}
