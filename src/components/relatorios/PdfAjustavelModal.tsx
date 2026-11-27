// Prévia do PDF AJUSTÁVEL (Montar relatório e Cadastros): antes de baixar/imprimir, escolhe a
// orientação (Automática | Retrato | Paisagem) e o "Ajustar à largura da página"; o PDF é
// refeito na hora e a prévia avisa quando a tabela precisou ser dividida em partes.
import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import type { Orientacao, ResultadoPdfTabela } from "@/lib/relatorios/pdf-tabela";

export function PdfAjustavelModal({
  titulo,
  nomeArquivo,
  gerar,
  onClose,
}: {
  titulo: string;
  nomeArquivo: string;
  gerar: (o: { orientacao: Orientacao; ajustar: boolean }) => ResultadoPdfTabela;
  onClose: () => void;
}) {
  const [orientacao, setOrientacao] = useState<Orientacao>("auto");
  const [ajustar, setAjustar] = useState(true);
  const [carregando, setCarregando] = useState(true);
  // Fotografa os dados no momento em que a prévia abre (o que se vê na tela é o que sai).
  const [gerarFixo] = useState(() => gerar);
  const res = useMemo(() => gerarFixo({ orientacao, ajustar }), [gerarFixo, orientacao, ajustar]);
  const url = useMemo(() => {
    try {
      return URL.createObjectURL(res.pdf.output("blob"));
    } catch {
      return "";
    }
  }, [res]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  useEffect(() => setCarregando(true), [url]);

  const pilula = (ativo: boolean) =>
    `btn min-h-10 rounded-full px-3.5 text-[13px] font-semibold ${ativo ? "bg-[#15213A] text-white" : "bg-[#F1F4F8] text-[#33415A] hover:bg-[#E6EBF2]"}`;
  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-[#15213A]/55 backdrop-blur-sm sm:p-4"
      onMouseDown={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-[#E3E8EF] px-4 py-3">
          <h2 className="mr-auto min-w-0 truncate text-[15px] font-semibold text-[#172033]">
            {titulo}
          </h2>
          <div role="group" aria-label="Orientação" className="flex gap-1.5">
            {(
              [
                ["auto", "Automática"],
                ["retrato", "Retrato"],
                ["paisagem", "Paisagem"],
              ] as const
            ).map(([v, r]) => (
              <button
                key={v}
                type="button"
                aria-pressed={orientacao === v}
                onClick={() => setOrientacao(v)}
                className={pilula(orientacao === v)}
              >
                {r}
              </button>
            ))}
          </div>
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-[13px] font-medium text-[#33415A]">
            <input
              type="checkbox"
              checked={ajustar}
              onChange={(e) => setAjustar(e.target.checked)}
              className="size-4 accent-[#2563D9]"
            />
            Ajustar à largura da página
          </label>
          <button
            type="button"
            onClick={() => {
              try {
                res.pdf.save(nomeArquivo);
              } catch {
                /* noop */
              }
            }}
            className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#2563D9] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1D4FB0]"
          >
            <Download className="size-4" /> Baixar PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex size-10 items-center justify-center rounded-xl border border-[#E3E8EF] text-[#5B6B82] hover:bg-[#F1F4F8]"
          >
            <X className="size-4" />
          </button>
        </header>
        <p
          className="border-b border-[#EEF2F7] bg-[#F6F8FB] px-4 py-2 text-[12.5px] text-[#33415A]"
          role="status"
        >
          {res.orientacaoUsada === "paisagem" ? "Paisagem" : "Retrato"} · fonte{" "}
          {String(res.fonte).replace(".", ",")} pt
          {res.partes > 1 && (
            <strong className="ml-2 text-[#7A4A00]">
              A tabela foi dividida em {res.partes} partes para caber na página.
            </strong>
          )}
        </p>
        <div className="relative min-h-0 flex-1 bg-[#F3F6FA]">
          {carregando && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[#5B6B82]">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          {url ? (
            <iframe
              key={url}
              src={url}
              title={titulo}
              className="h-full w-full"
              onLoad={() => setCarregando(false)}
            />
          ) : (
            <p className="p-6 text-center text-sm text-[#5B6B82]">
              Não foi possível pré-visualizar aqui. Use “Baixar PDF”.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
