// Filtros em pílula (mesma lógica de antes: trocar a unidade zera profissional e procedimento).
const pilula =
  "h-10 max-w-full rounded-full border border-[#D5DCE6] bg-white px-3 pr-8 text-[13.5px] font-medium text-[#172033] outline-none focus:border-[#2563D9] focus:ring-2 focus:ring-[#2563D9]/20 sm:max-w-[280px]";

export function FiltrosBar({
  cnes,
  profissional,
  procedimento,
  unidades,
  profissionais,
  procedimentos,
  onCnes,
  onProfissional,
  onProcedimento,
  status,
}: {
  cnes: string;
  profissional: string;
  procedimento: string;
  unidades: { key: string; name: string }[];
  profissionais: { key: string; name: string }[];
  procedimentos: { code: string; name: string }[];
  onCnes: (v: string) => void;
  onProfissional: (v: string) => void;
  onProcedimento: (v: string) => void;
  status: string;
}) {
  return (
    <section
      aria-label="Filtros"
      className="rv flex flex-wrap items-center gap-2.5"
      style={{ animationDelay: "160ms" }}
    >
      <label className="min-w-0 max-w-full">
        <span className="sr-only">Unidade</span>
        <select className={pilula} value={cnes} onChange={(e) => onCnes(e.target.value)}>
          <option value="todos">Todas as unidades</option>
          {unidades.map((u) => (
            <option key={u.key} value={u.key}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 max-w-full">
        <span className="sr-only">Profissional</span>
        <select
          className={pilula}
          value={profissional}
          onChange={(e) => onProfissional(e.target.value)}
        >
          <option value="todos">Todos os profissionais</option>
          {profissionais.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 max-w-full">
        <span className="sr-only">Procedimento</span>
        <select
          className={pilula}
          value={procedimento}
          onChange={(e) => onProcedimento(e.target.value)}
        >
          <option value="todos">Todos os procedimentos</option>
          {procedimentos.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name !== p.code ? `${p.name} (${p.code})` : p.code}
            </option>
          ))}
        </select>
      </label>
      <span className="ml-auto text-[12.5px] text-[#5B6B82]" role="status">
        {status}
      </span>
    </section>
  );
}
