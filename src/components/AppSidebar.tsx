import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Home,
  FileText,
  FolderOpen,
  CalendarCheck,
  UserCog,
  LogOut,
  ChevronDown,
  Files,
  ShieldCheck,
} from "lucide-react";
import { signOut } from "@/lib/bpa-i-v2/auth";
import { cnesComPermissao } from "@/lib/permissoes";

const formularios = [
  { to: "/bpa-i-v3", label: "BPA-I" },
  { to: "/bpa-c-v2", label: "BPA-C" },
] as const;

const linkCls = (active: boolean) =>
  `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted"}`;

// Menu lateral do app (só no desktop; no mobile as páginas mantêm o "← Início").
export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [formOpen, setFormOpen] = useState(true);
  const [podeAdmin, setPodeAdmin] = useState(false);
  const formActive = formularios.some((f) => pathname.startsWith(f.to));

  useEffect(() => {
    let vivo = true;
    cnesComPermissao("gerenciar_vinculos").then((cnes) => vivo && setPodeAdmin(cnes.length > 0));
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
        <Link to="/perfil" className={linkCls(pathname.startsWith("/perfil"))}>
          <UserCog className="size-4 shrink-0" /> Perfil
        </Link>
        {podeAdmin && (
          <Link to="/admin" className={linkCls(pathname.startsWith("/admin"))}>
            <ShieldCheck className="size-4 shrink-0" /> Administração
          </Link>
        )}
      </nav>
      <button
        type="button"
        onClick={() => signOut()}
        className="m-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
      >
        <LogOut className="size-4" /> Sair
      </button>
    </aside>
  );
}
