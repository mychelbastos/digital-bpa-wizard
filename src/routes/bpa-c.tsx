import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";
import bpacBg from "@/assets/bpa-c.png.asset.json";
import { DigitBoxes, TextField } from "@/components/DigitBoxes";
import {
  CNES_BOXES, CNES_TOP, NAME_FIELD, UF_BOXES, UF_TOP, MES_BOXES, ANO_BOXES, FOLHA_BOXES,
  HEADER_HEIGHT_DIGIT, UF_HEIGHT, ROW_TOPS, ROW_HEIGHTS,
  procBoxes, cboBoxes, idadeBoxes, qtdBoxes, TOTAL_TOP, TOTAL_HEIGHT,
  emptyRow, type RowData,
} from "@/lib/bpac-layout";

export const Route = createFileRoute("/bpa-c")({
  head: () => ({
    meta: [
      { title: "BPA-C Digital — Boletim de Produção Ambulatorial Consolidado" },
      { name: "description", content: "Preencha digitalmente o formulário BPA-C do Ministério da Saúde com layout pixel-perfect e exportação em PDF." },
    ],
  }),
  component: BpaC,
});

const STORAGE_KEY = "bpa-c-state-v1";

interface State {
  cnes: string[];
  nome: string;
  uf: string[];
  mes: string[];
  ano: string[];
  folha: string[];
  rows: RowData[];
  total: string[];
}

const initialState = (): State => ({
  cnes: Array(7).fill(""),
  nome: "",
  uf: Array(2).fill(""),
  mes: Array(2).fill(""),
  ano: Array(4).fill(""),
  folha: Array(3).fill(""),
  rows: Array.from({ length: 20 }, emptyRow),
  total: Array(6).fill(""),
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

function BpaC() {
  const [state, setState] = useState<State>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [printing, setPrinting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setState(loadState());
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
    if (!confirm("Zerar todos os campos de Atendimento Realizado (20 linhas + total)?")) return;
    setState((prev) => ({
      ...prev,
      rows: Array.from({ length: 20 }, emptyRow),
      total: Array(6).fill(""),
    }));
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
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const img = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      pdf.addImage(img, "JPEG", 0, 0, pw, ph);
      pdf.save("BPA-C.pdf");
    } catch (err) {
      console.error("PDF export failed", err);
      alert("Falha ao gerar PDF. Veja o console para detalhes.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
            <h1 className="text-base font-semibold">BPA-C — Boletim Consolidado</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={clearAtendimentos}
              className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              Zerar atendimentos
            </button>
            <button
              onClick={clearAll}
              className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              Zerar tudo
            </button>
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
          <img src={bpacBg.url} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />

          {/* Header */}
          <DigitBoxes id="cnes" top={CNES_TOP} height={HEADER_HEIGHT_DIGIT} boxes={CNES_BOXES} values={state.cnes} onChange={(v) => set("cnes", v)} compact />
          <TextField {...NAME_FIELD} value={state.nome} onChange={(v) => set("nome", v)} />
          <DigitBoxes id="uf" top={UF_TOP} height={UF_HEIGHT} boxes={UF_BOXES} values={state.uf} onChange={(v) => set("uf", v)} numeric={false} compact />
          <DigitBoxes id="mes" top={UF_TOP} height={UF_HEIGHT} boxes={MES_BOXES} values={state.mes} onChange={(v) => set("mes", v)} compact />
          <DigitBoxes id="ano" top={UF_TOP} height={UF_HEIGHT} boxes={ANO_BOXES} values={state.ano} onChange={(v) => set("ano", v)} compact />
          <DigitBoxes id="folha" top={UF_TOP} height={UF_HEIGHT} boxes={FOLHA_BOXES} values={state.folha} onChange={(v) => set("folha", v)} compact />

          {/* 20 rows */}
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

          {/* Total */}
          <DigitBoxes id="total" top={TOTAL_TOP} height={TOTAL_HEIGHT} boxes={qtdBoxes}
            values={state.total} onChange={(v) => set("total", v)} />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Seus dados são salvos automaticamente neste navegador. Use Tab ou setas para navegar entre as caixinhas.
        </p>
      </main>
    </div>
  );
}
