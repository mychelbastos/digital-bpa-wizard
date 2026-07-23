import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Home,
  FileText,
  FolderOpen,
  CalendarCheck,
  FileSpreadsheet,
  Database,
  UserCog,
  LogOut,
  ChevronDown,
  Files,
  ShieldCheck,
  Ambulance,
} from "lucide-react";
import { signOut, useAuthUser } from "@/lib/bpa-i-v2/auth";
import { souAdmin } from "@/lib/permissoes";
import { carregarVinculosUsuario } from "@/lib/dashboard-producao";
import { CNES_TFD } from "@/lib/tfd/tfd";

const formularios = [
  { to: "/bpa-i-v3", label: "BPA-I" },
  { to: "/bpa-c-v3", label: "BPA-C" },
  { to: "/laudo-aih", label: "Laudo AIH" },
  { to: "/apac", label: "APAC" },
] as const;

// Iniciais do nome (até 2 letras) para o avatar quando não há foto.
const iniciais = (s: string) =>
  s.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

const linkCls = (active: boolean) =>
  `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted"}`;

// Menu lateral do app (só no desktop; no mobile as páginas mantêm o "← Início").
export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = useAuthUser();
  const [formOpen, setFormOpen] = useState(true);
  const [podeAdmin, setPodeAdmin] = useState(false);
  const [podeTfd, setPodeTfd] = useState(false);
  const formActive = formularios.some((f) => pathname.startsWith(f.to));

  useEffect(() => {
    let vivo = true;
    souAdmin().then((ok) => vivo && setPodeAdmin(ok));
    // Aba TFD só p/ quem tem vínculo em algum CNES habilitado para o TFD.
    carregarVinculosUsuario().then((vincs) => {
      if (vivo) setPodeTfd(vincs.some((v) => CNES_TFD.includes(v.cnes)));
    });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-background md:flex">
      <div className="px-4 py-4 text-sm font-bold tracking-tight text-foreground">Digital BPA</div>
      <nav className="flex-1 space-y-1 px-2">
        <Link to="/" className={linkCls(pathname === "/")}>
          <Home className="size-4 shrink-0" /> Início
        </Link>

        {/* Formulários (submenu) */}
        <button
          type="button"
          onClick={() => setFormOpen((o) => !o)}
          className={`${linkCls(formActive && !formOpen)} w-full justify-between`}
        >
          <span className="flex items-center gap-2">
            <Files className="size-4 shrink-0" /> Formulários
          </span>
          <ChevronDown
            className={`size-4 shrink-0 transition-transform ${formOpen ? "" : "-rotate-90"}`}
          />
        </button>
        {formOpen && (
          <div className="ml-3 space-y-1 border-l border-border pl-2">
            {formularios.map((f) => (
              <Link key={f.to} to={f.to} className={linkCls(pathname.startsWith(f.to))}>
                <FileText className="size-4 shrink-0" /> {f.label}
              </Link>
            ))}
          </div>
        )}

        <Link to="/minhas-fichas" className={linkCls(pathname.startsWith("/minhas-fichas"))}>
          <FolderOpen className="size-4 shrink-0" /> Minhas fichas
        </Link>
        <Link to="/fechamento" className={linkCls(pathname.startsWith("/fechamento"))}>
          <CalendarCheck className="size-4 shrink-0" /> Fechamento do mês
        </Link>
        <Link to="/fpo" search={{}} className={linkCls(pathname.startsWith("/fpo"))}>
          <FileSpreadsheet className="size-4 shrink-0" /> FPO (Orçamento)
        </Link>
        {podeTfd && (
          <Link to="/tfd" search={{}} className={linkCls(pathname.startsWith("/tfd"))}>
            <Ambulance className="size-4 shrink-0" /> TFD
          </Link>
        )}
        <Link to="/importar" className={linkCls(pathname.startsWith("/importar"))}>
          <Database className="size-4 shrink-0" /> Importar produção
        </Link>
        {podeAdmin && (
          <Link to="/admin" className={linkCls(pathname.startsWith("/admin"))}>
            <ShieldCheck className="size-4 shrink-0" /> Administração
          </Link>
        )}
      </nav>

      {/* Identidade + Perfil + Sair, agrupados no rodapé. */}
      <div className="border-t border-border p-2">
        <div className="mb-1 flex items-center gap-2 px-2 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {iniciais(user?.nome || user?.email || "")}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground" title={user?.nome || user?.email || ""}>
              {user?.nome || user?.email || "—"}
            </div>
            {user?.cns ? (
              <div className="truncate text-[11px] text-muted-foreground">CNS {user.cns}</div>
            ) : user?.email ? (
              <div className="truncate text-[11px] text-muted-foreground">{user.email}</div>
            ) : null}
          </div>
        </div>
        <Link to="/perfil" className={linkCls(pathname.startsWith("/perfil"))}>
          <UserCog className="size-4 shrink-0" /> Perfil
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="size-4" /> Sair
        </button>
      </div>
    </aside>
  );
}
