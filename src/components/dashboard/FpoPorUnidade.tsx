// FPO por unidade: selo de %, barra e acordeão com os detalhes (só contagens — o resumo não
// traz nomes de procedimentos).
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FpoResumoUnidade } from "@/lib/fpo/fpo";
import { Sk } from "./Skeletons";
import { brlFmt } from "./util";

const brl = (n: number) => brlFmt(n).replace(/^R\$\s?/, "");

export function FpoPorUnidade({
  resumo,
  nomeCnes,
  competencia,
  carregando,
}: {
  resumo: FpoResumoUnidade[];
  nomeCnes: (c: string) => string;
  competencia: string;
  carregando: boolean;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  // Só as unidades que FATURARAM algo no mês (com ou sem teto). Unidade sem nenhuma produção
  // (0%) não aparece — o card fica curto e focado. A faixa do topo continua com o teto total.
  const comProducao = resumo.filter(
    (u) => u.produzidoQtd > 0 || u.produzidoForaQtd > 0 || u.produzidoRS > 0,
  );
  // A primeira unidade com problema (acima do teto ou produção sem teto) já vem aberta.
  useEffect(() => {
    const prob = comProducao.find(
      (u) =>
        u.estourados > 0 || u.produzidoForaQtd > 0 || (u.tetoRS > 0 && u.produzidoRS > u.tetoRS),
    );
    setAberto(prob ? prob.cnes : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumo]);

  return (
    <section
      className="card rv flex min-w-0 flex-[4_1_300px] flex-col gap-3.5 rounded-[18px] border border-[#E3E8EF] bg-white px-6 py-[22px]"
      style={{ animationDelay: "320ms" }}
    >
      <h2 className="m-0 text-base font-semibold">FPO por unidade</h2>
      {carregando ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Sk key={i} h={54} style={{ borderRadius: 12 }} />
          ))}
        </div>
      ) : resumo.length > 0 && comProducao.length === 0 ? (
        <p className="text-[13.5px] text-[#5B6B82]">
          Nenhuma unidade com produção no FPO neste mês.
        </p>
      ) : resumo.length === 0 ? (
        <p className="text-[13.5px] text-[#5B6B82]">
          Sem FPO cadastrada para as unidades neste mês.{" "}
          <Link
            to="/fpo"
            search={{ comp: competencia }}
            className="font-semibold text-[#2563D9] hover:underline"
          >
            Abrir FPO
          </Link>
        </p>
      ) : (
        comProducao.map((u) => {
          const r = u.tetoRS > 0 ? u.produzidoRS / u.tetoRS : 0;
          const over = r > 1;
          const sem = !over && u.produzidoForaQtd > 0;
          const isOpen = aberto === u.cnes;
          const painelId = `fpo-${u.cnes}`;
          return (
            <div key={u.cnes} className="overflow-hidden rounded-xl border border-[#EDF1F5]">
              <button
                type="button"
                className="row-l flex w-full flex-col gap-2 border-0 bg-transparent px-3.5 py-3 text-left"
                aria-expanded={isOpen}
                aria-controls={painelId}
                onClick={() => setAberto(isOpen ? null : u.cnes)}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13.5px] font-semibold">
                    {nomeCnes(u.cnes)}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${over ? "bg-[#FDECEA] text-[#A3241A]" : sem ? "bg-[#FFF4DF] text-[#7A4A00]" : "bg-[#E7F6EE] text-[#0B6B44]"}`}
                    >
                      {Math.round(r * 100)}%{over ? " · acima" : ""}
                    </span>
                    <ChevronDown
                      className="size-4 text-[#5B6B82]"
                      style={{
                        transition: "transform var(--duration-base) var(--ease-smooth-out)",
                        transform: `rotate(${isOpen ? 180 : 0}deg)`,
                      }}
                    />
                  </span>
                </span>
                <span className="relative block h-1.5 w-full overflow-hidden rounded-[3px] bg-[#EEF2F7]">
                  <span
                    className="absolute inset-y-0 left-0 rounded-[3px]"
                    style={{
                      width: `${Math.min(100, r * 100).toFixed(1)}%`,
                      background: over ? "#C9302C" : "#12805C",
                    }}
                  />
                </span>
              </button>
              <div
                id={painelId}
                className="grid"
                style={{
                  gridTemplateRows: isOpen ? "1fr" : "0fr",
                  transition: "grid-template-rows var(--duration-base) var(--ease-smooth-out)",
                }}
              >
                <div className="overflow-hidden">
                  <div className="flex flex-col gap-1.5 px-3.5 pb-3 text-[12.5px] text-[#33415A]">
                    <span className="tabular-nums">
                      R$ {brl(u.produzidoRS)} de R$ {brl(u.tetoRS)}
                    </span>
                    {u.estourados > 0 && (
                      <span className="text-[#A3241A]">
                        {u.estourados} procedimento{u.estourados === 1 ? "" : "s"} acima do teto
                      </span>
                    )}
                    {u.produzidoForaQtd > 0 && (
                      <span className="text-[#7A4A00]">
                        {u.produzidoForaQtd} produzido{u.produzidoForaQtd === 1 ? "" : "s"} sem teto
                      </span>
                    )}
                    {u.estourados === 0 && u.produzidoForaQtd === 0 && !over && (
                      <span className="text-[#0B6B44]">Dentro do teto.</span>
                    )}
                    <Link
                      to="/fpo"
                      search={{ cnes: u.cnes, comp: competencia }}
                      tabIndex={isOpen ? 0 : -1}
                      className="more inline-flex min-h-8 items-center gap-1 font-semibold text-[#2563D9]"
                    >
                      Ver no FPO <ChevronRight className="chev size-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
