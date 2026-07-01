import { useState } from "react";
import { signIn, signOut, type AuthUser } from "@/lib/bpa-i-v2/auth";

// Controle de login no cabeçalho: "Entrar" (modal e-mail+senha) quando deslogado;
// nome da pessoa + "Sair" quando logada.
export function LoginControl({ user }: { user: AuthUser | null }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span
          className="rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-800"
          title={user.cns ? `CNS ${user.cns}` : undefined}
        >
          👤 {user.nome}
        </span>
        <button onClick={() => signOut()} className="rounded-md border border-border px-2 py-1 hover:bg-muted">
          Sair
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => { setErro(""); setOpen(true); }}
        className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted"
      >
        Entrar
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button aria-label="Fechar" className="absolute inset-0 cursor-default bg-black/40" onClick={() => setOpen(false)} />
          <form
            className="relative w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-2xl"
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true); setErro("");
              const r = await signIn(email.trim(), senha);
              setLoading(false);
              if (r.ok) { setOpen(false); setSenha(""); } else setErro(r.erro ?? "Falha no login.");
            }}
          >
            <h2 className="text-base font-semibold text-foreground">Entrar</h2>
            <p className="mt-1 text-xs text-muted-foreground">Identifique-se para confirmar a ficha como Responsável.</p>
            <input
              type="email" required placeholder="E-mail" autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="password" required placeholder="Senha" autoComplete="current-password" value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
