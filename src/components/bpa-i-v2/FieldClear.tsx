import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

interface Props {
  top: number; // %
  left: number; // %
  height: number; // %
  // Inputs que compõem o campo LÓGICO (ex.: dia+mês+ano; DDD+telefone). Usado p/ (a)
  // detectar foco em qualquer parte do campo e (b) focar a 1ª caixinha após limpar.
  getInputs: () => HTMLInputElement[];
  onClear: () => void;
}

// Lixeira única para campos compostos por vários grupos de DigitBoxes (datas, telefone).
// Aparece quando QUALQUER caixinha do campo está focada e limpa o campo inteiro de uma vez.
// Fora do PDF (data-html2canvas-ignore + removido no clone do export).
export function FieldClear({ top, left, height, getInputs, onClear }: Props) {
  const [focused, setFocused] = useState(false);
  const getRef = useRef(getInputs);
  getRef.current = getInputs;

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      setFocused(getRef.current().includes(e.target as HTMLInputElement));
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  if (!focused) return null;

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label="Limpar campo"
      title="Limpar campo"
      data-html2canvas-ignore="true"
      onMouseDown={(e) => e.preventDefault()} // não rouba o foco antes do clique
      onClick={() => { onClear(); getRef.current()[0]?.focus(); }}
      className="flex items-center justify-center rounded-full bg-rose-500 text-white shadow-md ring-2 ring-white transition-transform duration-150 hover:bg-rose-600 hover:scale-110 active:scale-90"
      style={{
        position: "absolute",
        top: `${top}%`,
        left: `${left}%`,
        height: `${height}%`,
        aspectRatio: "1",
        zIndex: 50,
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
    >
      <Trash2 style={{ width: "60%", height: "60%" }} />
    </button>
  );
}
