import { createFileRoute, Link } from "@tanstack/react-router";
import bpacBg from "@/assets/bpa-c.png";
import bpaiBg from "@/assets/bpa-i.png";
import { useAuthUser, signOut } from "@/lib/bpa-i-v2/auth";
import { LogOut, User, Settings } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Formulários BPA Digitais — Ministério da Saúde" },
      { name: "description", content: "Preencha digitalmente os formulários oficiais BPA-C e BPA-I do SIA/SUS com layout pixel-perfect e exportação em PDF." },
    ],
  }),
  component: Home,
});

function Home() {
  const user = useAuthUser();
  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto flex max-w-5xl items-center justify-end gap-2 px-6 pt-4 text-xs">
        {user && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 ring-1 ring-emerald-200">
            <User className="size-3.5" /> {user.nome || user.email}
          </span>
        )}
        <Link
          to="/perfil"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings className="size-3.5" /> Perfil
        </Link>
        <button
          onClick={() => signOut()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-3.5" /> Sair
        </button>
      </div>
      <div className="mx-auto max-w-5xl px-6 pb-16 pt-6">
        <header className="mb-12 text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">SIA / SUS</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Formulários BPA Digitais</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Digite diretamente sobre o formulário oficial do Ministério da Saúde, com auto-avanço entre caixinhas e exportação em PDF pronto para impressão.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          <Link
            to="/bpa-c-v2"
            className="group rounded-xl border bg-card p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="aspect-[553/786] overflow-hidden rounded-md border bg-white">
              <img src={bpacBg} alt="BPA-C" className="h-full w-full object-cover object-top" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">BPA-C</h2>
            <p className="text-sm text-muted-foreground">Boletim de Produção Ambulatorial — Consolidado</p>
            <span className="mt-3 inline-block text-sm font-medium text-primary group-hover:underline">Abrir formulário →</span>
          </Link>

          <Link
            to="/bpa-i-v2"
            className="group rounded-xl border bg-card p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="aspect-[553/786] overflow-hidden rounded-md border bg-white">
              <img src={bpaiBg} alt="BPA-I" className="h-full w-full object-cover object-top" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">BPA-I</h2>
            <p className="text-sm text-muted-foreground">Boletim de Produção Ambulatorial — Individualizado</p>
            <span className="mt-3 inline-block text-sm font-medium text-primary group-hover:underline">Abrir formulário →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
