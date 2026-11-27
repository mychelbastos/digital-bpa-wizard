// "Últimos 6 meses": colunas empilhadas por tipo (ou total), tooltip e clique p/ trocar o mês.
import { useState } from "react";
import { SkGrafico } from "./Skeletons";
import { COR_SERIE, intFmt, mesLabel } from "./util";

export interface PontoMes {
  comp: string;
  c: number;
  i: number;
  r: number;
}

const H = 222; // altura útil das colunas (px)
// Teto "redondo" do eixo Y e passo de 1/3 (4 linhas: 0, 1/3, 2/3, topo).
function eixo(max: number) {
  if (max <= 0) return { topo: 3, passo: 1 };
  const bruto = max / 3;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? 10 * pot;
  return { topo: passo * 3, passo };
}
const rotuloEixo = (v: number) =>
  v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(v);

export function EvolucaoChart({
  meses,
  carregando,
  erro,
  selecionado,
  onSelecionar,
  onTentarDeNovo,
}: {
  meses: PontoMes[];
  carregando: boolean;
  erro: boolean;
  selecionado: string;
  onSelecionar: (comp: string) => void;
  onTentarDeNovo: () => void;
}) {
  const [visao, setVisao] = useState<"tipo" | "total">("tipo");
  const [hov, setHov] = useState<number | null>(null);
  const total = (m: PontoMes) => m.c + m.i + m.r;
  const { topo, passo } = eixo(Math.max(0, ...meses.map(total)));
  const alt = (v: number) => Math.max(0, Math.round((v / topo) * H));
  const colW = meses.length ? 100 / meses.length : 100;
  const tipM = hov !== null ? meses[hov] : null;
  const porTipo = visao === "tipo";

  const seg = (v: number, cor: string, topoSeg: boolean, idx: number) => (
    <span
      className="block"
      style={{
        height: alt(v),
        background: cor,
        opacity: hov === null || hov === idx ? 1 : 0.45,
        transition: "opacity var(--duration-fast) ease-out, height 400ms var(--ease-smooth-out)",
        borderRadius: topoSeg ? "4px 4px 0 0" : 0,
      }}
    />
  );

  return (
    <section
      className="card rv flex min-w-0 flex-[8_1_560px] flex-col gap-[18px] rounded-[18px] border border-[#E3E8EF] bg-white px-6 py-[22px]"
      style={{ animationDelay: "260ms" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-base font-semibold">Últimos 6 meses</h2>
        <div
          role="group"
          aria-label="Visão do gráfico"
          className="relative flex rounded-[11px] bg-[#F1F4F8] p-1"
        >
          <span
            aria-hidden="true"
            className="absolute top-1 h-[34px] w-[92px] rounded-lg bg-white shadow-[0_1px_2px_rgba(16,24,40,0.14)]"
            style={{
              left: 4 + (porTipo ? 0 : 92),
              transition: "left var(--duration-base) var(--ease-smooth-out)",
            }}
          />
          {(
            [
              ["tipo", "Por tipo"],
              ["total", "Total"],
            ] as const
          ).map(([id, rot]) => (
            <button
              key={id}
              type="button"
              aria-pressed={visao === id}
              onClick={() => setVisao(id)}
              className={`relative z-[1] h-[34px] w-[92px] text-[13px] font-semibold transition-colors ${visao === id ? "text-[#172033]" : "text-[#5B6B82]"}`}
            >
              {rot}
            </button>
          ))}
        </div>
      </div>

      {erro ? (
        <div className="flex h-[250px] flex-col items-center justify-center gap-3 text-center text-sm text-[#5B6B82]">
          Não foi possível carregar os últimos meses.
          <button
            type="button"
            onClick={onTentarDeNovo}
            className="btn min-h-10 rounded-xl border border-[#D5DCE6] px-4 font-semibold text-[#172033]"
          >
            Tentar de novo
          </button>
        </div>
      ) : carregando ? (
        <SkGrafico />
      ) : (
        <div className="relative h-[250px]" onMouseLeave={() => setHov(null)}>
          <div
            aria-hidden="true"
            className="absolute inset-[0_0_28px_44px] flex flex-col justify-between"
          >
            <span className="border-t border-[#EEF2F7]" />
            <span className="border-t border-[#EEF2F7]" />
            <span className="border-t border-[#EEF2F7]" />
            <span className="border-t border-[#D5DCE6]" />
          </div>
          <div
            aria-hidden="true"
            className="absolute bottom-[21px] left-0 top-[-7px] flex w-[38px] flex-col justify-between text-right text-[11.5px] text-[#5B6B82]"
          >
            {[3, 2, 1, 0].map((k) => (
              <span key={k}>{rotuloEixo(passo * k)}</span>
            ))}
          </div>
          {tipM && (
            <span
              role="status"
              className="tip pointer-events-none absolute z-[3] whitespace-nowrap rounded-[9px] bg-[#15213A] px-2.5 py-2 text-xs leading-normal text-white shadow-[0_8px_20px_rgba(21,33,58,0.25)]"
              style={{
                bottom: alt(total(tipM)) + 40,
                left: `calc(44px + (100% - 44px) * ${((hov ?? 0) * colW + colW / 2) / 100})`,
                transform: "translateX(-50%)",
              }}
            >
              <strong className="mb-1 block text-[12.5px]">
                {mesLabel(tipM.comp)} · {intFmt(total(tipM))}
              </strong>
              {porTipo && (
                <>
                  <span className="block">BPA-C {intFmt(tipM.c)}</span>
                  <span className="block">BPA-I {intFmt(tipM.i)}</span>
                  <span className="block">RAAS {intFmt(tipM.r)}</span>
                </>
              )}
            </span>
          )}
          <div className="absolute inset-[0_0_0_44px] flex gap-2 sm:gap-5">
            {meses.map((m, idx) => {
              const sel = m.comp === selecionado;
              return (
                <button
                  key={m.comp}
                  type="button"
                  onMouseEnter={() => setHov(idx)}
                  onFocus={() => setHov(idx)}
                  onBlur={() => setHov(null)}
                  onClick={() => onSelecionar(m.comp)}
                  aria-label={`${mesLabel(m.comp)}: ${intFmt(total(m))} procedimentos (BPA-C ${intFmt(m.c)}, BPA-I ${intFmt(m.i)}, RAAS ${intFmt(m.r)}). Abrir este mês.`}
                  aria-current={sel ? "date" : undefined}
                  className="relative flex min-w-0 flex-1 cursor-pointer flex-col justify-end rounded-md border-0 bg-transparent p-0"
                >
                  <span className="mx-auto mb-7 flex w-full max-w-[60px] flex-col gap-0.5">
                    {porTipo ? (
                      <>
                        {m.r > 0 && seg(m.r, COR_SERIE.RAAS, true, idx)}
                        {m.i > 0 && seg(m.i, COR_SERIE["BPA-I"], m.r === 0, idx)}
                        {m.c > 0 && seg(m.c, COR_SERIE["BPA-C"], m.r === 0 && m.i === 0, idx)}
                      </>
                    ) : (
                      seg(total(m), sel ? "#1D4FB0" : "#7FA8EC", true, idx)
                    )}
                  </span>
                  <span
                    className={`absolute inset-x-0 bottom-1 text-center text-xs tabular-nums ${sel ? "font-bold text-[#172033]" : "font-medium text-[#5B6B82]"}`}
                  >
                    {mesLabel(m.comp).replace(/\/\d{4}$/, "")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-[12.5px] text-[#33415A]">
        {porTipo ? (
          (["BPA-C", "BPA-I", "RAAS"] as const).map((n) => (
            <span key={n} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-[3px]"
                style={{ background: COR_SERIE[n] }}
              />
              {n}
            </span>
          ))
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[3px] bg-[#1D4FB0]" />
            Total de procedimentos · mês selecionado em azul escuro
          </span>
        )}
      </div>
    </section>
  );
}
