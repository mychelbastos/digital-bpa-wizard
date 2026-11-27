// Auditoria LGPD: aberturas de ficha BPA-I (com dado pessoal do paciente).
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { LeituraLog } from "@/lib/admin";
import { fmtDataHora } from "./constantes";
import { Card, inputCls, tdCls, thCls } from "./ui";

export function TabelaLeituras({
  leituras,
  vazio = "Nenhum acesso registrado ainda.",
}: {
  leituras: LeituraLog[];
  vazio?: string;
}) {
  if (leituras.length === 0)
    return <p className="py-6 text-center text-sm text-muted-foreground">{vazio}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            <th className={thCls}>Quando</th>
            <th className={thCls}>Quem</th>
            <th className={thCls}>Unidade</th>
            <th className={thCls}>Ficha</th>
          </tr>
        </thead>
        <tbody>
          {leituras.map((l, i) => (
            <tr key={`${l.ficha_id}:${l.lida_em}:${i}`} className="border-t border-border">
              <td className={`${tdCls} whitespace-nowrap tabular-nums text-muted-foreground`}>
                {fmtDataHora(l.lida_em)}
              </td>
              <td className={`${tdCls} break-all`}>{l.email}</td>
              <td className={`${tdCls} font-mono`}>{l.cnes}</td>
              <td className={`${tdCls} max-w-[360px] truncate`} title={l.titulo}>
                {l.titulo}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuditoriaLgpd({ leituras }: { leituras: LeituraLog[] }) {
  const [busca, setBusca] = useState("");
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return leituras;
    return leituras.filter(
      (l) =>
        l.email.toLowerCase().includes(t) ||
        (l.cnes ?? "").includes(t) ||
        (l.titulo ?? "").toLowerCase().includes(t),
    );
  }, [busca, leituras]);
  return (
    <Card
      titulo="Auditoria LGPD"
      subtitulo={`Toda abertura de ficha BPA-I (com dado pessoal do paciente) é registrada. Mostrando os ${leituras.length} acessos mais recentes.`}
      corpoCls="p-0"
    >
      <div className="border-b border-border px-5 py-3">
        <label className="relative block max-w-md">
          <span className="sr-only">Filtrar por e-mail, CNES ou ficha</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputCls} pl-9`}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por e-mail, CNES ou ficha"
            data-nocaps
          />
        </label>
      </div>
      <TabelaLeituras
        leituras={filtradas}
        vazio={busca ? "Nenhum acesso com esse filtro." : undefined}
      />
    </Card>
  );
}
