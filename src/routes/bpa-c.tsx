import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
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

function BpaC() {
  const [cnes, setCnes] = useState<string[]>(Array(7).fill(""));
  const [nome, setNome] = useState("");
  const [uf, setUf] = useState<string[]>(Array(2).fill(""));
  const [mes, setMes] = useState<string[]>(Array(2).fill(""));
  const [ano, setAno] = useState<string[]>(Array(4).fill(""));
  const [folha, setFolha] = useState<string[]>(Array(3).fill(""));
  const [rows, setRows] = useState<RowData[]>(() => Array.from({ length: 20 }, emptyRow));
  const [total, setTotal] = useState<string[]>(Array(6).fill(""));
  const [printing, setPrinting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const updateRow = (i: number, field: keyof RowData, vals: string[]) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: vals };
      return next;
    });
  };

  const exportPdf = async () => {
    if (!sheetRef.current) return;
    setPrinting(true);
    await new Promise((r) => setTimeout(r, 60));
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
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
            <h1 className="text-base font-semibold">BPA-C — Boletim Consolidado</h1>
          </div>
          <button
            onClick={exportPdf}
            disabled={printing}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {printing ? "Gerando..." : "Gerar PDF"}
          </button>
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
          <DigitBoxes id="cnes" top={CNES_TOP} height={HEADER_HEIGHT_DIGIT} boxes={CNES_BOXES} values={cnes} onChange={setCnes} />
          <TextField {...NAME_FIELD} value={nome} onChange={setNome} />
          <DigitBoxes id="uf" top={UF_TOP} height={UF_HEIGHT} boxes={UF_BOXES} values={uf} onChange={setUf} numeric={false} />
          <DigitBoxes id="mes" top={UF_TOP} height={UF_HEIGHT} boxes={MES_BOXES} values={mes} onChange={setMes} />
          <DigitBoxes id="ano" top={UF_TOP} height={UF_HEIGHT} boxes={ANO_BOXES} values={ano} onChange={setAno} />
          <DigitBoxes id="folha" top={UF_TOP} height={UF_HEIGHT} boxes={FOLHA_BOXES} values={folha} onChange={setFolha} />

          {/* 20 rows */}
          {ROW_TOPS.map((top, i) => {
            const h = ROW_HEIGHTS[i];
            return (
              <div key={i}>
                <DigitBoxes id={`p-${i}`} top={top} height={h} boxes={procBoxes}
                  values={rows[i].procedimento} onChange={(v) => updateRow(i, "procedimento", v)} />
                <DigitBoxes id={`c-${i}`} top={top} height={h} boxes={cboBoxes}
                  values={rows[i].cbo} onChange={(v) => updateRow(i, "cbo", v)} />
                <DigitBoxes id={`i-${i}`} top={top} height={h} boxes={idadeBoxes}
                  values={rows[i].idade} onChange={(v) => updateRow(i, "idade", v)} />
                <DigitBoxes id={`q-${i}`} top={top} height={h} boxes={qtdBoxes}
                  values={rows[i].quantidade} onChange={(v) => updateRow(i, "quantidade", v)} />
              </div>
            );
          })}

          {/* Total */}
          <DigitBoxes id="total" top={TOTAL_TOP} height={TOTAL_HEIGHT} boxes={qtdBoxes}
            values={total} onChange={setTotal} />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Posicione os valores diretamente sobre o formulário oficial. Use Tab ou setas para navegar entre as caixinhas.
        </p>
      </main>
    </div>
  );
}
