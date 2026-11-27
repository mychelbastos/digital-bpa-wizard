// Cabeçalho: organização, "Produção de {mês}" (troca animada) e seletor de mês + Atualizar.
import { useRef } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { mesExtenso, mesLabel, somarMes } from "./util";

export function DashboardHeader({
  orgNome,
  competencia,
  maxComp,
  carregando,
  onCompetencia,
  onAtualizar,
}: {
  orgNome: string | null;
  competencia: string;
  maxComp: string;
  carregando: boolean;
  onCompetencia: (c: string) => void;
  onAtualizar: () => void;
}) {
  const mesRef = useRef<HTMLInputElement | null>(null);
  const podeAvancar = competencia < maxComp;
  const abrirSeletor = () => {
    const el = mesRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {orgNome && (
          <span className="rv text-[13px] text-[#5B6B82]" style={{ animationDelay: "0ms" }}>
            {orgNome}
          </span>
        )}
        <h1
          className="rv m-0 text-[26px] font-bold tracking-[-0.02em] sm:text-[30px]"
          style={{ animationDelay: "60ms" }}
        >
          Produção de{" "}
          <span key={competencia} className="sw">
            {mesExtenso(competencia)}
          </span>
        </h1>
      </div>
      <div className="rv flex flex-wrap items-center gap-2.5" style={{ animationDelay: "120ms" }}>
        <div
          role="group"
          aria-label="Mês de produção"
          className="relative flex h-11 items-center rounded-xl border border-[#D5DCE6] bg-white"
        >
          <button
            type="button"
            className="btn flex h-[42px] w-11 items-center justify-center rounded-[11px] text-[#33415A] hover:bg-[#F1F4F8]"
            aria-label="Mês anterior"
            onClick={() => onCompetencia(somarMes(competencia, -1))}
          >
            <ChevronLeft className="size-[18px]" />
          </button>
          <button
            type="button"
            onClick={abrirSeletor}
            aria-label={`Escolher o mês (atual: ${mesExtenso(competencia)})`}
            className="min-h-10 min-w-[92px] rounded-lg px-1 text-center text-[14.5px] font-semibold tabular-nums hover:bg-[#F1F4F8]"
          >
            {mesLabel(competencia)}
          </button>
          <input
            ref={mesRef}
            type="month"
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
            value={`${competencia.slice(0, 4)}-${competencia.slice(4, 6)}`}
            max={`${maxComp.slice(0, 4)}-${maxComp.slice(4, 6)}`}
            onChange={(e) => {
              const v = e.target.value.replace("-", "");
              if (/^\d{6}$/.test(v)) onCompetencia(v > maxComp ? maxComp : v);
            }}
          />
          <button
            type="button"
            className="btn flex h-[42px] w-11 items-center justify-center rounded-[11px] text-[#33415A] hover:bg-[#F1F4F8] disabled:opacity-35"
            aria-label="Próximo mês"
            disabled={!podeAvancar}
            onClick={() => podeAvancar && onCompetencia(somarMes(competencia, 1))}
          >
            <ChevronRight className="size-[18px]" />
          </button>
        </div>
        <button
          type="button"
          onClick={onAtualizar}
          disabled={carregando}
          className="btn inline-flex h-11 items-center gap-2 rounded-xl bg-[#15213A] px-4 text-sm font-semibold text-white hover:bg-[#1F2E4D] disabled:opacity-70"
        >
          <RefreshCw className={`size-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>
    </header>
  );
}
