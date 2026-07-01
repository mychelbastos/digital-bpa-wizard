import { useEffect, useRef, useState } from "react";
import { DigitBoxes } from "@/components/DigitBoxes";
import { buscarHistorico, type SugestaoHistorico, type TabelaHistorico } from "@/lib/bpa-i-v2/historico";

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
  tabela: TabelaHistorico;
}

// Campo de dígitos (reusa o DigitBoxes do form) com autocomplete por histórico de uso:
// ao digitar 2+ dígitos, mostra um dropdown com os códigos mais usados que começam com
// o que foi digitado; selecionar preenche todas as caixinhas.
export function HistoricoField({ id, top, height, boxes, values, onChange, tabela }: Props) {
  const code = values.join("");
  const [sugs, setSugs] = useState<SugestaoHistorico[]>([]);
  const [focused, setFocused] = useState(false);
  const refsRef = useRef<HTMLInputElement[]>([]);

  useEffect(() => {
    if (code.length < 2 || code.length >= boxes.length) {
      setSugs([]);
      return;
    }
    let cancel = false;
    buscarHistorico(tabela, code).then((rows) => {
      if (!cancel) setSugs(rows.filter((r) => r.codigo !== code));
    });
    return () => {
      cancel = true;
    };
  }, [code, tabela, boxes.length]);

  // Rastreia foco: o dropdown só aparece quando uma caixinha deste campo está focada.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      setFocused(refsRef.current.includes(e.target as HTMLInputElement));
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  const open = focused && sugs.length > 0 && code.length >= 2 && code.length < boxes.length;

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
        registerRefs={(els) => {
          refsRef.current = els;
        }}
        compact
      />
      {open && (
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
    </>
  );
}
