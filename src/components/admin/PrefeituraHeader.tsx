// Trilha + cabeçalho + abas sublinhadas da prefeitura.
import { ChevronLeft } from "lucide-react";
import type { OrganizacaoAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { iniciais, municipioDoNome } from "./constantes";
import { BadgeLayout } from "./PrefeiturasLista";
import { Avatar, Numero, Pill } from "./ui";

export type AbaPref = "usuarios" | "unidades" | "arquivo" | "relatorios";

export function PrefeituraHeader({
  org,
  nUsuarios,
  nUnidades,
  aba,
  onAba,
  onVoltar,
}: {
  org: OrganizacaoAdmin;
  nUsuarios: number;
  nUnidades: number;
  aba: AbaPref;
  onAba: (a: AbaPref) => void;
  onVoltar: () => void;
}) {
  const abas: { id: AbaPref; rotulo: string; n?: number }[] = [
    { id: "usuarios", rotulo: "Usuários", n: nUsuarios },
    { id: "unidades", rotulo: "Unidades (CNES)", n: nUnidades },
    { id: "arquivo", rotulo: "Arquivo magnético" },
    { id: "relatorios", rotulo: "Relatórios e gestão" },
  ];
  return (
    <div className="space-y-5">
      <nav aria-label="Trilha" className="flex flex-wrap items-center gap-1.5 text-sm">
        <button
          type="button"
          onClick={onVoltar}
          className="inline-flex min-h-8 items-center gap-1 rounded-md font-semibold text-primary hover:underline"
        >
          <ChevronLeft className="size-4" /> Prefeituras
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="truncate text-muted-foreground">{org.nome}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar texto={iniciais(municipioDoNome(org.nome))} tamanho={52} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{org.nome}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {(org.municipio_ibge || org.uf) && (
              <Pill tom="cinza">
                <span className="font-mono">IBGE {org.municipio_ibge ?? "—"}</span>
                {org.uf ? ` · ${org.uf}` : ""}
              </Pill>
            )}
            {org.gestao_nome && <Pill tom="cinza">Gestão {org.gestao_nome}</Pill>}
            <BadgeLayout versao={org.cab_versao} />
          </div>
        </div>
      </div>
      <div
        role="tablist"
        aria-label="Seções da prefeitura"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => onAba(a.id)}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold transition-colors",
              aba === a.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.rotulo}
            {a.n !== undefined && <Numero n={a.n} />}
          </button>
        ))}
      </div>
    </div>
  );
}
