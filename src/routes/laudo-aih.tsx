import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { FileDown, Eraser, Ruler } from "lucide-react";
import { toast } from "sonner";
import { exportSheetPdf } from "@/lib/export-pdf";
import laudoBg from "@/assets/laudo-aih.png";
import { CAMPOS, CHECKS } from "@/lib/laudo-aih-layout";

export const Route = createFileRoute("/laudo-aih")({
  head: () => ({ meta: [{ title: "Laudo AIH — Solicitação de Internação Hospitalar" }] }),
  component: LaudoAihPage,
});

const STORAGE_KEY = "laudo-aih-state-v1";

interface Estado {
  txt: Record<string, string>;
  chk: Record<string, boolean>;
}
const initial = (): Estado => ({ txt: {}, chk: {} });

function LaudoAihPage() {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>(initial);
  const [contornos, setContornos] = useState(false);
  const [exportando, setExportando] = useState(false);

  // Carrega/salva no navegador.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setEstado({ ...initial(), ...JSON.parse(raw) });
    } catch { /* ignora */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(estado)); } catch { /* ignora */ }
  }, [estado]);

  const setTxt = (key: string, v: string) => setEstado((e) => ({ ...e, txt: { ...e.txt, [key]: v } }));
  const toggle = (key: string) => setEstado((e) => ({ ...e, chk: { ...e.chk, [key]: !e.chk[key] } }));

  const limpar = () => {
    if (!confirm("Limpar todo o Laudo AIH?")) return;
    setEstado(initial());
  };

  const baixarPdf = async () => {
    if (!sheetRef.current) return;
    setExportando(true);
    try {
      await exportSheetPdf(sheetRef.current, "laudo-aih.pdf");
      toast.success("PDF gerado.");
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setExportando(false);
    }
  };

  const pct = (n: number) => `${n}%`;
  const contornoCls = contornos ? "outline outline-1 outline-sky-400/70" : "";

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
            <h1 className="text-base font-semibold">Laudo AIH — Solicitação de Internação Hospitalar</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setContornos((c) => !c)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${contornos ? "border-sky-400 bg-sky-50 text-sky-700" : "border-border bg-card text-foreground hover:bg-muted"}`}>
              <Ruler className="size-4" /> Contornos
            </button>
            <button onClick={limpar} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
              <Eraser className="size-4" /> Limpar
            </button>
            <button onClick={baixarPdf} disabled={exportando} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              <FileDown className="size-4" /> {exportando ? "Gerando…" : "Baixar PDF"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-4 max-w-[1100px] px-4">
        <div
          ref={sheetRef}
          className="form-sheet"
          style={{ aspectRatio: "1544 / 2204", containerType: "inline-size" }}
        >
          <img src={laudoBg} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />

          {CAMPOS.map((c) => {
            const style = { top: pct(c.top), left: pct(c.left), width: pct(c.width), height: pct(c.height ?? 1.3) } as const;
            const val = estado.txt[c.key] ?? "";
            const onChange = (v: string) => setTxt(c.key, c.upper ? v.toUpperCase() : v);
            return c.area ? (
              <textarea key={c.key} value={val} onChange={(e) => onChange(e.target.value)}
                className={`form-text absolute resize-none whitespace-pre-wrap ${contornoCls}`}
                style={{ ...style, textAlign: "left", lineHeight: 1.2 }} />
            ) : (
              <input key={c.key} value={val} onChange={(e) => onChange(e.target.value)}
                className={`form-text absolute ${contornoCls}`} style={style} />
            );
          })}

          {CHECKS.map((c) => (
            <button key={c.key} type="button" onClick={() => toggle(c.key)}
              className={`absolute flex items-center justify-center ${contornoCls}`}
              style={{ top: pct(c.top), left: pct(c.left), width: "1.4%", height: "1.0%" }}
              aria-label={c.key} aria-pressed={estado.chk[c.key] || false}>
              {estado.chk[c.key] && <span className="text-[#0a2540]" style={{ fontSize: "min(2.6cqw, 16px)", fontWeight: 800, lineHeight: 1 }}>✕</span>}
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Salvo automaticamente neste navegador. Use <strong>Contornos</strong> para ver a posição dos campos durante a calibração.
        </p>
      </main>
    </div>
  );
}
