// Top 5 profissionais (iniciais, nome, ocupação) — clique abre o detalhe. "Ver {n} ›" expande
// a lista completa dentro do card.
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { SkLista } from "./Skeletons";
import { iniciais, intFmt, type Agrupado } from "./util";

export function ProfissionaisLista({
  itens,
  ocupacao,
  carregando,
  onAbrir,
}: {
  itens: Agrupado[];
  ocupacao: (key: string) => string | null;
  carregando: boolean;
  onAbrir: (key: string) => void;
}) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? itens : itens.slice(0, 5);
  return (
    <section
      className="card rv flex min-w-0 flex-[4_1_300px] flex-col rounded-[18px] border border-[#E3E8EF] bg-white"
      style={{ animationDelay: "460ms" }}
    >
      <div className="flex items-center justify-between px-6 pb-2.5 pt-[22px]">
        <h2 className="m-0 text-base font-semibold">Profissionais</h2>
        {itens.length > 5 && (
          <button
            type="button"
            onClick={() => setTodos((v) => !v)}
            aria-expanded={todos}
            className="more inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-[#2563D9]"
          >
            {todos ? "Ver menos" : `Ver ${itens.length}`}{" "}
            <ChevronRight
              className="chev size-3.5"
              style={{ transform: todos ? "rotate(-90deg)" : undefined }}
            />
          </button>
        )}
      </div>
      {carregando ? (
        <SkLista />
      ) : itens.length === 0 ? (
        <p className="px-6 pb-5 text-[13.5px] text-[#5B6B82]">Sem produção.</p>
      ) : (
        <ul className={`m-0 list-none p-0 pb-3 ${todos ? "max-h-[520px] overflow-y-auto" : ""}`}>
          {lista.map((p) => {
            const oc = ocupacao(p.key);
            return (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => onAbrir(p.key)}
                  className="row-l flex w-full items-center gap-3 px-6 py-[9px] text-left text-[#172033]"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 flex-none items-center justify-center rounded-full bg-[#EAF1FD] text-xs font-bold text-[#1D4FB0]"
                  >
                    {iniciais(p.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13.5px] font-semibold" title={p.name}>
                      {p.name}
                    </span>
                    {oc && oc !== p.name && (
                      <span className="truncate text-xs text-[#5B6B82]">{oc}</span>
                    )}
                  </span>
                  <span className="text-[13.5px] font-semibold tabular-nums">
                    {intFmt(p.quantidade)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
