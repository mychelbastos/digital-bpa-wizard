import { useEffect, useRef, useState } from "react";
import type { ComboOption } from "@/lib/bpa-i-v2/racas";

interface Props {
  value: string; // código armazenado (ex.: "03") ou ""
  onChange: (code: string) => void;
  options: ComboOption[];
  top: number;
  left: number;
  width: number;
  height: number;
  disabled?: boolean;
  /** O que exibir na caixa: o rótulo (padrão) ou o código (p/ caixas pequenas, ex.: Caráter). */
  display?: "label" | "code";
  // Marca o campo como inválido (borda vermelha sutil). Só visual/não-bloqueante.
  invalid?: boolean;
  // Explica o motivo do `invalid` (tooltip nativo ao passar o mouse/tocar).
  title?: string;
  // Ao focar (antes de digitar), mostra TODAS as opções (padrão — bom p/ listas
  // pequenas, ex.: Raça/Cor). Em listas grandes (ex.: Município, 5mil+ linhas), passe
  // `false`: em vez da lista inteira, mostra um popover só com o nome já selecionado.
  mostrarTodosAoFocar?: boolean;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Combobox posicionado em % da form-sheet (igual aos demais campos, p/ o export do PDF
// capturar o <input> e mostrar o NOME selecionado). Guarda o código, exibe o rótulo.
// Sugestão por tecla (primeira letra filtra) + confirmar com Tab/Enter.
export function ComboField({ value, onChange, options, top, left, width, height, disabled, display = "label", invalid = false, title, mostrarTodosAoFocar = true }: Props) {
  const labelOf = (code: string) => options.find((o) => o.code === code)?.label ?? "";
  // O que aparece na caixa para um código: o rótulo, ou o próprio código.
  const shown = (code: string) => (display === "code" ? (labelOf(code) ? code : "") : labelOf(code));
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => shown(value));
  const [hi, setHi] = useState(0);
  const [typed, setTyped] = useState(false); // se o usuário já digitou desde que focou
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // mantém o texto exibido em sincronia com o código vindo de fora
  useEffect(() => {
    setText(shown(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  const q = norm(text);
  // Casa por prefixo em qualquer token do rótulo/sinônimos, ou pelo código.
  const matches = options.filter((o) => {
    const tokens = norm(o.search ?? o.label).split(/\s+/).filter(Boolean);
    return o.code.startsWith(q) || tokens.some((t) => t.startsWith(q));
  });
  // Ao focar (ainda sem digitar): listas pequenas mostram todas as opções; listas
  // grandes (mostrarTodosAoFocar=false) não mostram nada ainda (só o popover do nome
  // já selecionado, abaixo). Depois de digitar, sempre filtra pelo que foi digitado.
  const list = !open ? [] : typed && q ? matches : mostrarTodosAoFocar ? options : [];
  const mostrarNomeSelecionado = open && !typed && !mostrarTodosAoFocar && Boolean(labelOf(value));

  const pick = (o: ComboOption) => {
    onChange(o.code);
    setText(display === "code" ? o.code : o.label);
    setOpen(false);
  };
  const revert = () => {
    setText(shown(value));
    setOpen(false);
  };

  return (
    <>
      <input
        className={`form-text${invalid ? " ring-2 ring-rose-400/80" : ""}`}
        style={{
          position: "absolute",
          top: `${top}%`,
          left: `${left}%`,
          width: `${width}%`,
          height: `${height}%`,
          backgroundColor: disabled ? "rgba(0,0,0,0.045)" : undefined,
          cursor: disabled ? "not-allowed" : undefined,
          textAlign: display === "code" ? "center" : undefined,
        }}
        value={text}
        disabled={disabled}
        readOnly={false}
        title={invalid ? title : undefined}
        onFocus={(e) => {
          if (disabled) return;
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
          setHi(0);
          setTyped(false);
          e.target.select(); // seleciona o texto: digitar substitui o valor atual
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
          setTyped(true);
        }}
        onBlur={() => {
          // espera um clique numa opção antes de validar/reverter
          blurTimer.current = setTimeout(() => {
            const exact = options.find((o) => norm(o.label) === norm(text));
            if (exact) pick(exact);
            else revert();
          }, 150);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown") {
            setOpen(true);
            setHi((h) => Math.min(h + 1, list.length - 1));
            e.preventDefault();
          } else if (e.key === "ArrowUp") {
            setHi((h) => Math.max(h - 1, 0));
            e.preventDefault();
          } else if (e.key === "Enter" || e.key === "Tab") {
            if (open && list[hi]) {
              pick(list[hi]);
              if (e.key === "Enter") e.preventDefault();
            }
          } else if (e.key === "Escape") {
            revert();
          }
        }}
      />
      {mostrarNomeSelecionado && !disabled && (
        <div
          data-html2canvas-ignore="true"
          className="absolute z-[60] max-w-[280px] rounded-md border border-border bg-white px-3 py-1.5 text-xs text-foreground shadow-lg"
          style={{ top: `calc(${top + height}% + 2px)`, left: `${left}%` }}
        >
          {labelOf(value)}
        </div>
      )}
      {open && !disabled && list.length > 0 && (
        <ul
          className="absolute z-[60] max-h-52 min-w-[160px] overflow-auto rounded-md border border-border bg-white py-1 text-sm shadow-lg"
          style={{ top: `calc(${top + height}% + 2px)`, left: `${left}%` }}
        >
          {list.map((o, i) => (
            <li
              key={o.code}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${i === hi ? "bg-primary/10" : ""} hover:bg-primary/10`}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // mantém foco no input; evita o onBlur
                if (blurTimer.current) clearTimeout(blurTimer.current);
                pick(o);
              }}
            >
              <span className="font-mono text-xs text-muted-foreground">{o.code}</span>
              <span>{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
