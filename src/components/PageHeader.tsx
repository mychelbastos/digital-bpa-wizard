// Cabeçalho padrão das páginas internas (Minhas fichas, Fechamento, FPO, Relatórios,
// TFD, Importar, Administração, Perfil): ícone azul em quadrado arredondado + título +
// descrição curta — no mesmo padrão do Relatórios.
//
// A seta "voltar ao início" só aparece no MOBILE (onde o menu lateral fica oculto);
// no desktop o menu já tem o botão "Início", então ela seria redundante.
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { buscarAutoriaFicha, dataHoraBr, EVENTO_FICHA_SALVA, type AutoriaFicha } from "@/lib/ficha-autoria";

// "Criada por X em … · Editada por Y em …" — só visualização (fora da folha: não sai no
// PDF/impressão/exportação). Atualiza ao trocar de ficha e logo após salvar.
export function AutoriaFichaLinha({ fichaId }: { fichaId?: string | null }) {
  const [a, setA] = useState<AutoriaFicha | null>(null);
  useEffect(() => {
    let vivo = true;
    const carregar = () => { if (fichaId) buscarAutoriaFicha(fichaId).then((r) => { if (vivo) setA(r); }); };
    setA(null);
    carregar();
    const onSalva = (e: Event) => { if ((e as CustomEvent).detail === fichaId) carregar(); };
    window.addEventListener(EVENTO_FICHA_SALVA, onSalva);
    return () => { vivo = false; window.removeEventListener(EVENTO_FICHA_SALVA, onSalva); };
  }, [fichaId]);
  if (!fichaId || !a?.criado_por) return null;
  return (
    <p className="no-print truncate text-[11px] leading-tight text-muted-foreground" data-html2canvas-ignore="true">
      Criada por <strong className="font-semibold text-foreground/80">{a.criado_por}</strong> em {dataHoraBr(a.criado_em)}
      {a.editado_por && (
        <> · Editada por <strong className="font-semibold text-foreground/80">{a.editado_por}</strong> em {dataHoraBr(a.editado_em)}</>
      )}
    </p>
  );
}

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

// Versão COMPACTA para os formulários (editores de folha): mesma identidade (ícone + nome +
// descrição), mas numa única linha ao lado dos botões — economiza altura na tela de edição.
// `fichaTitulo` mostra o nome da ficha atual (ex.: "Nova ficha") junto do nome do formulário.
// A seta de voltar continua só no mobile.
export function FormIdentity({ icon: Icon, nome, descricao, fichaTitulo, fichaId }: {
  icon: LucideIcon;
  nome: string;
  descricao?: string;
  fichaTitulo?: string | null;
  fichaId?: string | null; // ficha salva aberta → mostra quem criou/editou
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Link to="/" aria-label="Voltar ao início"
        className="-ml-1 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden">
        <ArrowLeft className="size-5" />
      </Link>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-bold text-foreground">{nome}</h1>
          {fichaTitulo !== undefined && (
            <span className="max-w-[40vw] truncate text-xs text-muted-foreground" title={fichaTitulo ?? undefined}>
              · {fichaTitulo || "Nova ficha"}
            </span>
          )}
        </div>
        {descricao && <p className="truncate text-[11px] leading-tight text-muted-foreground">{descricao}</p>}
        <AutoriaFichaLinha fichaId={fichaId} />
      </div>
    </div>
  );
}
