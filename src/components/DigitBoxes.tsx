import { useRef, useEffect, useState, useContext, createContext } from "react";
import { Trash2, ArrowUp } from "lucide-react";
import { ancorarDigitosDireita, ancorarCharsDireita } from "@/lib/digitos-direita";

// Habilita a lixeira de "limpar campo" em todos os DigitBoxes descendentes (usado só nas
// versões v2). Fora de um Provider fica `false` -> os formulários originais não mudam.
export const DigitBoxesClearableContext = createContext(false);

// Enter: pula para o PRÓXIMO campo (não a próxima caixinha), ignorando as demais
// caixinhas do grupo atual. Usa a ordem do DOM (= ordem visual de leitura), então
// funciona em qualquer folha sem precisar encadear refs manualmente.
function pularProximoCampo(ownBoxes: (HTMLInputElement | null)[]) {
  const mine = ownBoxes.filter((el): el is HTMLInputElement => !!el);
  const last = mine[mine.length - 1];
  if (!last) return;
  const focusaveis = Array.from(
    document.querySelectorAll<HTMLElement>("input:not([readonly]), select, textarea"),
  ).filter((el) => el.tabIndex !== -1 && !(el as HTMLInputElement).disabled);
  const start = focusaveis.indexOf(last);
  if (start === -1) return;
  const proximo = focusaveis.slice(start + 1).find((el) => !mine.includes(el as HTMLInputElement));
  proximo?.focus();
}

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
  // Esmaece as células VAZIAS, sinalizando que não são usadas (ex.: as 4 folgas de um
  // CPF de 11 díg. num campo de 15 do CNS, alinhado à direita). Continuam editáveis. Opt-in.
  dimEmpty?: boolean;
  // "Repetir de cima": quando fornecido, um botão ↑ aparece ao focar o campo VAZIO,
  // copiando o valor da linha anterior (definido pelo pai). Some assim que há dígito.
  onRepeat?: () => void;
}

export function DigitBoxes({ id, top, height, boxes, values, onChange, numeric = true, compact = false, registerRefs, clearable, onComplete, rightAlign = false, invalid = false, warn = false, readOnly = false, separated = false, title, uppercase = false, dimEmpty = false, onRepeat }: Props) {

  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const ctxClearable = useContext(DigitBoxesClearableContext);
  const showClear = clearable ?? ctxClearable;
  const [focused, setFocused] = useState(false);
  const vazio = !values.some((v) => v && v.trim() !== "");

  useEffect(() => {
    if (registerRefs) registerRefs(refs.current.filter(Boolean) as HTMLInputElement[]);
  });

  // A lixeira/repetir só aparece com uma caixinha DESTE grupo focada (evita poluição visual).
  useEffect(() => {
    if (!showClear && !onRepeat) return;
    const onFocusIn = (e: FocusEvent) => {
      setFocused(refs.current.includes(e.target as HTMLInputElement));
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [showClear, onRepeat]);

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

  // Aplica um valor justificado à direita nas caixinhas e foca a última. Campos numéricos
  // descartam não-dígitos; alfanuméricos (ex.: Número "S/N") preservam os caracteres.
  const setRightAligned = (raw: string) => {
    onChange(numeric ? ancorarDigitosDireita(raw, boxes.length) : ancorarCharsDireita(raw, boxes.length));
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
    if (e.key === "Enter") {
      e.preventDefault();
      if (onComplete) onComplete();
      else pularProximoCampo(refs.current);
      return;
    }
    if (rightAlign) {
      // Digitação estilo calculadora tratada AQUI (keydown), não no onChange: como cada
      // caixinha tem maxLength=1 e o foco fica sempre na caixa cheia da direita, o onChange
      // não dispararia no 2º dígito. Capturamos a tecla e montamos o número nós mesmos.
      const atual = values.filter((v) => v && v.trim() !== "").join("");
      // Aceita 1 dígito (numérico) ou 1 caractere não-branco (alfanumérico, ex.: "S/N").
      const ehEntrada = e.key.length === 1 && (numeric ? /[0-9]/.test(e.key) : !/\s/.test(e.key));
      if (ehEntrada) {
        e.preventDefault();
        const ch = uppercase ? e.key.toUpperCase() : e.key;
        if (atual.length < boxes.length) setRightAligned(atual + ch); // trava aos n caracteres (não empurra)
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setRightAligned(atual.slice(0, -1)); // remove o último dígito
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

  // Ao SAIR do campo (foco vai para fora do grupo), completa as casas vazias à esquerda
  // com zero — ex.: digitou "1" em Quantidade (5 casas) e pulou -> vira "00001". Só para
  // campos numéricos ancorados à direita (Quantidade/Idade). Campo totalmente vazio
  // permanece vazio; já cheio não muda. Basta um padStart no número acumulado.
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!rightAlign || !numeric) return;
    const next = e.relatedTarget as HTMLInputElement | null;
    if (next && refs.current.includes(next)) return; // ainda navegando dentro do grupo
    const atual = values.filter((v) => v && v.trim() !== "").join("");
    if (atual.length === 0 || atual.length >= boxes.length) return; // vazio ou já completo
    onChange(atual.padStart(boxes.length, "0").split(""));
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
          onBlur={onBlur}
          onPaste={(e) => onPaste(i, e)}
          inputMode={numeric ? "numeric" : "text"}
          pattern={numeric ? "[0-9]" : undefined}
          maxLength={1}
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : undefined}
          title={invalid || warn ? title : undefined}
          className={`form-digit${compact ? " form-digit--compact" : ""}${separated ? " form-digit--separated" : ""}${invalid ? " ring-2 ring-rose-400/80" : warn ? " ring-2 ring-amber-400/80" : ""}${readOnly ? " bg-muted/40" : ""}${dimEmpty && !values[i] ? " form-digit--dim" : ""}`}
          style={{
            position: "absolute",
            top: `${top}%`,
            left: `${b.left}%`,
            width: `${b.width}%`,
            height: `${height}%`,
          }}
        />
      ))}
      {showClear && focused && !vazio && (
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
      {onRepeat && focused && vazio && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Repetir valor da linha de cima"
          title="Repetir o valor da linha de cima"
          data-html2canvas-ignore="true"
          onMouseDown={(e) => e.preventDefault()} // não rouba o foco antes do clique
          onClick={onRepeat}
          className="flex items-center justify-center rounded-full bg-sky-600 text-white shadow-md ring-2 ring-white transition-transform duration-150 hover:bg-sky-700 hover:scale-110 active:scale-90"
          style={{
            position: "absolute",
            top: `${top}%`,
            left: `${rightEdge + 0.5}%`,
            height: `${height}%`,
            aspectRatio: "1",
            zIndex: 50,
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <ArrowUp style={{ width: "60%", height: "60%" }} />
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
  // id no <input> (p/ focar programaticamente, ex.: pular do CPF direto p/ o nome).
  id?: string;
}

export function TextField({ top, left, width, height, value, onChange, align = "left", invalid = false, title, uppercase = false, id }: TextProps) {
  return (
    <input
      id={id}
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
