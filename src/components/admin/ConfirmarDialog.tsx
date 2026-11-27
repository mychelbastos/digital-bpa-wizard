// Diálogo de confirmação genérico (substitui os window.confirm da Administração).
// Uso: const { confirmar, dialogo } = useConfirmar(); if (!(await confirmar({...}))) return;
import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { btnOutline, btnPrimario } from "./ui";

export interface OpcoesConfirmar {
  titulo: string;
  descricao: ReactNode;
  confirmarRotulo?: string;
  cancelarRotulo?: string;
  destrutivo?: boolean;
}

export function ConfirmarDialog({
  aberto,
  opcoes,
  onResposta,
}: {
  aberto: boolean;
  opcoes: OpcoesConfirmar | null;
  onResposta: (ok: boolean) => void;
}) {
  return (
    <AlertDialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) onResposta(false);
      }}
    >
      <AlertDialogContent className="max-w-[480px] rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">{opcoes?.titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-[14px] leading-relaxed text-muted-foreground">
              {opcoes?.descricao}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className={cn(btnOutline, "mt-0")} onClick={() => onResposta(false)}>
            {opcoes?.cancelarRotulo ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              opcoes?.destrutivo ? cn(btnPrimario, "bg-rose-600 hover:bg-rose-700") : btnPrimario
            }
            onClick={() => onResposta(true)}
          >
            {opcoes?.confirmarRotulo ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useConfirmar() {
  const [opcoes, setOpcoes] = useState<OpcoesConfirmar | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const confirmar = useCallback(
    (o: OpcoesConfirmar) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOpcoes(o);
      }),
    [],
  );
  const responder = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpcoes(null);
  };
  const dialogo = (
    <ConfirmarDialog aberto={opcoes !== null} opcoes={opcoes} onResposta={responder} />
  );
  return { confirmar, dialogo };
}
