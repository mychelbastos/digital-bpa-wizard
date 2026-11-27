// Faixa escura: total do mês (com variação), barra por tipo, unidades, profissionais e FPO.
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { CountUp } from "./CountUp";
import { Sk } from "./Skeletons";
import { COR_SERIE, brlFmt, intFmt } from "./util";

const pctFmt = (p: number) =>
  `${(p * 100).toLocaleString("pt-BR", { maximumFractionDigits: p < 0.1 ? 1 : 0, minimumFractionDigits: 0 })}%`;
const brlSemSimbolo = (n: number) => brlFmt(n).replace(/^R\$\s?/, "");

export function ResumoMes({
  carregando,
  total,
  porTipo,
  variacao,
  unidadesAtivas,
  unidadesTotal,
  profissionaisAtivos,
  fpo,
  competencia,
}: {
  carregando: boolean;
  total: number;
  porTipo: { c: number; i: number; r: number };
  variacao: { pct: number; mesAnterior: string } | null;
  unidadesAtivas: number;
  unidadesTotal: number;
  profissionaisAtivos: number;
  fpo: { prodRS: number; tetoRS: number } | null;
  competencia: string;
}) {
  const tipos = (
    [
      ["BPA-C", porTipo.c],
      ["BPA-I", porTipo.i],
      ["RAAS", porTipo.r],
    ] as const
  ).filter(([, v]) => v > 0);
  const fpoP = fpo && fpo.tetoRS > 0 ? fpo.prodRS / fpo.tetoRS : 0;
  const divisor = "border-white/[0.12] sm:border-l sm:pl-7";
  return (
    <section
      aria-label="Resumo do mês"
      className="rv flex flex-wrap gap-7 rounded-[20px] bg-[#15213A] px-6 py-6 text-white sm:px-7"
      style={{ animationDelay: "200ms" }}
    >
      <div className="flex min-w-0 flex-[5_1_320px] flex-col gap-3.5">
        <span className="text-[13px] text-[#A9B6CA]">Procedimentos produzidos</span>
        {carregando ? (
          <>
            <Sk escuro h={52} w="70%" />
            <Sk escuro h={12} />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-[44px] font-bold leading-none tracking-[-0.03em] tabular-nums sm:text-[52px]">
                <CountUp valor={total} />
              </span>
              {variacao && (
                <span
                  className={`rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${variacao.pct >= 0 ? "bg-[rgba(52,199,123,0.16)] text-[#7EE2AE]" : "bg-white/10 text-[#D5DDEA]"}`}
                >
                  {variacao.pct >= 0 ? "▲" : "▼"}{" "}
                  {Math.abs(variacao.pct * 100).toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  })}
                  % vs {variacao.mesAnterior}
                </span>
              )}
            </div>
            {tipos.length > 0 && (
              <>
                <div
                  role="img"
                  aria-label={tipos.map(([n, v]) => `${n}: ${intFmt(v)}`).join(", ")}
                  className="flex h-2.5 gap-0.5"
                >
                  {tipos.map(([n, v], j) => (
                    <span
                      key={n}
                      className="block h-full"
                      style={{
                        flex: `${Math.max(1, v)} 1 0`,
                        background: COR_SERIE[n],
                        borderRadius:
                          tipos.length === 1
                            ? 4
                            : j === 0
                              ? "4px 0 0 4px"
                              : j === tipos.length - 1
                                ? "0 4px 4px 0"
                                : 0,
                      }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 text-[13px] text-[#D5DDEA]">
                  {tipos.map(([n, v]) => (
                    <span key={n} className="inline-flex items-center gap-[7px]">
                      <span
                        className="inline-block size-2.5 rounded-[3px]"
                        style={{ background: COR_SERIE[n] }}
                      />
                      <strong className="font-semibold text-white">{n}</strong> {intFmt(v)}
                    </span>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className={`flex flex-[3_1_200px] flex-col gap-[18px] ${divisor}`}>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-[#A9B6CA]">Unidades com produção</span>
          {carregando ? (
            <Sk escuro h={30} w={90} />
          ) : (
            <span className="text-[30px] font-bold tabular-nums">
              <CountUp valor={unidadesAtivas} />{" "}
              {unidadesTotal > 0 && (
                <span className="text-[15px] font-medium text-[#A9B6CA]">de {unidadesTotal}</span>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-[#A9B6CA]">Profissionais com produção</span>
          {carregando ? (
            <Sk escuro h={30} w={70} />
          ) : (
            <span className="text-[30px] font-bold tabular-nums">
              <CountUp valor={profissionaisAtivos} />
            </span>
          )}
        </div>
      </div>

      <div className={`flex flex-[4_1_300px] flex-col gap-3 ${divisor}`}>
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-[#A9B6CA]">FPO · teto usado</span>
          <Link
            to="/fpo"
            search={{ comp: competencia }}
            className="more inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-[#9CC0FF] hover:text-white"
          >
            Abrir FPO <ChevronRight className="chev size-3.5" />
          </Link>
        </div>
        {carregando ? (
          <>
            <Sk escuro h={30} w={90} />
            <Sk escuro h={10} />
          </>
        ) : fpo && fpo.tetoRS > 0 ? (
          <>
            <span className="text-[30px] font-bold tabular-nums">
              <CountUp valor={fpoP * 100} formatar={(n) => pctFmt(n / 100)} />
            </span>
            <div
              className="relative h-2.5 overflow-hidden rounded-[5px] bg-white/[0.12]"
              role="img"
              aria-label={`${pctFmt(fpoP)} do teto usado`}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-[5px] transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, fpoP * 100).toFixed(1)}%`,
                  background: fpoP > 1 ? "#F27A72" : "#3DD68C",
                }}
              />
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-[12.5px] tabular-nums text-[#D5DDEA]">
              <span>R$ {brlSemSimbolo(fpo.prodRS)} produzido</span>
              <span>teto R$ {brlSemSimbolo(fpo.tetoRS)}</span>
            </div>
          </>
        ) : (
          <span className="text-[15px] font-medium text-[#D5DDEA]">Sem FPO neste mês</span>
        )}
      </div>
    </section>
  );
}
