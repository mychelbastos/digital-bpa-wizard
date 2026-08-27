import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import faviconUrl from "@/assets/spa-emblem-64.png?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { useAuthState } from "@/lib/bpa-i-v2/auth";
import { LoginScreen } from "@/components/LoginScreen";
import { AppSidebar } from "@/components/AppSidebar";
import { Toaster } from "@/components/ui/sonner";
import { usePermissoes } from "@/lib/permissoes";
import { Lock } from "lucide-react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const detalhe = (error?.message || String(error) || "Erro desconhecido").trim();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Não foi possível abrir esta página
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocorreu um erro inesperado. Veja o motivo abaixo — tente novamente ou volte ao início.
          Se persistir, copie a mensagem e envie ao suporte.
        </p>
        <div className="mt-4 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 text-left">
          <div className="mb-1 text-[11px] font-semibold uppercase text-destructive">Motivo do erro</div>
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] text-foreground">{detalhe}</pre>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SPA Digital" },
      { name: "description", content: "Sistema de digitação e gestão de boletins de produção ambulatorial (BPA-I e BPA-C) para o SUS." },
      { name: "author", content: "SPA Digital" },
      { property: "og:title", content: "SPA Digital" },
      { property: "og:description", content: "Sistema de digitação e gestão de boletins de produção ambulatorial (BPA-I e BPA-C) para o SUS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: faviconUrl },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Guard de autenticação: enquanto a sessão carrega mostra spinner; sem usuário
// mostra a tela de login; logado, libera o app inteiro (todos os formulários).
function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthState();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }
  if (!user) return <LoginScreen />;
  return <>{children}</>;
}

// Rotas PÚBLICAS (fora do AuthGate e sem sidebar): a landing page de apresentação.
// Qualquer outra rota continua exigindo login.
const ROTAS_PUBLICAS = ["/apresentacao"];

// Mapa rota → permissão de menu exigida. Rotas ausentes não exigem permissão nova.
const FORMULARIOS_PREFIXOS = ["/laudo-aih", "/apac", "/bpa-c-v3", "/bpa-i-v3", "/raas"];
function permDaRota(pathname: string): string | null {
  if (pathname === "/") return "ver_dashboard";
  if (pathname.startsWith("/minhas-fichas")) return "ver_minhas_fichas";
  if (pathname.startsWith("/relatorios")) return "ver_relatorios";
  if (pathname.startsWith("/fpo")) return "ver_fpo";
  if (pathname.startsWith("/fechamento")) return "ver_exportar";
  if (pathname.startsWith("/importar")) return "ver_importar";
  if (FORMULARIOS_PREFIXOS.some((p) => pathname.startsWith(p))) return "ver_formularios";
  return null;
}

// Bloqueia a rota se o usuário não tem a permissão exigida. Enquanto carrega mostra spinner
// (não pisca conteúdo p/ quem está bloqueado). Sem permissão → tela "Sem acesso".
function GateRota({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { pode, carregando } = usePermissoes();
  const perm = permDaRota(pathname);
  if (!perm) return <>{children}</>;
  if (carregando) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="size-7 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>;
  }
  if (!pode(perm)) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Lock className="size-7" /></div>
          <h1 className="mt-5 text-xl font-bold text-foreground">Sem acesso a esta página</h1>
          <p className="mt-2 text-sm text-muted-foreground">Seu perfil não tem permissão para acessar esta seção. Se precisar, fale com o gestor/administrador da sua organização para liberar o acesso.</p>
          <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Voltar ao início</Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const publica = ROTAS_PUBLICAS.includes(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      {publica ? (
        <Outlet />
      ) : (
        <AuthGate>
          <div className="flex min-h-screen">
            <AppSidebar />
            {/* pt-[52px] no mobile abre espaço para a barra superior fixa (some no desktop).
                overflow-x-clip: nenhuma página rola horizontalmente (não quebra o sticky). */}
            <div className="min-w-0 flex-1 overflow-x-clip pt-[52px] md:pt-0">
              <GateRota><Outlet /></GateRota>
            </div>
          </div>
        </AuthGate>
      )}
      <Toaster />
    </QueryClientProvider>
  );
}
