import { useEffect, useRef, useState } from "react";
import { DigitBoxes } from "@/components/DigitBoxes";
import { buscarHistorico, type SugestaoHistorico } from "@/lib/bpa-i-v2/historico";

interface Box {
  left: number;
  width: number;
}
interface Props {
  id: string;
  top: number;
  height: number;
  boxes: Box[];
  values: string[];
  onChange: (vals: string[]) => void;
  clearable?: boolean;
  onRepeat?: () => void;
  // Resultado da busca no SIGTAP (calculado 1x por sequência em useValidacaoProcedimento
  // e compartilhado com as demais checagens — evita repetir a mesma consulta aqui).
  naoEncontrado: boolean;
  nomeEncontrado: string | null;
}

// Código do Procedimento: autocomplete por histórico de uso (< 10 dígitos, igual ao
// HistoricoField) + indicador visual de validade contra o SIGTAP (borda vermelha
// quando completo mas não encontrado — mesmo padrão do CNS inválido — e balão com o
// nome oficial quando encontrado, como confirmação de que é o código certo).
export function ProcedimentoField({ id, top, height, boxes, values, onChange, clearable, onRepeat, naoEncontrado, nomeEncontrado }: Props) {
  const code = values.join("");
  const completo = code.length === boxes.length;
  const [sugs, setSugs] = useState<SugestaoHistorico[]>([]);
  const [focused, setFocused] = useState(false);
  const refsRef = useRef<HTMLInputElement[]>([]);

  // Autocomplete por histórico enquanto digita (código incompleto).
  useEffect(() => {
    if (code.length < 2 || completo) {
      setSugs([]);
      return;
    }
    let cancel = false;
    buscarHistorico("procedimento", code).then((rows) => {
      if (!cancel) setSugs(rows.filter((r) => r.codigo !== code));
    });
    return () => { cancel = true; };
  }, [code, completo]);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      setFocused(refsRef.current.includes(e.target as HTMLInputElement));
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  const openSugs = focused && sugs.length > 0 && code.length >= 2 && !completo;
  const openSigtap = focused && completo && (naoEncontrado || nomeEncontrado);

  const select = (codigo: string) => {
    const arr = codigo.split("").slice(0, boxes.length);
    while (arr.length < boxes.length) arr.push("");
    onChange(arr);
    setFocused(false);
  };

  return (
    <>
      <DigitBoxes
        id={id}
        top={top}
        height={height}
        boxes={boxes}
        values={values}
        onChange={onChange}
        registerRefs={(els) => { refsRef.current = els; }}
        clearable={clearable}
        onRepeat={onRepeat}
        invalid={naoEncontrado}
        compact
      />
      {openSugs && (
        <ul
          className="absolute z-[60] max-h-52 min-w-[170px] overflow-auto rounded-md border border-border bg-white py-1 text-sm shadow-lg"
          style={{ top: `calc(${top + height}% + 2px)`, left: `${boxes[0].left}%` }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {sugs.map((s) => (
            <li
              key={s.codigo}
              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 hover:bg-primary/10"
              onMouseDown={() => select(s.codigo)}
            >
              <span className="font-mono">{s.codigo}</span>
              <span className="text-xs text-muted-foreground">{s.vezes_usado}×</span>
            </li>
          ))}
        </ul>
      )}
      {openSigtap && (
        <div
          className={`absolute z-[60] max-w-[260px] rounded-md border px-3 py-1.5 text-xs shadow-lg ${
            naoEncontrado ? "border-rose-300 bg-rose-50 text-rose-800" : "border-border bg-white text-foreground"
          }`}
          style={{ top: `calc(${top + height}% + 2px)`, left: `${boxes[0].left}%` }}
        >
          {naoEncontrado ? "⚠️ Código não encontrado no SIGTAP" : nomeEncontrado}
        </div>
      )}
    </>
  );
}
