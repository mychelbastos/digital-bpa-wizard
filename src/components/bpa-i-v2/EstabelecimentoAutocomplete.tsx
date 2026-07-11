import { useEffect, useRef, useState } from "react";
import { buscarEstabelecimentosPorNome, type EstabelecimentoSug } from "@/lib/bpa-i-v2/estabelecimentos";

interface Props {
  top: number;
  left: number;
  width: number;
  height: number;
  nome: string;
  onChangeNome: (nome: string) => void;
  onPick: (estab: EstabelecimentoSug) => void; // preenche Nome + CNES do estabelecimento
  uppercase?: boolean; // força maiúsculas ao digitar (opt-in; omitido = original → v2 intacta)
}

// Campo Nome do Estabelecimento com autocomplete a partir da tabela `estabelecimentos`.
// Complementa a busca por CNES (que já preenche o nome): aqui a pessoa digita parte do
// NOME e escolhe da lista p/ preencher o CNES. É texto livre — se a base não tiver o
// estabelecimento, digita normalmente (fallback gracioso, sem travar).
export function EstabelecimentoAutocomplete({ top, left, width, height, nome, onChangeNome, onPick, uppercase = false }: Props) {
  const [sugs, setSugs] = useState<EstabelecimentoSug[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused || nome.trim().length < 2) {
      setSugs([]);
      setOpen(false);
      return;
    }
    let cancel = false;
    const t = setTimeout(() => {
      buscarEstabelecimentosPorNome(nome).then((r) => {
        if (!cancel) {
          setSugs(r);
          setOpen(r.length > 0);
        }
      });
    }, 200); // debounce
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [nome, focused]);

  const pick = (e: EstabelecimentoSug) => {
    onPick(e);
    setOpen(false);
    setSugs([]);
  };

  return (
    <>
      <input
        className="form-text"
        style={{ position: "absolute", top: `${top}%`, left: `${left}%`, width: `${width}%`, height: `${height}%` }}
        value={uppercase ? nome.toUpperCase() : nome}
        onChange={(e) => onChangeNome(uppercase ? e.target.value.toUpperCase() : e.target.value)}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => {
            setFocused(false);
            setOpen(false);
          }, 150);
        }}
      />
      {open && focused && (
        <ul
          className="absolute z-[60] max-h-56 min-w-[300px] overflow-auto rounded-md border border-border bg-white py-1 text-sm shadow-lg"
          style={{ top: `calc(${top + height}% + 2px)`, left: `${left}%` }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {sugs.map((e) => (
            <li
              key={e.cnes}
              className="cursor-pointer px-3 py-1.5 hover:bg-primary/10"
              onMouseDown={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
                pick(e);
              }}
            >
              <div className="font-medium leading-tight">{e.nome}</div>
              <div className="font-mono text-xs text-muted-foreground">CNES {e.cnes}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
