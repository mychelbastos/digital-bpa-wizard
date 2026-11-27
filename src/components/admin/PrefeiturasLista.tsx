// Tela inicial da Administração: KPIs, dono do sistema, prefeituras e últimas aberturas (LGPD).
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Search, ShieldCheck } from "lucide-react";
import type {
  DonoSistema,
  EstabelecimentoOrg,
  LeituraLog,
  OrganizacaoAdmin,
  PessoaAdmin,
} from "@/lib/admin";
import { layoutEmDia } from "@/lib/datasus-ref";
import { cn } from "@/lib/utils";
import { iniciais, municipioDoNome } from "./constantes";
import { TabelaLeituras } from "./AuditoriaLgpd";
import { Avatar, Card, inputCls, Pill, tdCls, thCls, btnOutline } from "./ui";

export function BadgeLayout({ versao }: { versao: string | null | undefined }) {
  const v = (versao ?? "").trim() || "—";
  return layoutEmDia(versao) ? (
    <Pill tom="verde">{v} · em dia</Pill>
  ) : (
    <Pill tom="ambar">{v} · revisar versão</Pill>
  );
}

export function PrefeiturasLista({
  organizacoes,
  estabPorOrg,
  pessoas,
  donos,
  leituras,
  onAbrir,
  onVerAuditoria,
}: {
  organizacoes: OrganizacaoAdmin[];
  estabPorOrg: Record<string, EstabelecimentoOrg[]>;
  pessoas: PessoaAdmin[];
  donos: DonoSistema[];
  leituras: LeituraLog[];
  onAbrir: (orgId: string) => void;
  onVerAuditoria: () => void;
}) {
  const [busca, setBusca] = useState("");
  const nUnid = Object.values(estabPorOrg).reduce((s, l) => s + l.length, 0);
  const nUsuarios = pessoas.filter((p) => p.total_vinculos > 0).length;
  const nRevisar = organizacoes.filter((o) => !layoutEmDia(o.cab_versao)).length;
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t
      ? organizacoes.filter(
          (o) =>
            o.nome.toLowerCase().includes(t) ||
            (o.municipio_ibge ?? "").includes(t) ||
            (o.uf ?? "").toLowerCase() === t,
        )
      : organizacoes;
  }, [busca, organizacoes]);

  const kpis: { rotulo: string; valor: number; alerta?: boolean }[] = [
    { rotulo: "Prefeituras", valor: organizacoes.length },
    { rotulo: "Unidades (CNES)", valor: nUnid },
    { rotulo: "Usuários ativos", valor: nUsuarios },
    { rotulo: "Cabeçalhos para revisar", valor: nRevisar, alerta: nRevisar > 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.rotulo}
            className={cn(
              "rounded-2xl border px-5 py-4",
              k.alerta
                ? "border-amber-200 bg-amber-50 dark:bg-amber-950/40"
                : "border-border bg-card",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-1.5 text-[13px] font-semibold",
                k.alerta ? "text-amber-900 dark:text-amber-200" : "text-muted-foreground",
              )}
            >
              {k.alerta && <AlertTriangle className="size-4" />} {k.rotulo}
            </div>
            <div
              className={cn(
                "mt-1 text-3xl font-bold tabular-nums",
                k.alerta ? "text-amber-900 dark:text-amber-100" : "text-foreground",
              )}
            >
              {k.valor}
            </div>
          </div>
        ))}
      </div>

      {donos.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm text-violet-950 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
          <ShieldCheck className="size-4 shrink-0" />
          <span className="font-semibold">Dono do sistema</span>
          <Pill tom="violeta" className="uppercase">
            Global
          </Pill>
          <span className="min-w-0">
            <span className="font-medium">{donos.map((d) => d.email).join(", ")}</span>
            {
              " — administra qualquer prefeitura. Para abrir fichas ainda precisa de vínculo no CNES."
            }
          </span>
        </div>
      )}

      <Card
        titulo="Prefeituras"
        corpoCls="p-0"
        acoes={
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Buscar prefeitura</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${inputCls} pl-9`}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar prefeitura"
            />
          </label>
        }
      >
        {lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {organizacoes.length
              ? "Nenhuma prefeitura com esse filtro."
              : "Nenhuma prefeitura cadastrada."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse">
              <thead>
                <tr>
                  <th className={thCls}>Prefeitura</th>
                  <th className={thCls}>Município / UF</th>
                  <th className={thCls}>Gestão vigente</th>
                  <th className={`${thCls} text-right`}>Unidades</th>
                  <th className={`${thCls} text-right`}>Usuários</th>
                  <th className={thCls}>Arquivo magnético</th>
                  <th className={thCls}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((o) => {
                  const nU = (estabPorOrg[o.id] ?? []).length;
                  const nP = pessoas.filter((p) => p.organizacao_id === o.id).length;
                  return (
                    <tr
                      key={o.id}
                      className="cursor-pointer border-t border-border hover:bg-muted/40"
                      onClick={() => onAbrir(o.id)}
                    >
                      <td className={tdCls}>
                        <div className="flex items-center gap-3">
                          <Avatar texto={iniciais(municipioDoNome(o.nome))} />
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground">{o.nome}</div>
                            {o.municipio_ibge && (
                              <div className="font-mono text-[12.5px] text-muted-foreground">
                                IBGE {o.municipio_ibge}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`${tdCls} text-muted-foreground`}>
                        {municipioDoNome(o.nome)}
                        {o.uf ? ` / ${o.uf}` : ""}
                      </td>
                      <td className={tdCls}>
                        {o.gestao_nome ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={`${tdCls} text-right tabular-nums`}>{nU}</td>
                      <td className={`${tdCls} text-right tabular-nums`}>{nP}</td>
                      <td className={tdCls}>
                        <BadgeLayout versao={o.cab_versao} />
                      </td>
                      <td className={`${tdCls} text-right`}>
                        <button
                          type="button"
                          className={btnOutline}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAbrir(o.id);
                          }}
                        >
                          Abrir <ChevronRight className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        titulo="Últimas aberturas de ficha BPA-I"
        subtitulo="Toda abertura de ficha com dado pessoal do paciente é registrada (LGPD)."
        acoes={
          <button
            type="button"
            onClick={onVerAuditoria}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Ver auditoria completa
          </button>
        }
        corpoCls="p-0"
      >
        <TabelaLeituras leituras={leituras.slice(0, 5)} />
      </Card>
    </div>
  );
}
