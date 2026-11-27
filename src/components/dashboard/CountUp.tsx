// Contagem animada de um número (~900ms, ease-out), partindo do valor anterior. Com
// "reduzir movimento" ligado no sistema, mostra o valor final na hora.
import { useEffect, useRef, useState } from "react";

const reduzMovimento = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function CountUp({
  valor,
  formatar = (n) => Math.round(n).toLocaleString("pt-BR"),
  duracao = 900,
}: {
  valor: number;
  formatar?: (n: number) => string;
  duracao?: number;
}) {
  const [mostrado, setMostrado] = useState(() => (reduzMovimento() ? valor : 0));
  const atual = useRef(mostrado);
  useEffect(() => {
    if (reduzMovimento()) {
      atual.current = valor;
      setMostrado(valor);
      return;
    }
    const de = atual.current,
      para = valor;
    if (de === para) return;
    let raf = 0;
    const t0 = performance.now();
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / duracao);
      const e = 1 - Math.pow(1 - p, 3); // ease-out
      const v = de + (para - de) * e;
      atual.current = v;
      setMostrado(v);
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor, duracao]);
  return <span aria-live="polite">{formatar(mostrado)}</span>;
}
