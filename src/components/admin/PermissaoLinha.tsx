// Uma permissão: rótulo + etiqueta de estado (padrão / exceção / parcial) + Switch.
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { EstadoPerm } from "./constantes";
import { Pill } from "./ui";

export function etiquetaEstado(est: EstadoPerm): { texto: string; excecao: boolean } {
  if (est.parcial)
    return { texto: `Parcial · ${est.quantos ?? 0} de ${est.total ?? 0} unidades`, excecao: true };
  if (est.ativa !== est.padrao)
    return {
      texto: est.ativa ? "Exceção · liberado além do cargo" : "Exceção · bloqueado",
      excecao: true,
    };
  return { texto: est.padrao ? "Padrão do cargo" : "Fora do cargo", excecao: false };
}

export function PermissaoLinha({
  rotulo,
  codigo,
  est,
  carregando,
  desabilitado,
  onAlternar,
  onRestaurar,
}: {
  rotulo: string;
  codigo: string;
  est: EstadoPerm;
  carregando: boolean;
  desabilitado: boolean;
  onAlternar: () => void;
  onRestaurar: () => void;
}) {
  const et = etiquetaEstado(est);
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[14.5px] font-medium text-foreground" title={codigo}>
          {rotulo}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Pill tom={et.excecao ? "ambar" : "cinza"}>{et.texto}</Pill>
          {et.excecao && (
            <button
              type="button"
              onClick={onRestaurar}
              disabled={desabilitado || carregando}
              className="text-[12.5px] font-semibold text-primary hover:underline disabled:opacity-40"
            >
              Restaurar padrão
            </button>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {carregando && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Salvando" />
        )}
        <Switch
          checked={est.ativa}
          onCheckedChange={onAlternar}
          disabled={desabilitado || carregando}
          aria-label={rotulo}
          title={codigo}
          className={cn(
            "h-[26px] w-[46px] [&>span]:size-5 [&>span]:data-[state=checked]:translate-x-5",
            est.parcial && "data-[state=unchecked]:bg-amber-500",
          )}
        />
      </div>
    </div>
  );
}
