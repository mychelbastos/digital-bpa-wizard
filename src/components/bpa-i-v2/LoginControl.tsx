import { useEffect, useState } from "react";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, LogIn, LogOut, User, X, Loader2, AlertCircle } from "lucide-react";
import { signIn, signOut, type AuthUser } from "@/lib/bpa-i-v2/auth";

// Controle de login no cabeçalho: "Entrar" (modal e-mail+senha) quando deslogado;
// nome da pessoa + "Sair" quando logada.
export function LoginControl({ user }: { user: AuthUser | null }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  // Fecha com Esc quando o modal está aberto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (user) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 ring-1 ring-emerald-200"
          title={user.cns ? `CNS ${user.cns}` : undefined}
        >
          <User className="size-3.5" /> {user.nome}
        </span>
        <button
          onClick={() => signOut()}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-3.5" /> Sair
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => { setErro(""); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <LogIn className="size-4" /> Entrar
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            aria-label="Fechar"
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm animate-in fade-in"
            onClick={() => setOpen(false)}
          />
          <form
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true); setErro("");
              const r = await signIn(email.trim(), senha);
              setLoading(false);
              if (r.ok) { setOpen(false); setSenha(""); } else setErro(r.erro ?? "Falha no login.");
            }}
          >
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            <div className="flex flex-col items-center px-6 pt-7 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                <ShieldCheck className="size-6" />
              </div>
              <h2 className="mt-3 text-lg font-semibold text-foreground">Entrar</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Identifique-se para confirmar a ficha como Responsável.
              </p>
            </div>

            <div className="space-y-3 px-6 pb-2 pt-5">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">E-mail</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email" required placeholder="voce@exemplo.com" autoComplete="username" autoFocus value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">Senha</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={verSenha ? "text" : "password"} required placeholder="Sua senha" autoComplete="current-password" value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-10 text-sm outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setVerSenha((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>

              {erro && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{erro}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 px-6 pb-6 pt-3">
              <button
                type="button" onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit" disabled={loading}
                className="flex flex-[1.4] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? <><Loader2 className="size-4 animate-spin" /> Entrando...</> : <><LogIn className="size-4" /> Entrar</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
