// Skeletons (pulso 1,4s) da dashboard v2.
import type { CSSProperties } from "react";

export function Sk({
  w = "100%",
  h = 12,
  escuro = false,
  style,
}: {
  w?: number | string;
  h?: number;
  escuro?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={escuro ? "sk-dark" : "sk"}
      style={{ display: "block", width: w, height: h, ...style }}
    />
  );
}

export function SkLista({ n = 5 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-3.5 px-6 pb-4" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Sk w={28} h={28} style={{ borderRadius: 999 }} />
          <div className="flex flex-1 flex-col gap-1.5">
            <Sk w={`${80 - i * 8}%`} h={11} />
            <Sk w="40%" h={9} />
          </div>
          <Sk w={36} h={11} />
        </div>
      ))}
    </div>
  );
}

export function SkGrafico() {
  return (
    <div className="flex h-[250px] items-end gap-5 pl-11" aria-hidden="true">
      {[55, 70, 62, 80, 74, 90].map((h, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2">
          <Sk h={(h / 100) * 200} w="100%" style={{ maxWidth: 60, borderRadius: "4px 4px 0 0" }} />
          <Sk w={30} h={10} />
        </div>
      ))}
    </div>
  );
}
