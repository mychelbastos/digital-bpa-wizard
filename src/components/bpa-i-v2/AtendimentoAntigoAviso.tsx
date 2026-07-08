import { useEffect, useState } from "react";

interface Props {
  top: number; // %
  left: number; // %
  height: number; // %
  ativo: boolean; // true = data completa, válida, >120 dias e ainda não confirmada
  onConfirmar: () => void;
}

// Badge de aviso (não-bloqueante) para "Data do Atendimento" com mais de 120 dias.
// Fica num cantinho livre da linha (fora do PDF, data-html2canvas-ignore). Ao clicar,
// abre um popover pedindo confirmação explícita; a pessoa pode seguir preenchendo
// mesmo sem confirmar — só o badge âmbar continua visível como lembrete.
export function AtendimentoAntigoAviso({ top, left, height, ativo, onConfirmar }: Props) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!ativo) setAberto(false);
  }, [ativo]);

  if (!ativo) return null;

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Atendimento com mais de 120 dias"
        title="Atendimento com mais de 120 dias"
        data-html2canvas-ignore="true"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setAberto((o) => !o)}
        className="flex animate-pulse items-center justify-center rounded-full bg-amber-500 text-white shadow-md ring-2 ring-white transition-transform duration-150 hover:animate-none hover:scale-110 active:scale-90"
        style={{
          position: "absolute",
          top: `${top}%`,
          left: `${left}%`,
          height: `${height}%`,
          aspectRatio: "1",
          zIndex: 55,
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontSize: "0.65rem",
          fontWeight: 700,
        }}
      >
        !
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-40" data-html2canvas-ignore="true" onClick={() => setAberto(false)} />
          <div
            data-html2canvas-ignore="true"
            className="w-56 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow-xl"
            style={{ position: "absolute", top: `${top + height + 0.3}%`, left: `${Math.min(left, 70)}%`, zIndex: 60 }}
          >
            <p className="font-medium">⚠️ Atendimento com mais de 120 dias.</p>
            <p className="mt-1 text-amber-800/90">A data não será bloqueada, mas confira se está correta.</p>
            <button
              type="button"
              onClick={() => { onConfirmar(); setAberto(false); }}
              className="mt-2 w-full rounded-md bg-amber-500 px-2 py-1.5 font-medium text-white transition-colors hover:bg-amber-600"
            >
              Confirmar mesmo assim
            </button>
          </div>
        </>
      )}
    </>
  );
}
