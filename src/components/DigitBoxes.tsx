import { useRef, useEffect, useState, useContext, createContext } from "react";
import { Trash2 } from "lucide-react";

// Habilita a lixeira de "limpar campo" em todos os DigitBoxes descendentes (usado só nas
// versões v2). Fora de um Provider fica `false` -> os formulários originais não mudam.
export const DigitBoxesClearableContext = createContext(false);

interface Box {
  left: number; // %
  width: number; // %
}

interface Props {
  id: string;
  top: number; // %
  height: number; // %
  boxes: Box[];
  values: string[];
  onChange: (vals: string[]) => void;
  numeric?: boolean;
  compact?: boolean;
  registerRefs?: (refs: HTMLInputElement[]) => void;
  // Mostra um ícone de lixeira (limpar tudo) à direita do grupo quando ele está focado.
  // Se omitido, herda do DigitBoxesClearableContext. Só afeta a UI (ignorado no PDF).
  clearable?: boolean;
}

export function DigitBoxes({ id, top, height, boxes, values, onChange, numeric = true, compact = false, registerRefs, clearable }: Props) {

  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const ctxClearable = useContext(DigitBoxesClearableContext);
  const showClear = clearable ?? ctxClearable;
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (registerRefs) registerRefs(refs.current.filter(Boolean) as HTMLInputElement[]);
  });

  // A lixeira só aparece com uma caixinha DESTE grupo focada (evita poluição visual).
  useEffect(() => {
    if (!showClear) return;
    const onFocusIn = (e: FocusEvent) => {
      setFocused(refs.current.includes(e.target as HTMLInputElement));
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [showClear]);

  const clearAll = () => {
    onChange(boxes.map(() => ""));
    refs.current[0]?.focus();
  };

  const rightEdge = boxes.reduce((m, b) => Math.max(m, b.left + b.width), 0);

  const handle = (i: number, v: string) => {
    let val = v.slice(-1);
    if (numeric && val && !/[0-9]/.test(val)) return;
    const next = [...values];
    next[i] = val;
    onChange(next);
    if (val && i < boxes.length - 1) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !values[i] && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < boxes.length - 1) {
      refs.current[i + 1]?.focus();
    }
  };

  const onPaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\s/g, "");
    if (!text) return;
    e.preventDefault();
    const chars = numeric ? text.replace(/\D/g, "").split("") : text.split("");
    const next = [...values];
    for (let k = 0; k < chars.length && i + k < boxes.length; k++) {
      next[i + k] = chars[k];
    }
    onChange(next);
    const focusIdx = Math.min(i + chars.length, boxes.length - 1);
    refs.current[focusIdx]?.focus();
  };

  return (
    <>
      {boxes.map((b, i) => (
        <input
          key={`${id}-${i}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={values[i] || ""}
          onChange={(e) => handle(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={(e) => onPaste(i, e)}
          inputMode={numeric ? "numeric" : "text"}
          pattern={numeric ? "[0-9]" : undefined}
          maxLength={1}
          className={`form-digit${compact ? " form-digit--compact" : ""}`}
          style={{
            position: "absolute",
            top: `${top}%`,
            left: `${b.left}%`,
            width: `${b.width}%`,
            height: `${height}%`,
          }}
        />
      ))}
      {showClear && focused && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Limpar campo"
          title="Limpar campo"
          data-html2canvas-ignore="true"
          onMouseDown={(e) => e.preventDefault()} // não rouba o foco antes do clique
          onClick={clearAll}
          className="flex items-center justify-center text-muted-foreground/50 transition-colors hover:text-red-600"
          style={{
            position: "absolute",
            top: `${top}%`,
            left: `${rightEdge + 0.4}%`,
            height: `${height}%`,
            zIndex: 50, // acima das caixinhas vizinhas (transitório: só enquanto focado)
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </>
  );
}

interface TextProps {
  top: number;
  left: number;
  width: number;
  height: number;
  value: string;
  onChange: (v: string) => void;
  align?: "left" | "center";
}

export function TextField({ top, left, width, height, value, onChange, align = "left" }: TextProps) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="form-text"
      style={{
        position: "absolute",
        top: `${top}%`,
        left: `${left}%`,
        width: `${width}%`,
        height: `${height}%`,
        textAlign: align,
      }}
    />
  );
}
