import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { exportSheetPdf } from "@/lib/export-pdf";
import bpacBg from "@/assets/bpa-c.png";
import { DigitBoxes } from "@/components/DigitBoxes";
import { EstabelecimentoAutocomplete } from "@/components/bpa-i-v2/EstabelecimentoAutocomplete";
import { LinhaBpaC } from "@/components/bpa-c-v2/LinhaBpaC";
import { gerarArquivoBpaC, rowPreenchida } from "@/lib/bpa-c-v2/bpa-magnetico";
import { loadConfig } from "@/lib/bpa-i-v2/config";
import { baixarTxt } from "@/lib/export-txt";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { sincronizarProfissionais } from "@/lib/bpa-i-v2/profissionais";
import { salvarFicha, carregarFicha } from "@/lib/bpa-i-v2/fichas";
import { hashProducao, registrarProducaoBpa } from "@/lib/dashboard-producao";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/bpa-i-v2/ConfirmModal";
import { SalvarFichaModal } from "@/components/bpa-i-v2/SalvarFichaModal";
import { MinhasFichas } from "@/components/bpa-i-v2/MinhasFichas";
import { LoginControl } from "@/components/bpa-i-v2/LoginControl";
import { ConfirmarResponsavel } from "@/components/bpa-i-v2/ConfirmarResponsavel";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import type { Confirmacao } from "@/lib/bpa-i-v2/confirmacao";
import {
  CNES_BOXES, CNES_TOP, NAME_FIELD, UF_BOXES, UF_TOP, MES_BOXES, ANO_BOXES, FOLHA_BOXES,
  HEADER_HEIGHT_DIGIT, UF_HEIGHT, ROW_TOPS, ROW_HEIGHTS,
  qtdBoxes, TOTAL_TOP, TOTAL_HEIGHT, RESP_CONFIRM,
  RESP_DATA_TOP, RESP_DATA_H, RESP_DATA_DIA, RESP_DATA_MES, RESP_DATA_ANO,
  emptyRow, type RowData,
} from "@/lib/bpac-layout";

export const Route = createFileRoute("/bpa-c-v2")({
  head: () => ({
    meta: [
      { title: "BPA-C v2 — Boletim de Produção Ambulatorial Consolidado" },
      { name: "description", content: "BPA-C digital com total somado automaticamente em tempo real." },
    ],
  }),
  component: BpaCV2,
});

const STORAGE_KEY = "bpa-c-v2-state-v1";

// v2: o Total NÃO faz parte do estado — é derivado (soma das quantidades das 20 linhas).
interface State {
  cnes: string[];
  nome: string;
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
  uf: Array(2).fill(""),
  mes: competenciaAtual().mes,
  ano: competenciaAtual().ano,
  folha: Array(3).fill(""),
  rows: Array.from({ length: 20 }, emptyRow),
  respConfirmacao: null,
  respData: hojeDigits(),
});

function loadState(): State {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<State>;
    return { ...initialState(), ...parsed };
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

function BpaCV2() {
  const [state, setState] = useState<State>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [printing, setPrinting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const fichaIdRef = useRef<string | null>(null);
  const fichaTituloRef = useRef<string | null>(null);
  const FICHA_ID_KEY = "bpa-c-v2-ficha-id";
  const FICHA_TITULO_KEY = "bpa-c-v2-ficha-titulo";
  const user = useAuthUser(); // pessoa logada (Responsável), p/ a confirmação eletrônica
  const [zerarAtendOpen, setZerarAtendOpen] = useState(false);
  const [zerarTudoOpen, setZerarTudoOpen] = useState(false);
  const [salvarOpen, setSalvarOpen] = useState(false);
  const [salvarComoNovo, setSalvarComoNovo] = useState(false);
  const [salvarMenuOpen, setSalvarMenuOpen] = useState(false);
  const [salvandoDireto, setSalvandoDireto] = useState(false);
  const [fichasOpen, setFichasOpen] = useState(false);
  // Crivo SIGTAP por linha (procedimento/idade/qtde/CBO) — cada LinhaBpaC reporta seus
  // motivos; aqui agregamos p/ acender o aviso e bloquear a geração.
  const [errosLinha, setErrosLinha] = useState<Record<number, string[]>>({});
  const onValidacaoLinha = useCallback((i: number, motivos: string[]) => {
    setErrosLinha((prev) => (prev[i]?.join("|") === motivos.join("|") ? prev : { ...prev, [i]: motivos }));
  }, []);
  const motivosInvalidos = Object.entries(errosLinha).flatMap(([i, ms]) => ms.map((m) => `Linha ${Number(i) + 1}: ${m}`));
  const temCamposInvalidos = motivosInvalidos.length > 0;

  useEffect(() => {
    const fichaParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ficha") : null;
    if (fichaParam) {
      carregarFichaSalva(fichaParam);
    } else {
      setState(loadState());
      try {
        fichaIdRef.current = localStorage.getItem(FICHA_ID_KEY);
        fichaTituloRef.current = localStorage.getItem(FICHA_TITULO_KEY);
      } catch { /* noop */ }
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
      await registrarExportacao("pdf");
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
    const partes = [state.nome.trim().split(/\s+/)[0] ?? "", hoje, folha ? `Folha ${folha}` : ""].filter(Boolean);
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
    const dados = await carregarFicha(id);
    if (!dados) return;
    setState({ ...initialState(), ...(dados as Partial<State>) });
    persistFicha(id, titulo ?? "Ficha BPA-C");
  };
  const novaFicha = () => { setState(initialState()); limparFichaPersistida(); };

  const registrarExportacao = async (formato: "pdf" | "txt" = "pdf") => {
    const comp = competencia();
    const cnes = state.cnes.join("");
    const titulo = `BPA-C ${state.nome || cnes || "ficha"} ${comp}`.trim();
    const id = await salvarFicha(fichaIdRef.current, titulo, comp, state, {
      tipo: "BPA-C",
      cnes,
    });

    if (!id) {
      toast.warning("Arquivo gerado, mas não consegui salvar a ficha/produção na nuvem.");
      return;
    }
    persistFicha(id, titulo);

    const linhas = await Promise.all(state.rows.map(async (r, index) => {
      const procedimento = r.procedimento.join("");
      const quantidade = Number(r.quantidade.join("")) || 0;
      if (!procedimento || quantidade <= 0) return null;
      const cbo = r.cbo.join("");
      const sourceKey = await hashProducao(["BPA-C", comp, cnes, state.folha.join(""), index, procedimento, cbo, r.idade.join(""), quantidade]);
      return {
        sourceKey,
        fichaId: id,
        tipo: "BPA-C" as const,
        competencia: comp,
        cnes,
        estabelecimentoNome: state.nome,
        cbo,
        procedimento,
        quantidade,
        idade: Number(r.idade.join("")) || null,
      };
    }));

    const ok = await registrarProducaoBpa(linhas.filter((l): l is NonNullable<typeof l> => Boolean(l)), formato);
    if (!ok) toast.warning("Arquivo gerado, mas a produção não foi registrada na dashboard.");
  };

  // Gera e baixa o arquivo magnético BPA-C (.txt) da ficha atual (registro 02).
  const exportTxt = async () => {
    if (temCamposInvalidos) {
      toast.error("Corrija os campos em vermelho (crivo SIGTAP) antes de gerar o .txt.");
      return;
    }
    if (!state.rows.some(rowPreenchida)) {
      toast.error("Preencha ao menos um procedimento com quantidade antes de gerar o .txt.");
      return;
    }
    try {
      const arq = gerarArquivoBpaC(
        { cnes: state.cnes, ano: state.ano, mes: state.mes, folhaBase: state.folha, rows: state.rows },
        loadConfig(),
      );
      baixarTxt(arq.nome, arq.conteudo);
      await registrarExportacao("txt");
    } catch (err) {
      console.error("Falha ao gerar arquivo magnético BPA-C", err);
      toast.error("Falha ao gerar o arquivo magnético. Veja o console.");
    }
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
            <h1 className="text-base font-semibold">BPA-C v2 — Boletim Consolidado</h1>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">total automático</span>
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
              onClick={exportTxt}
              title={temCamposInvalidos ? "Corrija os campos em vermelho (crivo SIGTAP) antes de gerar" : "Gerar arquivo magnético BPA-C (.txt) p/ importar no SIA/SUS"}
              className={`rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100${temCamposInvalidos ? " opacity-50" : ""}`}
            >
              Gerar .txt
            </button>
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
        <div
          ref={sheetRef}
          className={`form-sheet ${printing ? "form-sheet--print" : ""}`}
          style={{ aspectRatio: "553.5 / 786.3" }}
        >
          <img src={bpacBg} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />

          {/* Header */}
          <DigitBoxes id="cnes" top={CNES_TOP} height={HEADER_HEIGHT_DIGIT} boxes={CNES_BOXES} values={state.cnes} onChange={(v) => set("cnes", v)} compact />
          <EstabelecimentoAutocomplete
            {...NAME_FIELD}
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
          <DigitBoxes id="uf" top={UF_TOP} height={UF_HEIGHT} boxes={UF_BOXES} values={state.uf} onChange={(v) => set("uf", v)} numeric={false} compact />
          <DigitBoxes id="mes" top={UF_TOP} height={UF_HEIGHT} boxes={MES_BOXES} values={state.mes} onChange={(v) => set("mes", v)} compact />
          <DigitBoxes id="ano" top={UF_TOP} height={UF_HEIGHT} boxes={ANO_BOXES} values={state.ano} onChange={(v) => set("ano", v)} compact />
          <DigitBoxes id="folha" top={UF_TOP} height={UF_HEIGHT} boxes={FOLHA_BOXES} values={state.folha} onChange={(v) => set("folha", v)} compact />

          {/* 20 linhas — com Procedimento (SIGTAP) e CBO inteligentes */}
          {ROW_TOPS.map((top, i) => (
            <LinhaBpaC key={i} i={i} top={top} height={ROW_HEIGHTS[i]}
              row={state.rows[i]} onUpdate={(field, vals) => updateRow(i, field, vals)}
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
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          O <strong>Total</strong> é somado automaticamente ({total.soma}) conforme você preenche as quantidades. Salvo automaticamente neste navegador.
        </p>
      </main>
    </div>
  );
}
