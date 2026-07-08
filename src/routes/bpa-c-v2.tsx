import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { exportSheetPdf } from "@/lib/export-pdf";
import bpacBg from "@/assets/bpa-c.png";
import { DigitBoxes, TextField } from "@/components/DigitBoxes";
import { salvarFicha } from "@/lib/bpa-i-v2/fichas";
import { hashProducao, registrarProducaoBpa } from "@/lib/dashboard-producao";
import { toast } from "sonner";
import {
  CNES_BOXES, CNES_TOP, NAME_FIELD, UF_BOXES, UF_TOP, MES_BOXES, ANO_BOXES, FOLHA_BOXES,
  HEADER_HEIGHT_DIGIT, UF_HEIGHT, ROW_TOPS, ROW_HEIGHTS,
  procBoxes, cboBoxes, idadeBoxes, qtdBoxes, TOTAL_TOP, TOTAL_HEIGHT,
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
}

const initialState = (): State => ({
  cnes: Array(7).fill(""),
  nome: "",
  uf: Array(2).fill(""),
  mes: Array(2).fill(""),
  ano: Array(4).fill(""),
  folha: Array(3).fill(""),
  rows: Array.from({ length: 20 }, emptyRow),
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
  const FICHA_ID_KEY = "bpa-c-v2-ficha-id";

  useEffect(() => {
    setState(loadState());
    try { fichaIdRef.current = localStorage.getItem(FICHA_ID_KEY); } catch { /* noop */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state, hydrated]);

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const updateRow = (i: number, field: keyof RowData, vals: string[]) => {
    setState((prev) => {
      const next = [...prev.rows];
      next[i] = { ...next[i], [field]: vals };
      return { ...prev, rows: next };
    });
  };

  const clearAtendimentos = () => {
    if (!confirm("Zerar todos os campos de Atendimento Realizado (20 linhas)?")) return;
    setState((prev) => ({ ...prev, rows: Array.from({ length: 20 }, emptyRow) }));
  };

  const clearAll = () => {
    if (!confirm("Zerar TODAS as informações do formulário?")) return;
    setState(initialState());
  };

  const exportPdf = async () => {
    if (!sheetRef.current) return;
    setPrinting(true);
    await new Promise((r) => setTimeout(r, 80));
    try {
      await exportSheetPdf(sheetRef.current, "BPA-C.pdf");
      await registrarExportacaoPdf();
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

  const registrarExportacaoPdf = async () => {
    const comp = competencia();
    const cnes = state.cnes.join("");
    const titulo = `BPA-C ${state.nome || cnes || "ficha"} ${comp}`.trim();
    const id = await salvarFicha(fichaIdRef.current, titulo, comp, state, {
      tipo: "BPA-C",
      cnes,
    });

    if (!id) {
      toast.warning("PDF gerado, mas não consegui salvar a ficha/produção na nuvem.");
      return;
    }
    fichaIdRef.current = id;
    try { localStorage.setItem(FICHA_ID_KEY, id); } catch { /* noop */ }

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

    const ok = await registrarProducaoBpa(linhas.filter((l): l is NonNullable<typeof l> => Boolean(l)), "pdf");
    if (!ok) toast.warning("PDF gerado, mas a produção não foi registrada na dashboard.");
  };

  // Total calculado em tempo real a partir das quantidades das 20 linhas.
  const total = calcularTotal(state.rows, qtdBoxes.length);

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
            <h1 className="text-base font-semibold">BPA-C v2 — Boletim Consolidado</h1>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">total automático</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                  <button type="button" onClick={clearAtendimentos} className="block w-full px-3 py-2 text-left hover:bg-muted">
                    Zerar atendimentos <span className="text-muted-foreground">(mantém o cabeçalho)</span>
                  </button>
                  <button type="button" onClick={clearAll} className="block w-full px-3 py-2 text-left text-destructive hover:bg-destructive/10">
                    Zerar tudo <span className="opacity-70">(apaga o formulário inteiro)</span>
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={exportPdf}
              disabled={printing}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {printing ? "Gerando..." : "Gerar PDF"}
            </button>
          </div>
        </div>
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
          <TextField {...NAME_FIELD} value={state.nome} onChange={(v) => set("nome", v)} />
          <DigitBoxes id="uf" top={UF_TOP} height={UF_HEIGHT} boxes={UF_BOXES} values={state.uf} onChange={(v) => set("uf", v)} numeric={false} compact />
          <DigitBoxes id="mes" top={UF_TOP} height={UF_HEIGHT} boxes={MES_BOXES} values={state.mes} onChange={(v) => set("mes", v)} compact />
          <DigitBoxes id="ano" top={UF_TOP} height={UF_HEIGHT} boxes={ANO_BOXES} values={state.ano} onChange={(v) => set("ano", v)} compact />
          <DigitBoxes id="folha" top={UF_TOP} height={UF_HEIGHT} boxes={FOLHA_BOXES} values={state.folha} onChange={(v) => set("folha", v)} compact />

          {/* 20 linhas */}
          {ROW_TOPS.map((top, i) => {
            const h = ROW_HEIGHTS[i];
            return (
              <div key={i}>
                <DigitBoxes id={`p-${i}`} top={top} height={h} boxes={procBoxes}
                  values={state.rows[i].procedimento} onChange={(v) => updateRow(i, "procedimento", v)} />
                <DigitBoxes id={`c-${i}`} top={top} height={h} boxes={cboBoxes}
                  values={state.rows[i].cbo} onChange={(v) => updateRow(i, "cbo", v)} />
                <DigitBoxes id={`i-${i}`} top={top} height={h} boxes={idadeBoxes}
                  values={state.rows[i].idade} onChange={(v) => updateRow(i, "idade", v)} />
                <DigitBoxes id={`q-${i}`} top={top} height={h} boxes={qtdBoxes}
                  values={state.rows[i].quantidade} onChange={(v) => updateRow(i, "quantidade", v)} />
              </div>
            );
          })}

          {/* Total — calculado automaticamente (somente leitura) */}
          <DigitBoxes id="total" top={TOTAL_TOP} height={TOTAL_HEIGHT} boxes={qtdBoxes}
            values={total.digits} onChange={() => {}} readOnly />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          O <strong>Total</strong> é somado automaticamente ({total.soma}) conforme você preenche as quantidades. Salvo automaticamente neste navegador.
        </p>
      </main>
    </div>
  );
}
