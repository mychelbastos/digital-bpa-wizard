// Peças visuais compartilhadas da Administração (redesign 11/2026). Usam os tokens do tema.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputCls =
  "h-11 w-full rounded-[10px] border border-border bg-background px-3 text-[15px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60";
export const labelCls = "text-[13px] font-semibold text-foreground";
export const ajudaCls = "text-[12.5px] leading-snug text-muted-foreground";
export const btnBase =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimario = cn(btnBase, "bg-primary text-primary-foreground hover:bg-primary/90");
export const btnOutline = cn(
  btnBase,
  "border border-border bg-card text-foreground hover:bg-muted",
);
export const btnPerigo = cn(
  btnBase,
  "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
);
export const btnTexto =
  "inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-semibold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40";

export function Card({
  titulo,
  subtitulo,
  acoes,
  children,
  className,
  corpoCls,
}: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  children?: ReactNode;
  className?: string;
  corpoCls?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card shadow-sm", className)}>
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {titulo && <h2 className="text-base font-semibold text-foreground">{titulo}</h2>}
            {subtitulo && <p className={cn(ajudaCls, "mt-0.5")}>{subtitulo}</p>}
          </div>
          {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
        </header>
      )}
      <div className={cn("px-5 py-4", corpoCls)}>{children}</div>
    </section>
  );
}

export function Campo({
  rotulo,
  ajuda,
  extra,
  children,
  className,
  htmlFor,
}: {
  rotulo: ReactNode;
  ajuda?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className={labelCls}>
          {rotulo}
        </label>
        {extra}
      </div>
      {children}
      {ajuda && <div className={ajudaCls}>{ajuda}</div>}
    </div>
  );
}

export type Tom = "cinza" | "ambar" | "verde" | "violeta" | "azul" | "vermelho";
const TOM: Record<Tom, string> = {
  cinza: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  ambar: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  verde: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  violeta: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  azul: "bg-primary/10 text-primary",
  vermelho: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200",
};
export function Pill({
  tom = "cinza",
  children,
  className,
  title,
}: {
  tom?: Tom;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
        TOM[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({
  texto,
  tamanho = 36,
  className,
}: {
  texto: string;
  tamanho?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.38) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary",
        className,
      )}
    >
      {texto}
    </span>
  );
}

export function Numero({ n }: { n: number }) {
  return (
    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
      {n}
    </span>
  );
}

export const thCls =
  "whitespace-nowrap bg-muted/40 px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground";
export const tdCls = "px-4 py-3.5 align-middle text-sm";
