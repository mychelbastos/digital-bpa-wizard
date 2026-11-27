// Por unidade: barras horizontais com nome legível (reticências) e valor à direita.
import { Sk } from "./Skeletons";
import { intFmt, type Agrupado } from "./util";

export function ProducaoPorUnidade({
  unidades,
  carregando,
}: {
  unidades: Agrupado[];
  carregando: boolean;
}) {
  const max = unidades[0]?.quantidade || 1;
  return (
    <section
      className="card rv flex min-w-0 flex-[4_1_300px] flex-col gap-3.5 rounded-[18px] border border-[#E3E8EF] bg-white px-6 py-[22px]"
      style={{ animationDelay: "380ms" }}
    >
      <h2 className="m-0 text-base font-semibold">Por unidade</h2>
      {carregando ? (
        [0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Sk h={11} w={`${85 - i * 10}%`} />
            <Sk h={8} w={`${90 - i * 15}%`} />
          </div>
        ))
      ) : unidades.length === 0 ? (
        <p className="text-[13.5px] text-[#5B6B82]">Sem produção.</p>
      ) : (
        unidades.map((u) => (
          <div key={u.key} className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-2.5 text-[13.5px]">
              <span className="truncate" title={u.name}>
                {u.name}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{intFmt(u.quantidade)}</span>
            </div>
            <span className="block h-2 rounded-r bg-[#F1F4F8]">
              <span
                className="block h-2 rounded-r bg-[#257DE0]"
                style={{
                  width: `${Math.max(2, (u.quantidade / max) * 100).toFixed(1)}%`,
                  transition: "width var(--duration-slow) var(--ease-smooth-out)",
                }}
              />
            </span>
          </div>
        ))
      )}
    </section>
  );
}
