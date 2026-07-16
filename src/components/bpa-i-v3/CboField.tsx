import { useEffect, useRef, useState } from "react";
import { DigitBoxes } from "@/components/DigitBoxes";
import { buscarHistorico, type SugestaoHistorico } from "@/lib/bpa-i-v2/historico";
import { buscarNomeCbo } from "@/lib/bpa-i-v3/nome-cbo";

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
  invalid?: boolean;
  title?: string;
}

// CBO (BPA-I v3): campo de dígitos com autocomplete por histórico (igual ao
// HistoricoField) MAIS um balão com o nome/descrição do CBO quando o código está
// completo — mesmo padrão do Código do Procedimento. O balão some do PDF.
export function CboField({ id, top, height, boxes, values, onChange, clearable, onRepeat, invalid, title }: Props) {
  const code = values.join("");
  const completo = code.length === boxes.length;
  const [sugs, setSugs] = useState<SugestaoHistorico[]>([]);
  const [nome, setNome] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const refsRef = useRef<HTMLInputElement[]>([]);

  // Autocomplete por histórico enquanto digita (código incompleto).
  useEffect(() => {
    if (code.length < 2 || completo) {
      setSugs([]);
      return;
    }
    let cancel = false;
    buscarHistorico("cbo", code).then((rows) => {
      if (!cancel) setSugs(rows.filter((r) => r.codigo !== code));
    });
    return () => { cancel = true; };
  }, [code, completo]);

  // Nome do CBO quando o código está completo (6 dígitos).
  useEffect(() => {
    if (!completo) {
      setNome(null);
      return;
    }
    let cancel = false;
    buscarNomeCbo(code).then((n) => { if (!cancel) setNome(n); });
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
  const openNome = focused && completo && Boolean(nome);

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
        invalid={invalid}
        title={title}
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
      {openNome && (
        <div
          data-html2canvas-ignore="true"
          className="absolute z-[60] max-w-[280px] rounded-md border border-border bg-white px-3 py-1.5 text-xs text-foreground shadow-lg"
          style={{ top: `calc(${top + height}% + 2px)`, left: `${boxes[0].left}%` }}
        >
          {nome}
        </div>
      )}
    </>
  );
}
