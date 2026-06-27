import { useRef, useEffect } from "react";

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
}

export function DigitBoxes({ id, top, height, boxes, values, onChange, numeric = true, compact = false, registerRefs }: Props) {

  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (registerRefs) registerRefs(refs.current.filter(Boolean) as HTMLInputElement[]);
  });

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
}

export function TextField({ top, left, width, height, value, onChange }: TextProps) {
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
      }}
    />
  );
}
