// Cabeçalho padrão das páginas internas (Minhas fichas, Fechamento, FPO, Relatórios,
// TFD, Importar, Administração, Perfil): ícone azul em quadrado arredondado + título +
// descrição curta — no mesmo padrão do Relatórios.
//
// A seta "voltar ao início" só aparece no MOBILE (onde o menu lateral fica oculto);
// no desktop o menu já tem o botão "Início", então ela seria redundante.
import { Link } from "@tanstack/react-router";
import { ArrowLeft, type LucideIcon } from "lucide-react";

export function PageHeader({ icon: Icon, titulo, descricao, right }: {
  icon: LucideIcon;
  titulo: string;
  descricao?: string;
  right?: React.ReactNode; // ação/logo à direita (opcional)
}) {
  return (
    <header className="mb-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link to="/" aria-label="Voltar ao início"
          className="-ml-1 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-foreground">{titulo}</h1>
          {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
        </div>
      </div>
      {right}
    </header>
  );
}
