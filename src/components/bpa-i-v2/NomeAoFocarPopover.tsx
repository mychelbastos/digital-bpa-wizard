import { useEffect, useState } from "react";

interface Props {
  top: number; // %
  left: number; // %
  height: number; // %
  // Refs dos inputs deste campo (ou grupo de campos) — o popover aparece quando
  // qualquer um deles está focado. Mesmo mecanismo do FieldClear/HistoricoField.
  getInputs: () => HTMLInputElement[];
  // Texto a mostrar (nome/descrição). undefined/null = ainda não sabe (não mostra nada).
  texto: string | null | undefined;
}

// Popover informativo (nome/descrição) ao focar um campo de código — mesmo padrão já
// usado no Código do Procedimento, generalizado p/ CEP, Serviço+Classe e CID. Some do
// PDF (data-html2canvas-ignore), nunca bloqueia nada, só confirma o que foi digitado.
export function NomeAoFocarPopover({ top, left, height, getInputs, texto }: Props) {
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => setFocused(getInputs().includes(e.target as HTMLInputElement));
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!focused || !texto) return null;

  return (
    <div
      data-html2canvas-ignore="true"
      className="absolute z-[60] max-w-[280px] rounded-md border border-border bg-white px-3 py-1.5 text-xs text-foreground shadow-lg"
      style={{ top: `calc(${top + height}% + 2px)`, left: `${left}%` }}
    >
      {texto}
    </div>
  );
}
