import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Home, FileText, FolderOpen, CalendarCheck, FileSpreadsheet, Database, UserCog, LogOut,
  ChevronDown, Files, ShieldCheck, Ambulance, FileBarChart, Menu, X, PanelLeftClose, PanelLeftOpen, Lock,
} from "lucide-react";
import { signOut, useAuthUser } from "@/lib/bpa-i-v2/auth";
import spaEmblem from "@/assets/spa-emblem.png";
import { souAdmin, usePermissoes } from "@/lib/permissoes";
import { carregarVinculosUsuario } from "@/lib/dashboard-producao";
import { CNES_TFD } from "@/lib/tfd/tfd";

const formularios = [
  { to: "/laudo-aih", label: "AIH" },
  { to: "/apac", label: "APAC" },
  { to: "/bpa-c-v3", label: "BPA-C" },
  { to: "/bpa-i-v3", label: "BPA-I" },
  { to: "/raas", label: "RAAS" },
] as const;

const iniciais = (s: string) =>
  s.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

// Gradientes da nova identidade (azul-petróleo → índigo).
const BG_SIDEBAR = "linear-gradient(195deg, oklch(0.24 0.05 256), oklch(0.165 0.045 260))";
const BG_ATIVO = "linear-gradient(135deg, oklch(0.6 0.18 262), oklch(0.53 0.19 278))";
const BG_LOGO = "linear-gradient(135deg, oklch(0.72 0.16 235), oklch(0.6 0.19 282))";

const linkBase = "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] font-medium transition-colors";

// Conteúdo da navegação (reusado no desktop e no drawer mobile).
// `onColapsar` (só no desktop) mostra o botão de ocultar a barra.
function NavConteudo({ onNavegar, onColapsar }: { onNavegar?: () => void; onColapsar?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = useAuthUser();
  const { pode } = usePermissoes();
  const [formOpen, setFormOpen] = useState(true);
  const [podeAdmin, setPodeAdmin] = useState(false);
  const [podeTfd, setPodeTfd] = useState(false);
  const formActive = formularios.some((f) => pathname.startsWith(f.to));

  useEffect(() => {
    let vivo = true;
    souAdmin().then((ok) => vivo && setPodeAdmin(ok));
    carregarVinculosUsuario().then((vincs) => { if (vivo) setPodeTfd(vincs.some((v) => CNES_TFD.includes(v.cnes))); });
    return () => { vivo = false; };
  }, []);

  const item = (active: boolean) =>
    `${linkBase} ${active ? "font-semibold text-white shadow-[0_8px_18px_-10px_oklch(0.5_0.18_262/0.8)]" : "text-slate-300/90 hover:bg-white/5 hover:text-white"}`;
  const styleAtivo = (active: boolean) => (active ? { background: BG_ATIVO } : undefined);
  const tituloSecao = "px-3 pb-2.5 pt-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400/70";

  // Entrada de menu que respeita permissão: com acesso vira Link; sem acesso fica com cadeado,
  // não navega e mostra tooltip (padrão "não clica + tooltip").
  const Entrada = ({ to, perm, icon, label, search }: { to: string; perm: string; icon: React.ReactNode; label: string; search?: Record<string, unknown> }) => {
    if (!pode(perm)) {
      return (
        <div title="Sem permissão — fale com o gestor" aria-disabled="true"
          className={`${linkBase} cursor-not-allowed text-slate-500/60`}>
          {icon} <span className="flex-1">{label}</span> <Lock className="size-3.5 shrink-0 opacity-70" />
        </div>
      );
    }
    const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
    return (
      <Link to={to} search={search as never} onClick={onNavegar} className={item(active)} style={styleAtivo(active)}>
        {icon} {label}
      </Link>
    );
  };

  return (
    <>
      <div className="flex items-center gap-2.5 px-2 pb-6 pt-1">
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white p-0.5 shadow-sm">
          <img src={spaEmblem} alt="SPA Digital" className="size-full object-contain" />
        </span>
        <span className="text-[15px] font-bold tracking-tight text-white">SPA Digital</span>
        {onColapsar && (
          <button
            type="button"
            onClick={onColapsar}
            title="Ocultar menu"
            aria-label="Ocultar menu"
            className="ml-auto rounded-lg p-1.5 text-slate-300/80 transition-colors hover:bg-white/5 hover:text-white"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        <Entrada to="/" perm="ver_dashboard" icon={<Home className="size-4 shrink-0" />} label="Início" />

        <div className="pt-3">
          {pode("ver_formularios") ? (
            <>
              <button type="button" onClick={() => setFormOpen((o) => !o)} className={`${item(formActive && !formOpen)} w-full justify-between`} style={styleAtivo(formActive && !formOpen)}>
                <span className="flex items-center gap-2.5"><Files className="size-4 shrink-0" /> Formulários</span>
                <ChevronDown className={`size-4 shrink-0 transition-transform ${formOpen ? "" : "-rotate-90"}`} />
              </button>
              {formOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {formularios.map((f) => (
                    <Link key={f.to} to={f.to} onClick={onNavegar} className={`${item(pathname.startsWith(f.to))} pl-8`} style={styleAtivo(pathname.startsWith(f.to))}>
                      <FileText className="size-4 shrink-0" /> {f.label}
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div title="Sem permissão — fale com o gestor" aria-disabled="true" className={`${linkBase} cursor-not-allowed text-slate-500/60`}>
              <Files className="size-4 shrink-0" /> <span className="flex-1">Formulários</span> <Lock className="size-3.5 shrink-0 opacity-70" />
            </div>
          )}
        </div>

        {podeTfd && <Link to="/tfd" search={{}} onClick={onNavegar} className={item(pathname.startsWith("/tfd"))} style={styleAtivo(pathname.startsWith("/tfd"))}><Ambulance className="size-4 shrink-0" /> TFD</Link>}

        <div className="mt-3 space-y-0.5 border-t border-white/10 pt-3">
          <Entrada to="/minhas-fichas" perm="ver_minhas_fichas" icon={<FolderOpen className="size-4 shrink-0" />} label="Minhas fichas" />
          <Entrada to="/relatorios" perm="ver_relatorios" icon={<FileBarChart className="size-4 shrink-0" />} label="Relatórios" />
          <Entrada to="/fpo" perm="ver_fpo" search={{}} icon={<FileSpreadsheet className="size-4 shrink-0" />} label="FPO (Orçamento)" />
          <Entrada to="/fechamento" perm="ver_exportar" icon={<CalendarCheck className="size-4 shrink-0" />} label="Exportar produção" />
          <Entrada to="/importar" perm="ver_importar" icon={<Database className="size-4 shrink-0" />} label="Importar produção" />
          {podeAdmin && <Link to="/admin" onClick={onNavegar} className={item(pathname.startsWith("/admin"))} style={styleAtivo(pathname.startsWith("/admin"))}><ShieldCheck className="size-4 shrink-0" /> Administração</Link>}
        </div>
        <div className={tituloSecao + " sr-only"}>fim</div>
      </nav>

      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="mb-1 flex items-center gap-2.5 px-2 py-1.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: BG_LOGO }}>
            {iniciais(user?.nome || user?.email || "")}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold text-white" title={user?.nome || user?.email || ""}>{user?.nome || user?.email || "—"}</div>
            {user?.cns ? <div className="truncate font-mono text-[10.5px] text-slate-400">CNS {user.cns}</div>
              : user?.email ? <div className="truncate text-[10.5px] text-slate-400">{user.email}</div> : null}
          </div>
        </div>
        <Link to="/perfil" onClick={onNavegar} className={item(pathname.startsWith("/perfil"))} style={styleAtivo(pathname.startsWith("/perfil"))}><UserCog className="size-4 shrink-0" /> Perfil</Link>
        <button type="button" onClick={() => signOut()} className="mt-0.5 flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] font-medium text-rose-300/90 transition-colors hover:bg-rose-500/10 hover:text-rose-200">
          <LogOut className="size-4" /> Sair
        </button>
      </div>
    </>
  );
}

const SIDEBAR_COLAPSADA_KEY = "sidebar-colapsada";

export function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Recolher a barra no DESKTOP (preferência lembrada). Começa `false` para não divergir na
  // hidratação (SSR); depois lê a preferência salva.
  const [colapsada, setColapsada] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Fecha o drawer ao trocar de rota (segurança extra além do onNavegar).
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    try { setColapsada(localStorage.getItem(SIDEBAR_COLAPSADA_KEY) === "1"); } catch { /* noop */ }
  }, []);
  const alternarColapso = (v: boolean) => {
    setColapsada(v);
    try { localStorage.setItem(SIDEBAR_COLAPSADA_KEY, v ? "1" : "0"); } catch { /* noop */ }
  };

  return (
    <>
      {/* Desktop */}
      <aside className={`sticky top-0 hidden h-screen w-60 shrink-0 flex-col px-4 py-5 print:!hidden ${colapsada ? "md:hidden" : "md:flex"}`} style={{ background: BG_SIDEBAR }}>
        <NavConteudo onColapsar={() => alternarColapso(true)} />
      </aside>

      {/* Desktop: botão flutuante p/ reabrir a barra quando recolhida. Fica no canto
          INFERIOR esquerdo (a sarjeta esquerda é sempre livre — o conteúdo é centralizado),
          para não cobrir o "← Início" dos cabeçalhos fixos das páginas. */}
      {colapsada && (
        <button
          type="button"
          onClick={() => alternarColapso(false)}
          title="Mostrar menu"
          aria-label="Mostrar menu"
          className="fixed bottom-4 left-4 z-40 hidden items-center justify-center rounded-full border border-white/10 p-2.5 text-white shadow-lg transition-colors hover:brightness-110 md:flex print:!hidden"
          style={{ background: BG_SIDEBAR }}
        >
          <PanelLeftOpen className="size-5" />
        </button>
      )}

      {/* Mobile: barra superior fixa (o conteúdo das páginas ganha pt-[52px] no layout). */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-[52px] items-center gap-3 px-4 text-white shadow-md md:hidden print:!hidden" style={{ background: BG_SIDEBAR }}>
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu" className="-ml-1 p-1"><Menu className="size-6" /></button>
        <span className="flex size-7 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5"><img src={spaEmblem} alt="SPA Digital" className="size-full object-contain" /></span>
        <span className="text-[15px] font-bold">SPA Digital</span>
      </div>

      {/* Mobile: drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col px-4 py-5 shadow-2xl" style={{ background: BG_SIDEBAR }}>
            <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 text-slate-300 hover:text-white" aria-label="Fechar menu"><X className="size-5" /></button>
            <NavConteudo onNavegar={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
