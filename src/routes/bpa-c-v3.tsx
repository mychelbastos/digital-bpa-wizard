import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { exportSheetPdf } from "@/lib/export-pdf";
import bpacBg from "@/assets/bpa-c (profissional).png";
import { DigitBoxes, DigitBoxesClearableContext } from "@/components/DigitBoxes";
import { ancorarDigitosDireita } from "@/lib/digitos-direita";
import { EstabelecimentoAutocomplete } from "@/components/bpa-i-v2/EstabelecimentoAutocomplete";
import { NomeProfissionalAutocomplete } from "@/components/bpa-c-v3/NomeProfissionalAutocomplete";
import { LinhaBpaC } from "@/components/bpa-c-v2/LinhaBpaC";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { sincronizarProfissionais } from "@/lib/bpa-i-v2/profissionais";
import { salvarFicha, carregarFicha } from "@/lib/bpa-i-v2/fichas";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/bpa-i-v2/ConfirmModal";
import { SalvarFichaModal } from "@/components/bpa-i-v2/SalvarFichaModal";
import { MinhasFichas } from "@/components/bpa-i-v2/MinhasFichas";
import { ConfirmarResponsavel } from "@/components/bpa-i-v2/ConfirmarResponsavel";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import type { Confirmacao } from "@/lib/bpa-i-v2/confirmacao";
import { statusDaFicha, retificarFicha, type FichaStatus } from "@/lib/producoes";
import { Snowflake, GitBranch } from "lucide-react";
import {
  CNES_BOXES, CNES_TOP, NAME_FIELD, UF_BOXES, UF_TOP, MES_BOXES, ANO_BOXES, FOLHA_BOXES,
  NOME_PROFISSIONAL_FIELD,
  HEADER_HEIGHT_DIGIT, UF_HEIGHT, ROW_TOPS, ROW_HEIGHTS,
  qtdBoxes, TOTAL_TOP, TOTAL_HEIGHT, RESP_CONFIRM,
  RESP_DATA_TOP, RESP_DATA_H, RESP_DATA_DIA, RESP_DATA_MES, RESP_DATA_ANO,
  emptyRow, type RowData,
} from "@/lib/bpac-v3-layout";

export const Route = createFileRoute("/bpa-c-v3")({
  head: () => ({
    meta: [
      { title: "BPA-C — Boletim de Produção Ambulatorial Consolidado" },
      { name: "description", content: "BPA-C digital com total somado automaticamente e produção por profissional." },
    ],
  }),
  component: BpaCV3,
});

const STORAGE_KEY = "bpa-c-v3-state-v1";

// v3: o Total NÃO faz parte do estado — é derivado (soma das quantidades das 20 linhas).
// Novidade vs v2: `profNome` (Nome do Profissional). É controle interno do painel —
// NÃO vai para o .txt / BPA Magnético (o gerador só lê cnes/ano/mes/folha/rows).
interface State {
  cnes: string[];
  nome: string;
  profNome: string; // Nome do Profissional (painel — NÃO exportado ao .txt)
  uf: string[];
  mes: string[];
  ano: string[];
  folha: string[];
  rows: RowData[];
  respConfirmacao: Confirmacao | null;
  respData: string[]; // 8 dígitos — data da formalização (auto: hoje)
}

// Mês/Ano da competência atual (pré-preenchidos por padrão; o usuário pode alterar).
const competenciaAtual = () => {
  const agora = new Date();
  return {
    mes: String(agora.getMonth() + 1).padStart(2, "0").split(""),
    ano: String(agora.getFullYear()).padStart(4, "0").split(""),
  };
};

// Data de hoje como 8 dígitos [D,D,M,M,A,A,A,A] — pré-preenche o campo DATA da assinatura.
const hojeDigits = (): string[] => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = String(d.getFullYear()).padStart(4, "0");
  return `${dd}${mm}${aaaa}`.split("");
};

const initialState = (): State => ({
  cnes: Array(7).fill(""),
  nome: "",
  profNome: "",
  uf: Array(2).fill(""),
  mes: competenciaAtual().mes,
  ano: competenciaAtual().ano,
  folha: Array(3).fill(""),
  rows: Array.from({ length: 20 }, emptyRow),
  respConfirmacao: null,
  respData: hojeDigits(),
});

// Normaliza Quantidade e Idade de todas as linhas para ancoradas à direita (estilo
// calculadora), convertendo valores salvos no formato antigo (à esquerda). Idempotente.
// Também GARANTE no mínimo 20 linhas (o formulário renderiza 20 fixas): fichas importadas
// têm nº de linhas variável (< 20) e, sem o preenchimento, o render acessaria state.rows[i]
// indefinido e quebraria a página. `...emptyRow()` blinda campos ausentes de fichas antigas.
function normalizarQuantidades(s: State): State {
  const base = s.rows ?? [];
  const rows = base.length >= 20 ? base : [...base, ...Array.from({ length: 20 - base.length }, emptyRow)];
  return {
    ...s,
    rows: rows.map((r) => ({
      ...emptyRow(),
      ...r,
      quantidade: ancorarDigitosDireita((r?.quantidade ?? []).join(""), 5),
      idade: ancorarDigitosDireita((r?.idade ?? []).join(""), 3),
    })),
  };
}

function loadState(): State {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<State>;
    return normalizarQuantidades({ ...initialState(), ...parsed });
  } catch {
    return initialState();
  }
}

// Soma as quantidades das 20 linhas e devolve os dígitos justificados à direita
// nas caixinhas do Total (vazio quando a soma é 0).
function calcularTotal(rows: RowData[], n: number): { digits: string[]; soma: number } {
  const soma = rows.reduce((s, r) => s + (Number(r.quantidade.join("")) || 0), 0);
  if (soma === 0) return { digits: Array(n).fill(""), soma };
  const str = String(soma).slice(-n);
  return { digits: [...Array(n - str.length).fill(""), ...str.split("")], soma };
}

function BpaCV3() {
  const [state, setState] = useState<State>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [printing, setPrinting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Impressão a partir de "Minhas fichas" (?print=1): carrega, renderiza e gera o PDF sozinho.
  // BPA-C é consolidado (sem PII de paciente), então não passa pelo log F4.
  const autoPrintRef = useRef(false);
  const [prontoImprimir, setProntoImprimir] = useState(false);
  const fichaIdRef = useRef<string | null>(null);
  const fichaTituloRef = useRef<string | null>(null);
  // Espelho reativo do título (o ref não re-renderiza) — usado no cabeçalho.
  const [fichaTitulo, setFichaTitulo] = useState<string | null>(null);
  const FICHA_ID_KEY = "bpa-c-v3-ficha-id";
  const FICHA_TITULO_KEY = "bpa-c-v3-ficha-titulo";
  const user = useAuthUser(); // pessoa logada (Responsável), p/ a confirmação eletrônica
  const [zerarAtendOpen, setZerarAtendOpen] = useState(false);
  const [zerarTudoOpen, setZerarTudoOpen] = useState(false);
  const [salvarOpen, setSalvarOpen] = useState(false);
  const [salvarComoNovo, setSalvarComoNovo] = useState(false);
  const [salvarMenuOpen, setSalvarMenuOpen] = useState(false);
  const [salvandoDireto, setSalvandoDireto] = useState(false);
  const [fichasOpen, setFichasOpen] = useState(false);
  // Ciclo de vida da ficha (Fase 3).
  const [ficStatus, setFicStatus] = useState<FichaStatus | null>(null);
  const [retificando, setRetificando] = useState(false);
  const congelada = ficStatus?.congelada ?? false;
  const substituidaPor = ficStatus?.substituida_por ?? null;
  const refreshStatus = useCallback((id: string | null) => {
    if (!id) { setFicStatus(null); return; }
    statusDaFicha(id).then(setFicStatus);
  }, []);
  // Crivo SIGTAP por linha (procedimento/idade/qtde/CBO) — cada LinhaBpaC reporta seus
  // motivos; aqui agregamos p/ acender o aviso e bloquear a geração.
  const [errosLinha, setErrosLinha] = useState<Record<number, string[]>>({});
  const onValidacaoLinha = useCallback((i: number, motivos: string[]) => {
    setErrosLinha((prev) => (prev[i]?.join("|") === motivos.join("|") ? prev : { ...prev, [i]: motivos }));
  }, []);
  const motivosInvalidos = Object.entries(errosLinha).flatMap(([i, ms]) => ms.map((m) => `Linha ${Number(i) + 1}: ${m}`));
  const temCamposInvalidos = motivosInvalidos.length > 0;

  useEffect(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const fichaParam = params?.get("ficha") ?? null;
    autoPrintRef.current = params?.get("print") === "1";
    if (fichaParam) {
      carregarFichaSalva(fichaParam);
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

  // Fonte cursiva (Caveat) p/ a "assinatura" eletrônica do Responsável.
  useEffect(() => {
    if (document.getElementById("bpa-v2-fonte-assinatura")) return;
    const link = document.createElement("link");
    link.id = "bpa-v2-fonte-assinatura";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&display=swap";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state, hydrated]);

  // Guarda o CNES que auto-preencheu o Nome (p/ a validação cruzada CNES <-> Nome).
  const estabAutoCnesRef = useRef("");
  const cells = (s: string, n: number) => Array.from({ length: n }, (_, i) => s[i] ?? "");
  const cnesEstab = state.cnes.join("");
  // CNES <-> Nome do Estabelecimento (mesma lógica do BPA-I): CNES mudou e o nome era
  // auto de outro CNES -> limpa; com 7 dígitos, busca o nome e popula o cache de
  // profissionais do estabelecimento (p/ o autocomplete do CBO/nome).
  useEffect(() => {
    if (!hydrated) return;
    if (estabAutoCnesRef.current && estabAutoCnesRef.current !== cnesEstab) {
      estabAutoCnesRef.current = "";
      setState((p) => ({ ...p, nome: "" }));
    }
    if (cnesEstab.length !== 7) return;
    let cancelled = false;
    buscarEstabelecimento(cnesEstab).then((nome) => {
      if (cancelled || !nome) return;
      estabAutoCnesRef.current = cnesEstab;
      setState((p) => ({ ...p, nome }));
    });
    sincronizarProfissionais(cnesEstab);
    return () => { cancelled = true; };
  }, [cnesEstab, hydrated]);

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const updateRow = (i: number, field: keyof RowData, vals: string[]) => {
    setState((prev) => {
      const next = [...prev.rows];
      next[i] = { ...next[i], [field]: vals };
      return { ...prev, rows: next };
    });
  };

  const exportPdf = async () => {
    if (temCamposInvalidos) {
      toast.error("Corrija os campos em vermelho (crivo SIGTAP) antes de gerar o PDF.");
      return;
    }
    if (!sheetRef.current) return;
    setPrinting(true);
    await new Promise((r) => setTimeout(r, 80));
    try {
      await exportSheetPdf(sheetRef.current, "BPA-C.pdf");
      await persistirFicha();
    } catch (err) {
      console.error("PDF export failed", err);
      alert("Falha ao gerar PDF. Veja o console para detalhes.");
    } finally {
      setPrinting(false);
    }
  };

  const competencia = () => {
    const comp = state.ano.join("") + state.mes.join("");
    if (/^[0-9]{6}$/.test(comp)) return comp;
    const hoje = new Date();
    return `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  };

  // ----- Persistência de ficha (refs + localStorage) -----
  const persistFicha = (id: string, titulo: string) => {
    fichaIdRef.current = id;
    fichaTituloRef.current = titulo;
    setFichaTitulo(titulo);
    try {
      localStorage.setItem(FICHA_ID_KEY, id);
      localStorage.setItem(FICHA_TITULO_KEY, titulo);
    } catch { /* noop */ }
  };
  const limparFichaPersistida = () => {
    fichaIdRef.current = null;
    fichaTituloRef.current = null;
    setFichaTitulo(null);
    try {
      localStorage.removeItem(FICHA_ID_KEY);
      localStorage.removeItem(FICHA_TITULO_KEY);
    } catch { /* noop */ }
  };
  const metaFicha = () => ({ tipo: "BPA-C" as const, cnes: state.cnes.join("") });

  // ----- Zerar (com modal de confirmação, no lugar do confirm() nativo) -----
  const confirmarZerarAtend = () => {
    setState((prev) => ({ ...prev, rows: Array.from({ length: 20 }, emptyRow) }));
    setZerarAtendOpen(false);
  };
  const confirmarZerarTudo = () => {
    setState(initialState());
    limparFichaPersistida();
    setZerarTudoOpen(false);
  };

  // ----- Fichas na nuvem (Salvar / Salvar como… / carregar / nova) -----
  const nomeSugerido = (): string => {
    if (salvarComoNovo && fichaTituloRef.current) return `${fichaTituloRef.current} (cópia)`;
    if (fichaTituloRef.current) return fichaTituloRef.current;
    const hoje = new Date().toLocaleDateString("pt-BR");
    const folha = state.folha.join("").replace(/^0+(?=\d)/, "");
    const partes = [state.profNome.trim().split(/\s+/)[0] || state.nome.trim().split(/\s+/)[0] || "", hoje, folha ? `Folha ${folha}` : ""].filter(Boolean);
    return partes.join(" · ") || "Ficha BPA-C";
  };
  const salvarNaNuvem = async (titulo: string) => {
    const idAlvo = salvarComoNovo ? null : fichaIdRef.current;
    const id = await salvarFicha(idAlvo, titulo, competencia(), state, metaFicha());
    if (!id) { toast.error("Não foi possível salvar. Verifique sua conexão e tente novamente."); return; }
    persistFicha(id, titulo);
    setSalvarOpen(false);
    setSalvarComoNovo(false);
    toast.success(idAlvo ? "Alterações salvas na nuvem." : `Ficha “${titulo}” salva na nuvem.`);
  };
  const salvarClique = async () => {
    if (congelada) { toast.error("Ficha congelada (produção fechada). Reabra a produção ou retifique para alterar."); return; }
    if (!fichaIdRef.current || !fichaTituloRef.current) { setSalvarComoNovo(false); setSalvarOpen(true); return; }
    setSalvandoDireto(true);
    const id = await salvarFicha(fichaIdRef.current, fichaTituloRef.current, competencia(), state, metaFicha());
    setSalvandoDireto(false);
    if (!id) { toast.error("Não foi possível salvar. Verifique sua conexão e tente novamente."); return; }
    persistFicha(id, fichaTituloRef.current);
    toast.success("Alterações salvas na nuvem.");
  };
  const salvarComoClique = () => { setSalvarComoNovo(true); setSalvarOpen(true); setSalvarMenuOpen(false); };
  const carregarFichaSalva = async (id: string, titulo?: string) => {
    const ficha = await carregarFicha(id);
    if (!ficha) return;
    setState(normalizarQuantidades({ ...initialState(), ...(ficha.dados as Partial<State>) }));
    persistFicha(id, titulo ?? ficha.titulo ?? "Ficha BPA-C");
    refreshStatus(id);
    if (autoPrintRef.current) setProntoImprimir(true);
  };
  // Auto-impressão (?print=1): quando a ficha carregou, espera a folha pintar e gera o PDF.
  useEffect(() => {
    if (!prontoImprimir) return;
    setProntoImprimir(false);
    (async () => {
      await new Promise((r) => setTimeout(r, 350));
      await exportPdf();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prontoImprimir]);
  const novaFicha = () => { setState(initialState()); limparFichaPersistida(); setFicStatus(null); };
  const retificar = async () => {
    if (!fichaIdRef.current) return;
    setRetificando(true);
    try {
      const nova = await retificarFicha(fichaIdRef.current);
      toast.success("Retificação criada. Abrindo a nova versão para edição.");
      window.location.href = `/bpa-c-v3?ficha=${nova}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao retificar.");
    } finally { setRetificando(false); }
  };

  // Salva a ficha na nuvem (a produção da dashboard é derivada das fichas salvas). O .txt
  // não sai mais daqui — é gerado só no Fechamento do mês, com toda a produção junta.
  const persistirFicha = async () => {
    const comp = competencia();
    const cnes = state.cnes.join("");
    const titulo = `BPA-C ${state.profNome || state.nome || cnes || "ficha"} ${comp}`.trim();
    const id = await salvarFicha(fichaIdRef.current, titulo, comp, state, {
      tipo: "BPA-C",
      cnes,
    });
    if (!id) {
      toast.warning("PDF gerado, mas não consegui salvar a ficha na nuvem.");
      return;
    }
    persistFicha(id, titulo);
  };

  // Total calculado em tempo real a partir das quantidades das 20 linhas.
  const total = calcularTotal(state.rows, qtdBoxes.length);

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <ConfirmModal open={zerarAtendOpen} title="Zerar atendimentos" confirmLabel="Zerar atendimentos" onCancel={() => setZerarAtendOpen(false)} onConfirm={confirmarZerarAtend}>
        <p>Isto vai apagar as 20 linhas de Atendimento Realizado (mantém o cabeçalho).</p>
      </ConfirmModal>
      <ConfirmModal open={zerarTudoOpen} title="Zerar tudo" confirmLabel="Zerar tudo" danger onCancel={() => setZerarTudoOpen(false)} onConfirm={confirmarZerarTudo}>
        <p>Isto vai apagar <strong>todas</strong> as informações do formulário (cabeçalho e as 20 linhas).</p>
      </ConfirmModal>
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
        tipo="BPA-C"
        onClose={() => setFichasOpen(false)}
        onCarregar={carregarFichaSalva}
        onNova={novaFicha}
        onRenomeada={persistFicha}
      />

      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
            <h1 className="max-w-[46vw] truncate text-base font-semibold" title={fichaTitulo ?? undefined}>
              {fichaTitulo || "Nova ficha"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-teal-100 px-2 py-1 text-xs font-bold tracking-wide text-teal-700">BPA-C</span>
            {user && (
              <div className="group relative flex">
                <button
                  onClick={salvarClique}
                  disabled={salvandoDireto || congelada}
                  title={congelada ? "Ficha congelada — reabra a produção ou retifique" : fichaTituloRef.current ? "Salvar alterações nesta ficha" : "Salvar esta ficha na sua conta (nuvem)"}
                  className={`rounded-l-md border border-r-0 border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60${congelada ? " opacity-50" : ""}`}
                >
                  {salvandoDireto ? "Salvando…" : `💾 Salvar${fichaTituloRef.current ? "" : " ficha"}`}
                </button>
                <button type="button" onClick={() => setSalvarMenuOpen((o) => !o)} title="Mais opções de salvar" className="rounded-r-md border border-primary/40 bg-primary/5 px-1.5 py-2 text-xs font-medium text-primary hover:bg-primary/10">▾</button>
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
              <div className="invisible absolute right-0 top-full z-50 pt-1 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <div className="w-56 overflow-hidden rounded-md border border-border bg-background py-1 text-xs shadow-lg">
                  <button type="button" onClick={() => setZerarAtendOpen(true)} className="block w-full px-3 py-2 text-left hover:bg-muted">
                    Zerar atendimentos <span className="text-muted-foreground">(mantém o cabeçalho)</span>
                  </button>
                  <button type="button" onClick={() => setZerarTudoOpen(true)} className="block w-full px-3 py-2 text-left text-destructive hover:bg-destructive/10">
                    Zerar tudo <span className="opacity-70">(apaga o formulário inteiro)</span>
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={exportPdf}
              disabled={printing}
              title={temCamposInvalidos ? "Corrija os campos em vermelho (crivo SIGTAP) antes de gerar" : undefined}
              className={`rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60${temCamposInvalidos ? " opacity-50" : ""}`}
            >
              {printing ? "Gerando..." : "Gerar PDF"}
            </button>
          </div>
        </div>
        {temCamposInvalidos && (
          <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800">
            <div className="mx-auto max-w-[1100px]">
              <p className="font-semibold">
                {motivosInvalidos.length === 1 ? "1 campo em vermelho" : `${motivosInvalidos.length} campos em vermelho`} (crivo SIGTAP) — corrija antes de gerar o PDF:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {motivosInvalidos.map((m, idx) => <li key={idx}>{m}</li>)}
              </ul>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto mt-4 max-w-[1100px] px-4">
        {substituidaPor ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <GitBranch className="size-4 shrink-0" />
            Esta ficha foi <strong>substituída por uma versão mais nova</strong> (retificação). Permanece só como histórico.
            <a href={`/bpa-c-v3?ficha=${substituidaPor}`} className="font-semibold text-primary hover:underline">Abrir a versão vigente →</a>
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
        <div
          ref={sheetRef}
          className={`form-sheet ${printing ? "form-sheet--print" : ""}`}
          style={{ aspectRatio: "553.5 / 786.3" }}
        >
          <img src={bpacBg} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />

          <DigitBoxesClearableContext.Provider value={true}>
          {/* Header */}
          <DigitBoxes id="cnes" top={CNES_TOP} height={HEADER_HEIGHT_DIGIT} boxes={CNES_BOXES} values={state.cnes} onChange={(v) => set("cnes", v)} compact />
          <EstabelecimentoAutocomplete
            {...NAME_FIELD}
            uppercase
            nome={state.nome}
            onChangeNome={(v) =>
              // Edição manual do Nome: se havia CNES, os dois divergem -> limpa o CNES.
              setState((prev) => {
                const tinhaCnes = prev.cnes.some(Boolean);
                if (tinhaCnes) estabAutoCnesRef.current = "";
                return { ...prev, nome: v, cnes: tinhaCnes ? Array(7).fill("") : prev.cnes };
              })
            }
            onPick={(e) => {
              estabAutoCnesRef.current = e.cnes;
              setState((prev) => ({ ...prev, nome: e.nome, cnes: cells(e.cnes, 7) }));
            }}
          />
          <DigitBoxes id="uf" top={UF_TOP} height={UF_HEIGHT} boxes={UF_BOXES} values={state.uf} onChange={(v) => set("uf", v)} numeric={false} uppercase compact />
          <DigitBoxes id="mes" top={UF_TOP} height={UF_HEIGHT} boxes={MES_BOXES} values={state.mes} onChange={(v) => set("mes", v)} compact />
          <DigitBoxes id="ano" top={UF_TOP} height={UF_HEIGHT} boxes={ANO_BOXES} values={state.ano} onChange={(v) => set("ano", v)} compact />
          {/* NOME DO PROFISSIONAL — autocomplete no cache de profissionais da unidade
              (mesma fonte do BPA-I). Texto livre em MAIÚSCULAS; controle interno do
              painel — NÃO é exportado ao .txt / BPA Magnético. */}
          <NomeProfissionalAutocomplete
            {...NOME_PROFISSIONAL_FIELD}
            cnes={cnesEstab}
            nome={state.profNome}
            onChangeNome={(v) => set("profNome", v)}
          />
          <DigitBoxes id="folha" top={UF_TOP} height={UF_HEIGHT} boxes={FOLHA_BOXES} values={state.folha} onChange={(v) => set("folha", v)} rightAlign compact />

          {/* 20 linhas — com Procedimento (SIGTAP) e CBO inteligentes */}
          {ROW_TOPS.map((top, i) => (
            <LinhaBpaC key={i} i={i} top={top} height={ROW_HEIGHTS[i]}
              row={state.rows[i]} prevRow={i > 0 ? state.rows[i - 1] : undefined}
              competencia={competencia()}
              onUpdate={(field, vals) => updateRow(i, field, vals)}
              onValidacao={onValidacaoLinha} />
          ))}

          {/* Total — calculado automaticamente (somente leitura) */}
          <DigitBoxes id="total" top={TOTAL_TOP} height={TOTAL_HEIGHT} boxes={qtdBoxes}
            values={total.digits} onChange={() => {}} readOnly />

          {/* Assinatura eletrônica do Responsável (Formalização) — posição a calibrar */}
          <ConfirmarResponsavel
            pos={RESP_CONFIRM}
            user={user}
            cnesEstab={cnesEstab}
            confirmacao={state.respConfirmacao}
            onConfirmado={(c) => set("respConfirmacao", c)}
            getSnapshot={() => ({ ...state, respConfirmacao: undefined })}
          />
          {/* DATA da formalização — preenchida automaticamente com hoje (editável) */}
          <DigitBoxes id="rdd" top={RESP_DATA_TOP} height={RESP_DATA_H} boxes={RESP_DATA_DIA}
            values={state.respData.slice(0, 2)} onChange={(v) => set("respData", [...v, ...state.respData.slice(2)])} compact />
          <DigitBoxes id="rdm" top={RESP_DATA_TOP} height={RESP_DATA_H} boxes={RESP_DATA_MES}
            values={state.respData.slice(2, 4)} onChange={(v) => set("respData", [...state.respData.slice(0, 2), ...v, ...state.respData.slice(4)])} compact />
          <DigitBoxes id="rda" top={RESP_DATA_TOP} height={RESP_DATA_H} boxes={RESP_DATA_ANO}
            values={state.respData.slice(4, 8)} onChange={(v) => set("respData", [...state.respData.slice(0, 4), ...v])} compact />
          </DigitBoxesClearableContext.Provider>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          O <strong>Total</strong> é somado automaticamente ({total.soma}) conforme você preenche as quantidades. Salvo automaticamente neste navegador.
        </p>
      </main>
    </div>
  );
}
