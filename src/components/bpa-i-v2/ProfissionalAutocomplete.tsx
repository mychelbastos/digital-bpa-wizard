import { useEffect, useRef, useState } from "react";
import { buscarProfissionais, type ProfissionalCache } from "@/lib/bpa-i-v2/profissionais";

interface Props {
  cnes: string; // CNES do estabelecimento (define a base de profissionais)
  top: number;
  left: number;
  width: number;
  height: number;
  nome: string;
  onChangeNome: (nome: string) => void;
  onPick: (prof: ProfissionalCache) => void; // preenche Nome + CNS do profissional
  uppercase?: boolean; // força maiúsculas ao digitar (opt-in; omitido = original → v2 intacta)
}

// Campo Nome do Profissional com autocomplete a partir do cache local de profissionais
// do estabelecimento (alimentado pela Edge Function). É texto livre: se a API/base não
// tiver o profissional, a pessoa digita normalmente (fallback gracioso, sem travar).
export function ProfissionalAutocomplete({ cnes, top, left, width, height, nome, onChangeNome, onPick, uppercase = false }: Props) {
  const [sugs, setSugs] = useState<ProfissionalCache[]>([]);
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
      buscarProfissionais(cnes, nome).then((r) => {
        if (!cancel) {
          setSugs(r);
          setOpen(r.length > 0);
        }
      });
    }, 200); // debounce: lê o cache, não a API
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [nome, cnes, focused]);

  const pick = (p: ProfissionalCache) => {
    onPick(p);
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
          className="absolute z-[60] max-h-56 min-w-[260px] overflow-auto rounded-md border border-border bg-white py-1 text-sm shadow-lg"
          style={{ top: `calc(${top + height}% + 2px)`, left: `${left}%` }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {sugs.map((p) => (
            <li
              key={p.cns}
              className="cursor-pointer px-3 py-1.5 hover:bg-primary/10"
              onMouseDown={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
                pick(p);
              }}
            >
              <div className="font-medium leading-tight">{p.nome}</div>
              <div className="font-mono text-xs text-muted-foreground">CNS {p.cns}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
