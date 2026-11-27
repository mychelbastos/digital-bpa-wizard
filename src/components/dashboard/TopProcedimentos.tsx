// Top 5 procedimentos; "Ver {n} ›" abre o modal com a lista completa.
import { ChevronRight } from "lucide-react";
import { SkLista } from "./Skeletons";
import { intFmt, type Agrupado } from "./util";

export function TopProcedimentos({
  itens,
  total,
  carregando,
  onVerTodos,
}: {
  itens: Agrupado[];
  total: number;
  carregando: boolean;
  onVerTodos: () => void;
}) {
  return (
    <section
      className="card rv flex min-w-0 flex-[4_1_300px] flex-col rounded-[18px] border border-[#E3E8EF] bg-white"
      style={{ animationDelay: "420ms" }}
    >
      <div className="flex items-center justify-between px-6 pb-2.5 pt-[22px]">
        <h2 className="m-0 text-base font-semibold">Top procedimentos</h2>
        {total > 0 && (
          <button
            type="button"
            onClick={onVerTodos}
            className="more inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-[#2563D9]"
          >
            Ver {total} <ChevronRight className="chev size-3.5" />
          </button>
        )}
      </div>
      {carregando ? (
        <SkLista />
      ) : itens.length === 0 ? (
        <p className="px-6 pb-5 text-[13.5px] text-[#5B6B82]">Sem produção.</p>
      ) : (
        <ol className="m-0 list-none p-0 pb-3">
          {itens.map((p, i) => (
            <li key={p.key} className="row-l flex items-center gap-3 px-6 py-[9px]">
              <span className="w-[18px] text-[12.5px] font-semibold tabular-nums text-[#5B6B82]">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13.5px]" title={p.name}>
                  {p.name}
                </span>
                {p.name !== p.key && (
                  <span className="mono text-[11.5px] text-[#5B6B82]">{p.key}</span>
                )}
              </span>
              <span className="text-[13.5px] font-semibold tabular-nums">
                {intFmt(p.quantidade)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
