import { useEffect, useRef, useState } from "react";
import { buscarProfissionais, type ProfissionalCache } from "@/lib/bpa-i-v2/profissionais";

interface Props {
  top: number;
  left: number;
  width: number;
  height: number;
  cnes: string; // CNES do estabelecimento (7 díg.) — escopo da busca no cache
  nome: string;
  onChangeNome: (nome: string) => void;
}

// Campo NOME DO PROFISSIONAL (BPA-C v3) com autocomplete a partir do cache `profissionais`
// do estabelecimento (mesma fonte do BPA-I). Texto livre em MAIÚSCULAS — se a base não
// tiver o profissional, digita normalmente (fallback gracioso). É controle interno do
// painel: NÃO é exportado ao .txt / BPA Magnético.
export function NomeProfissionalAutocomplete({ top, left, width, height, cnes, nome, onChangeNome }: Props) {
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
    }, 200); // debounce
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [nome, focused, cnes]);

  const pick = (p: ProfissionalCache) => {
    onChangeNome(p.nome.toUpperCase());
    setOpen(false);
    setSugs([]);
  };

  return (
    <>
      <input
        className="form-text"
        style={{ position: "absolute", top: `${top}%`, left: `${left}%`, width: `${width}%`, height: `${height}%` }}
        value={nome.toUpperCase()}
        onChange={(e) => onChangeNome(e.target.value.toUpperCase())}
        title="Nome do profissional (controle interno — não vai para o arquivo BPA Magnético)"
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
