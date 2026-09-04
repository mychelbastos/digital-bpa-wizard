// Motor do BPA-I (headless). Extraído de src/routes/bpa-i-v3.tsx SEM mudança de comportamento
// para ser a ÚNICA fonte de verdade compartilhada entre o V3 (tela oficial) e o V4 (tela nova
// de proposta). Regra: V3 e V4 produzem exatamente o mesmo `dados.seqs` e o mesmo `.MAR` — a
// equivalência é travada por src/lib/bpa-i-v3/equivalencia.golden.test.ts.
//
// Fatia 1 (este commit): tipos + constantes + helpers puros de estado. O hook useBpaIEngine
// (efeitos + save + ações de seq) vem nas fatias seguintes, também por movimento mecânico.
import { useCallback, useEffect, useRef, useState } from "react";
import * as L from "@/lib/bpai-v2-layout";
import { emptySeq, type SeqData } from "@/lib/bpai-v2-layout";
import { ancorarCharsDireita } from "@/lib/digitos-direita";
import type { Confirmacao } from "@/lib/bpa-i-v2/confirmacao";
import { cnsInvalido } from "@/lib/bpa-i-v2/validacao";
import { seqPreenchida } from "@/lib/bpa-i-v2/bpa-magnetico";
import { motivosCabecalho } from "@/lib/bpa-i-v3/obrigatorios";
import { orgDoCnes } from "@/lib/tfd/tfd";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { sincronizarProfissionais, buscarCbosVinculo, buscarNomePorCns, type CboVinculo } from "@/lib/bpa-i-v2/profissionais";
import { proximaFolhaBpaI, assinaturaBpaI, acharDuplicataBpaI, type FichaDuplicada } from "@/lib/bpa-i-v2/folha-duplicidade";
import { salvarFicha, carregarFicha } from "@/lib/bpa-i-v2/fichas";
import { movimentoFaturamento } from "@/lib/faturamento";
import { montarTituloFicha } from "@/lib/bpa-i-v2/titulo-ficha";
import { statusDaFicha, retificarFicha, registrarLeituraFicha, type FichaStatus } from "@/lib/producoes";
import { registrarUso } from "@/lib/bpa-i-v2/historico";
import { buscarProcedimentoSigtap } from "@/lib/bpa-i-v2/procedimentos-sigtap";
import { reconciliarPacientesDasSeqs, pacienteParaIdentidade, type UltimoProcedimento } from "@/lib/bpa-i-v3/paciente-seq";
import type { Paciente } from "@/lib/pacientes";
import { toast } from "sonner";

export const FICHA_ID_KEY = "bpa-i-v3-ficha-id";
export const FICHA_TITULO_KEY = "bpa-i-v3-ficha-titulo";

export const STORAGE_KEY = "bpa-i-v3-state-v1";

// Campos de IDENTIFICAÇÃO DO PACIENTE (não os do procedimento/atendimento) — usados pelo
// botão "repetir paciente" da sequência seguinte, quando o mesmo paciente tem mais de um
// procedimento na folha.
export const CAMPOS_PACIENTE: (keyof SeqData)[] = [
  "cnsPac", "nomePac", "sexo", "dataNasc", "nacionalidade", "racaCor", "etnia",
  "cep", "ibge", "codLog", "endereco", "numero", "complemento", "bairro",
  "ddd", "telefone", "email", "cpfPac", "situacaoRua",
];

// Estado completo de uma ficha BPA-I na tela (cabeçalho + sequências + rodapé). É exatamente
// o que se grava em `fichas.dados` — por isso V3 e V4 compartilham este mesmo shape.
export interface State {
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

// Preenche uma string em exatamente n células (index → char), completando com "".
export const cells = (s: string, n: number): string[] => Array.from({ length: n }, (_, i) => s[i] ?? "");

// Mês/Ano do mês do calendário (fallback).
export const competenciaAtual = () => {
  const agora = new Date();
  return {
    mes: String(agora.getMonth() + 1).padStart(2, "0").split(""),
    ano: String(agora.getFullYear()).padStart(4, "0").split(""),
  };
};

// Competência PADRÃO de uma ficha NOVA = mês da PRODUÇÃO EM ABERTO (movimento de faturamento),
// não o mês do calendário. Ex.: se a produção aberta é 08/2026, a folha nova entra com 08/2026
// (e não 09 só porque hoje é setembro) — evita o bloqueio de "competência posterior ao
// movimento" e o retrabalho de corrigir o cabeçalho. Cai no mês atual se o movimento não estiver
// definido. O usuário ainda pode alterar o Mês/Ano manualmente (produção retroativa).
export const competenciaPadrao = () => {
  const m = movimentoFaturamento();
  return /^\d{6}$/.test(m)
    ? { mes: m.slice(4, 6).split(""), ano: m.slice(0, 4).split("") }
    : competenciaAtual();
};

// Data de hoje como 8 dígitos [D,D,M,M,A,A,A,A] — pré-preenche o campo Data do rodapé.
export const hojeDigits = (): string[] => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = String(d.getFullYear()).padStart(4, "0");
  return `${dd}${mm}${aaaa}`.split("");
};

export const initialState = (): State => ({
  nomeEstab: "",
  cnes: Array(7).fill(""),
  profCns: Array(15).fill(""),
  profNome: "",
  profCbo: Array(6).fill(""),
  profMes: competenciaPadrao().mes,
  profAno: competenciaPadrao().ano,
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
export function rjust(arr: string[] | undefined, n: number): string[] {
  const digs = (arr ?? []).filter(Boolean).slice(-n);
  return [...Array(Math.max(0, n - digs.length)).fill(""), ...digs];
}

// Migração: campo Número (endereço) — 4 caixinhas alfanuméricas ("SN" de "sem número"),
// ancoradas à DIREITA (estilo calculadora). Aceita array antigo (à esquerda ou com
// espaços de importação) ou texto livre; remove espaços e mantém os últimos 4 caracteres.
export function migrarNumero(v: unknown): string[] {
  const raw = Array.isArray(v) ? (v as string[]).join("") : String(v ?? "");
  return ancorarCharsDireita(raw.replace(/\s/g, ""), 4);
}

// Garante 3 sequências (o formulário renderiza 3 fixas) e blinda campos ausentes. Fichas
// importadas ou geradas (TFD) podem ter < 3 seqs — sem isto o render acessaria state.seqs[si]
// indefinido e a página quebraria. Também aplica a migração de Quantidade (6->3 díg.).
export function normalizarSeqs3(seqs: SeqData[] | undefined): SeqData[] {
  const base = seqs ?? [];
  const arr = base.length >= 3 ? base : [...base, ...Array.from({ length: 3 - base.length }, emptySeq)];
  return arr.map((s) => ({ ...emptySeq(), ...s, qtde: rjust((s?.qtde ?? []), 3), numero: migrarNumero(s?.numero ?? []) }));
}

export function loadState(key: string = STORAGE_KEY): State {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initialState();
    const merged = { ...initialState(), ...(JSON.parse(raw) as Partial<State>) };
    merged.seqs = normalizarSeqs3(merged.seqs);
    return merged;
  } catch {
    return initialState();
  }
}

// ---------------------------------------------------------------------------
// useBpaIEngine — o MOTOR headless do BPA-I (state + efeitos + save + ações de seq).
// É a única fonte de verdade compartilhada entre o V3 (tela oficial) e o V4 (tela nova).
// Fica FORA daqui, na tela: render da folha, modais, modo captura/PDF (dependem do DOM) e
// as funções que só orquestram diálogos (salvarClique etc., que chamam as primitivas daqui).
// ---------------------------------------------------------------------------
// `opts.origemUi` (ex.: 'v4') é só auditoria — carimbada no save, nunca ramifica lógica.
// `opts.storageKey`/`fichaIdKey`/`fichaTituloKey` isolam o rascunho (localStorage) por tela
// (o V4 usa chaves próprias p/ não colidir com o rascunho do V3). Defaults = chaves do V3.
export function useBpaIEngine(opts?: { origemUi?: string; storageKey?: string; fichaIdKey?: string; fichaTituloKey?: string }) {
  const origemUi = opts?.origemUi;
  const storageKey = opts?.storageKey ?? STORAGE_KEY;
  const fichaIdKey = opts?.fichaIdKey ?? FICHA_ID_KEY;
  const fichaTituloKey = opts?.fichaTituloKey ?? FICHA_TITULO_KEY;
  const [state, setState] = useState<State>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [cboOpcoes, setCboOpcoes] = useState<CboVinculo[]>([]);
  const [ficStatus, setFicStatus] = useState<FichaStatus | null>(null);
  const [retificando, setRetificando] = useState(false);
  const [fichaTitulo, setFichaTitulo] = useState<string | null>(null);
  const [pdfPendente, setPdfPendente] = useState(false);
  const [errosSeq, setErrosSeq] = useState<Record<number, string[]>>({});

  const congelada = ficStatus?.congelada ?? false;
  const substituidaPor = ficStatus?.substituida_por ?? null;
  const refreshStatus = useCallback((id: string | null) => {
    if (!id) { setFicStatus(null); return; }
    statusDaFicha(id).then(setFicStatus);
  }, []);

  const fichaIdRef = useRef<string | null>(null);
  const fichaTituloRef = useRef<string | null>(null);
  const cnsResolvidoRef = useRef("");
  const estabAutoCnesRef = useRef("");
  const folhaAutoChaveRef = useRef("");

  const onValidacaoChangeSeq = useCallback((si: number, motivos: string[]) => {
    setErrosSeq((prev) => (prev[si]?.join("|") === motivos.join("|") ? prev : { ...prev, [si]: motivos }));
  }, []);

  const competencia = () => state.profAno.join("") + state.profMes.join("");
  const cnesEstab = state.cnes.join("");
  const cnsProfInvalido = hydrated && cnsInvalido(state.profCns.join(""));
  const temSeqAtiva = state.seqs.some(seqPreenchida);
  const motivosCab = hydrated && temSeqAtiva ? motivosCabecalho(state) : [];
  const motivosInvalidos = [
    ...motivosCab.map((m) => `Cabeçalho: ${m}`),
    ...(cnsProfInvalido ? ["Profissional: CNS inválido (dígito verificador não confere)."] : []),
    ...Object.entries(errosSeq).flatMap(([si, motivos]) => motivos.map((m) => `Sequência ${Number(si) + 1}: ${m}`)),
  ];
  const temCamposInvalidos = motivosInvalidos.length > 0;
  const profCnsDig = state.profCns.join("").replace(/\D/g, "");
  const profCboDig = state.profCbo.join("").replace(/\D/g, "");

  // Lista de sequências dinâmica (usada pelo V4: "nova sequência"/"duplicar última"/remover).
  // O V3 não chama; o .MAR só usa as seqs preenchidas, então a contagem não o afeta.
  const adicionarSeq = () => setState((p) => ({ ...p, seqs: [...p.seqs, emptySeq()] }));
  const duplicarUltimaSeq = () => setState((p) => {
    const last = p.seqs[p.seqs.length - 1];
    const copia = JSON.parse(JSON.stringify(last)) as SeqData; // cópia profunda (arrays/strings)
    return { ...p, seqs: [...p.seqs, copia] };
  });
  const removerSeq = (i: number) => setState((p) => (p.seqs.length <= 1 ? p : { ...p, seqs: p.seqs.filter((_, idx) => idx !== i) }));

  // Refs + localStorage sincronizados (sobrevive a reload da página).
  const persistFicha = (id: string, titulo: string) => {
    fichaIdRef.current = id;
    fichaTituloRef.current = titulo;
    setFichaTitulo(titulo);
    try { localStorage.setItem(fichaIdKey, id); localStorage.setItem(fichaTituloKey, titulo); } catch { /* noop */ }
  };
  const limparFichaPersistida = () => {
    fichaIdRef.current = null;
    fichaTituloRef.current = null;
    setFichaTitulo(null);
    try { localStorage.removeItem(fichaIdKey); localStorage.removeItem(fichaTituloKey); } catch { /* noop */ }
  };

  const nomeSugerido = (comoNovo: boolean): string => {
    if (comoNovo && fichaTituloRef.current) return `${fichaTituloRef.current} (cópia)`;
    if (fichaTituloRef.current) return fichaTituloRef.current;
    return montarTituloFicha({
      cnes: state.cnes.join(""), profNome: state.profNome, profCns: state.profCns.join(""),
      competencia: competencia(), folha: state.profFolha.join(""),
    }) || "Ficha BPA-I";
  };

  // ---- Efeitos de domínio ----
  // Resolve a organização (prefeitura) a partir do CNES — escopo do cadastro de pacientes.
  useEffect(() => {
    if (!/^\d{7}$/.test(cnesEstab)) { setOrgId(null); return; }
    let cancel = false;
    orgDoCnes(cnesEstab).then((o) => { if (!cancel) setOrgId(o); });
    return () => { cancel = true; };
  }, [cnesEstab]);

  // Autosave (localStorage) — e marca que o PDF desta versão ainda não foi gerado.
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* noop */ }
    setPdfPendente(true);
  }, [state, hydrated]);

  // CNES -> Nome do Estabelecimento (sincroniza os dois; limpa nome auto inconsistente).
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
    sincronizarProfissionais(cnesEstab);
    return () => { cancelled = true; };
  }, [cnesEstab, hydrated]);

  // CNS do profissional -> nome + CBO do vínculo (sem sobrescrever o que foi digitado à mão).
  useEffect(() => {
    if (!hydrated) return;
    const cns = state.profCns.join("");
    if (cns.length !== 15 || cnsInvalido(cns) || cnesEstab.length !== 7) return;
    const chave = `${cnesEstab}:${cns}`;
    if (cnsResolvidoRef.current === chave) return;
    cnsResolvidoRef.current = chave;
    buscarNomePorCns(cnesEstab, cns).then((nome) => {
      if (nome) setState((p) => (p.profNome.trim() ? p : { ...p, profNome: nome }));
    });
    buscarCbosVinculo(cns, cnesEstab).then((cbos) => {
      if (cbos.length === 1) setState((p) => (p.profCbo.some(Boolean) ? p : { ...p, profCbo: cells(cbos[0].codigo, 6) }));
      else if (cbos.length > 1) setCboOpcoes(cbos);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.profCns, cnesEstab, hydrated]);

  // Folha automática (organizacional; NÃO vai para o .txt). Fichas NOVAS recebem a próxima
  // folha da sequência do profissional na competência (reinicia por competência).
  useEffect(() => {
    if (!hydrated || fichaIdRef.current) return;
    const cnes = state.cnes.join("");
    const profCns = state.profCns.join("");
    const comp = competencia();
    // Gera já com CNES + competência (não espera o profissional). Com um CNS de profissional
    // válido, a sequência é por profissional; senão, pela unidade — como no BPA-C.
    if (!/^\d{7}$/.test(cnes) || !/^\d{6}$/.test(comp)) return;
    const profOk = /^\d{15}$/.test(profCns) && !cnsInvalido(profCns);
    const chave = `${cnes}:${profOk ? profCns : "SEM"}:${comp}`;
    if (folhaAutoChaveRef.current === chave) return;
    folhaAutoChaveRef.current = chave;
    proximaFolhaBpaI(cnes, profOk ? profCns : "", comp).then((n) => {
      if (folhaAutoChaveRef.current !== chave) return;
      setState((p) => ({ ...p, profFolha: rjust(String(n).split(""), 3) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cnes, state.profCns, state.profMes, state.profAno, hydrated]);

  // ---- Ações de sequência ----
  const set = <K extends keyof State>(k: K, v: State[K]) => setState((p) => ({ ...p, [k]: v }));
  const updateSeq = <K extends keyof SeqData>(i: number, field: K, value: SeqData[K]) => {
    setState((p) => {
      const seqs = [...p.seqs];
      const desconfirmar = field === "dataAtend" && (value as string[]).join("") !== seqs[i].dataAtend.join("")
        ? { dataAtendConfirmada: false } : {};
      seqs[i] = { ...seqs[i], [field]: value, ...desconfirmar };
      return { ...p, seqs };
    });
  };
  const repetirPaciente = (i: number) => {
    if (i <= 0) return;
    setState((p) => {
      const seqs = [...p.seqs];
      const prev = seqs[i - 1];
      const copia: Partial<SeqData> = {};
      for (const k of CAMPOS_PACIENTE) {
        const v = prev[k];
        (copia as Record<string, unknown>)[k] = Array.isArray(v) ? [...v] : v;
      }
      seqs[i] = { ...seqs[i], ...copia };
      return { ...p, seqs };
    });
  };
  const prevTemPaciente = (i: number) => {
    if (i <= 0) return false;
    const prev = state.seqs[i - 1];
    return prev.cnsPac.some(Boolean) || prev.nomePac.trim() !== "" || Boolean(prev.cpfPac?.some(Boolean));
  };
  const vincularPaciente = (i: number, p: Paciente) => {
    setState((prev) => {
      const seqs = [...prev.seqs];
      seqs[i] = { ...seqs[i], ...pacienteParaIdentidade(p) };
      return { ...prev, seqs };
    });
  };
  const desvincularPaciente = (i: number) => {
    setState((prev) => {
      const seqs = [...prev.seqs];
      const vazio = emptySeq() as unknown as Record<string, unknown>;
      const limpa: Partial<SeqData> = {};
      for (const k of CAMPOS_PACIENTE) (limpa as Record<string, unknown>)[k] = vazio[k];
      seqs[i] = { ...seqs[i], ...limpa, pacienteId: undefined };
      return { ...prev, seqs };
    });
  };
  const reidratarPaciente = (p: Paciente) => {
    setState((prev) => {
      const ident = pacienteParaIdentidade(p);
      const seqs = prev.seqs.map((s) => (s.pacienteId === p.id ? { ...s, ...ident } : s));
      return { ...prev, seqs };
    });
  };
  const usarUltimoProc = (i: number, f: UltimoProcedimento) => {
    setState((prev) => {
      const seqs = [...prev.seqs];
      seqs[i] = {
        ...seqs[i],
        codProc: cells(f.procedimento || "", 10),
        servico: cells(f.servico || "", 3),
        classProc: cells(f.classificacao || "", 3),
        cid: cells((f.cid || "").toUpperCase(), 4),
        carater: cells(f.carater || "", 2),
        qtde: Array(3).fill(""),
        dataAtend: Array(8).fill(""),
        dataAtendConfirmada: false,
      };
      return { ...prev, seqs };
    });
  };

  // ---- Save / lifecycle (primitivas; sem UI de diálogo) ----
  const checarDuplicidade = async (idAtual: string | null): Promise<FichaDuplicada | null> => {
    const assinatura = assinaturaBpaI(state.profCbo, state.seqs);
    if (!assinatura) return null;
    return acharDuplicataBpaI(state.cnes.join(""), state.profCns.join(""), competencia(), assinatura, idAtual);
  };

  // Reconcilia pacientes (só linka/cria), grava a ficha e persiste refs. Retorna id ou null.
  // NÃO faz toast nem mexe em diálogo — isso é da tela.
  const reconciliarESalvar = async (titulo: string, idAlvo: string | null): Promise<string | null> => {
    const comp = competencia();
    let estadoSalvar = state;
    if (orgId) {
      const seqsReconc = await reconciliarPacientesDasSeqs(state.seqs, orgId);
      if (seqsReconc !== state.seqs) {
        estadoSalvar = { ...state, seqs: seqsReconc };
        setState(estadoSalvar);
      }
    }
    const id = await salvarFicha(idAlvo, titulo, comp, estadoSalvar, {
      tipo: "BPA-I",
      cnes: estadoSalvar.cnes.join(""),
      profissionalCns: estadoSalvar.profCns.join(""),
      profissionalNome: estadoSalvar.profNome,
      origemUi,
    });
    if (id) persistFicha(id, titulo);
    return id;
  };

  const garantirFichaExportada = async (): Promise<string | null> => {
    const titulo = fichaTituloRef.current ?? nomeSugerido(false);
    const id = await salvarFicha(fichaIdRef.current, titulo, competencia(), state, {
      tipo: "BPA-I",
      cnes: state.cnes.join(""),
      profissionalCns: state.profCns.join(""),
      profissionalNome: state.profNome,
      origemUi,
    });
    if (id) persistFicha(id, titulo);
    return id;
  };

  const registrarUsoDaFicha = () => {
    const cbo = state.profCbo.join("");
    if (cbo.length === L.PROF_CBO_BOXES.length) registrarUso("cbo", cbo);
    for (const sq of state.seqs) {
      const proc = sq.codProc.join("");
      if (proc.length !== L.REL.codProc.length) continue;
      buscarProcedimentoSigtap(proc).then((p) => { if (p) registrarUso("procedimento", proc); });
    }
  };

  const registrarExportacao = async () => {
    registrarUsoDaFicha();
    if (!temSeqAtiva && !fichaIdRef.current) return;
    const fichaId = await garantirFichaExportada();
    if (!fichaId) toast.warning("PDF gerado, mas não consegui salvar a ficha na nuvem.");
  };

  // Carrega uma ficha salva no estado (load + persist + status + log LGPD). Sem auto-print
  // (isso é decisão da tela, no efeito de montagem).
  const carregarFichaSalva = async (id: string, titulo?: string): Promise<boolean> => {
    const ficha = await carregarFicha(id);
    if (!ficha) return false;
    const merged = { ...initialState(), ...(ficha.dados as Partial<State>) };
    merged.seqs = normalizarSeqs3(merged.seqs);
    setState(merged);
    persistFicha(id, titulo ?? ficha.titulo ?? "Ficha BPA-I");
    refreshStatus(id);
    registrarLeituraFicha(id);
    return true;
  };

  const novaFicha = () => {
    folhaAutoChaveRef.current = "";
    setState(initialState());
    limparFichaPersistida();
    setFicStatus(null);
  };

  const retificar = async (): Promise<void> => {
    if (!fichaIdRef.current) return;
    setRetificando(true);
    try {
      const nova = await retificarFicha(fichaIdRef.current);
      toast.success("Retificação criada. Abrindo a nova versão para edição.");
      window.location.href = `/bpa-i-v3?ficha=${nova}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao retificar.");
    } finally { setRetificando(false); }
  };

  return {
    state, setState, hydrated, setHydrated,
    orgId, cboOpcoes, setCboOpcoes,
    ficStatus, setFicStatus, congelada, substituidaPor, refreshStatus, retificando, retificar,
    fichaIdRef, fichaTituloRef, fichaTitulo, setFichaTitulo,
    pdfPendente, setPdfPendente,
    errosSeq, onValidacaoChangeSeq,
    cnsProfInvalido, temSeqAtiva, motivosInvalidos, temCamposInvalidos,
    competencia, cnesEstab, profCnsDig, profCboDig,
    estabAutoCnesRef, cnsResolvidoRef, folhaAutoChaveRef,
    storageKey, fichaIdKey, fichaTituloKey,
    persistFicha, limparFichaPersistida, nomeSugerido,
    set, updateSeq, repetirPaciente, prevTemPaciente,
    vincularPaciente, desvincularPaciente, reidratarPaciente, usarUltimoProc,
    adicionarSeq, duplicarUltimaSeq, removerSeq,
    checarDuplicidade, reconciliarESalvar, garantirFichaExportada, registrarExportacao, registrarUsoDaFicha,
    carregarFichaSalva, novaFicha,
  };
}
