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
  // Chamado quando a ÚLTIMA caixinha do grupo é preenchida — permite pular para o
  // próximo campo (ex.: DDD -> Nº do telefone).
  onComplete?: () => void;
  // Número justificado à direita: os dígitos acumulam da direita p/ a esquerda (ex.:
  // Quantidade). Digitar/apagar em qualquer caixinha trata o grupo como um número único.
  rightAlign?: boolean;
  // Marca o grupo como inválido (borda sutil). Só visual/não-bloqueante.
  invalid?: boolean;
  // Marca o grupo com um aviso não-bloqueante (borda âmbar) — ex.: data antiga que
  // ainda não foi confirmada pela pessoa. Diferente de `invalid` (que é erro).
  warn?: boolean;
  // Somente leitura (ex.: campo Total calculado): não aceita digitação.
  readOnly?: boolean;
  // Borda sutil sempre visível (não só no foco) separando as caixinhas — ajuda a ler
  // campos muito estreitos onde os dígitos ficam "colados". Some do PDF (mesma regra
  // que já zera bordas no .form-sheet--print).
  separated?: boolean;
  // Explica o motivo de um `invalid`/`warn` (tooltip nativo ao passar o mouse/tocar).
  title?: string;
  // Força letras maiúsculas (só faz sentido com numeric=false, ex.: CID). Opt-in:
  // omitido = comportamento original (usado pelas telas v2), então a v2 não muda.
  uppercase?: boolean;
  // Esmaece as células a partir deste índice (inclusive), sinalizando que não são
  // usadas (ex.: CPF de 11 díg. num campo de 15 do CNS). Continuam editáveis. Opt-in.
  dimFrom?: number;
}

export function DigitBoxes({ id, top, height, boxes, values, onChange, numeric = true, compact = false, registerRefs, clearable, onComplete, rightAlign = false, invalid = false, warn = false, readOnly = false, separated = false, title, uppercase = false, dimFrom }: Props) {

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

  // Foca uma caixinha com o cursor no FINAL do dígito (não no início) — assim, ao
  // navegar com as setas em qualquer direção, o Backspace sempre apaga o que está ali,
  // sem precisar de mais um passo para "entrar" no caractere.
  const focusEnd = (el: HTMLInputElement | null | undefined) => {
    el?.focus();
    const len = el?.value.length ?? 0;
    el?.setSelectionRange(len, len);
  };

  const clearAll = () => {
    onChange(boxes.map(() => ""));
    refs.current[0]?.focus();
  };

  const rightEdge = boxes.reduce((m, b) => Math.max(m, b.left + b.width), 0);

  // Aplica um número justificado à direita nas caixinhas e foca a última.
  const setRightAligned = (digits: string) => {
    const d = digits.slice(-boxes.length);
    onChange([...Array(boxes.length - d.length).fill(""), ...d.split("")]);
    focusEnd(refs.current[boxes.length - 1]);
  };

  const handle = (i: number, v: string) => {
    let val = v.slice(-1);
    if (numeric && val && !/[0-9]/.test(val)) return;
    if (uppercase && val) val = val.toUpperCase();
    if (rightAlign) {
      if (val) setRightAligned(values.filter(Boolean).join("") + val); // acumula à direita
      return;
    }
    const next = [...values];
    next[i] = val;
    onChange(next);
    if (val && i < boxes.length - 1) focusEnd(refs.current[i + 1]);
    else if (val && i === boxes.length - 1) onComplete?.(); // última caixinha -> próximo campo
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (rightAlign) {
      if (e.key === "Backspace") {
        e.preventDefault();
        setRightAligned(values.filter(Boolean).join("").slice(0, -1)); // remove o último dígito
      }
      return;
    }
    if (e.key === "Backspace" && !values[i] && i > 0) {
      focusEnd(refs.current[i - 1]);
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusEnd(refs.current[i - 1]);
    } else if (e.key === "ArrowRight" && i < boxes.length - 1) {
      e.preventDefault();
      focusEnd(refs.current[i + 1]);
    }
  };

  const onPaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\s/g, "");
    if (!text) return;
    e.preventDefault();
    const chars = numeric ? text.replace(/\D/g, "").split("") : (uppercase ? text.toUpperCase() : text).split("");
    if (rightAlign) {
      setRightAligned(values.filter(Boolean).join("") + chars.join(""));
      return;
    }
    const next = [...values];
    for (let k = 0; k < chars.length && i + k < boxes.length; k++) {
      next[i + k] = chars[k];
    }
    onChange(next);
    const focusIdx = Math.min(i + chars.length, boxes.length - 1);
    focusEnd(refs.current[focusIdx]);
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
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : undefined}
          title={invalid || warn ? title : undefined}
          className={`form-digit${compact ? " form-digit--compact" : ""}${separated ? " form-digit--separated" : ""}${invalid ? " ring-2 ring-rose-400/80" : warn ? " ring-2 ring-amber-400/80" : ""}${readOnly ? " bg-muted/40" : ""}${dimFrom != null && i >= dimFrom ? " form-digit--dim" : ""}`}
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
          className="flex items-center justify-center rounded-full bg-rose-500 text-white shadow-md ring-2 ring-white transition-transform duration-150 hover:bg-rose-600 hover:scale-110 active:scale-90"
          style={{
            position: "absolute",
            top: `${top}%`,
            left: `${rightEdge + 0.5}%`,
            height: `${height}%`,
            aspectRatio: "1", // círculo (largura = altura da linha)
            zIndex: 50, // acima das caixinhas vizinhas (transitório: só enquanto focado)
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <Trash2 style={{ width: "60%", height: "60%" }} />
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
  // Marca o campo como inválido (borda vermelha sutil). Só visual/não-bloqueante.
  invalid?: boolean;
  // Explica o motivo do `invalid` (tooltip nativo ao passar o mouse/tocar).
  title?: string;
  // Força letras maiúsculas. Opt-in (omitido = original), então a v2 não muda.
  uppercase?: boolean;
}

export function TextField({ top, left, width, height, value, onChange, align = "left", invalid = false, title, uppercase = false }: TextProps) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
      title={invalid ? title : undefined}
      className={`form-text${invalid ? " ring-2 ring-rose-400/80" : ""}`}
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
