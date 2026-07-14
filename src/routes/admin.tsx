import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Loader2, Users, Eye } from "lucide-react";
import {
  listarVinculosAdmin,
  listarPermissoes,
  definirPermissao,
  leiturasRecentes,
  type VinculoAdmin,
  type PermissaoCat,
  type LeituraLog,
} from "@/lib/admin";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administração de vínculos e acessos" }] }),
  component: Admin,
});

function Admin() {
  const [vinculos, setVinculos] = useState<VinculoAdmin[]>([]);
  const [perms, setPerms] = useState<PermissaoCat[]>([]);
  const [leituras, setLeituras] = useState<LeituraLog[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  const recarregar = useCallback(() => {
    return Promise.all([listarVinculosAdmin(), listarPermissoes(), leiturasRecentes(50)]).then(
      ([v, p, l]) => {
        setVinculos(v);
        setPerms(p);
        setLeituras(l);
      },
    );
  }, []);

  useEffect(() => {
    recarregar().finally(() => setCarregando(false));
  }, [recarregar]);

  const toggle = async (v: VinculoAdmin, codigo: string, ativo: boolean) => {
    const chave = `${v.vinculo_id}:${codigo}`;
    setSalvando(chave);
    try {
      await definirPermissao(v.vinculo_id, codigo, !ativo);
      await recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar permissão.");
    } finally {
      setSalvando(null);
    }
  };

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  const semAcesso = !carregando && vinculos.length === 0;

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1000px] items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Início
          </Link>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="size-4" /> Administração de vínculos e acessos
          </h1>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-[1000px] px-4">
        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </div>
        ) : semAcesso ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Você não administra nenhuma organização (precisa da permissão “gerenciar vínculos”).
          </p>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="size-4" /> Vínculos ({vinculos.length})
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Clique numa permissão para conceder/revogar (override sobre o papel). O papel é só
                um pacote-padrão; a autorização real é a lista de permissões efetivas.
              </p>
              <div className="mt-4 space-y-3">
                {vinculos.map((v) => (
                  <div key={v.vinculo_id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {v.email}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {v.org_nome} · CNES {v.cnes} · papel{" "}
                          <span className="font-medium">{v.papel}</span>
                          {v.fim ? ` · até ${v.fim}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {perms.map((p) => {
                        const ativo = v.permissoes.includes(p.codigo);
                        const chave = `${v.vinculo_id}:${p.codigo}`;
                        return (
                          <button
                            key={p.codigo}
                            onClick={() => toggle(v, p.codigo, ativo)}
                            disabled={salvando === chave}
                            title={p.descricao}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                              ativo
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100"
                            } disabled:opacity-50`}
                          >
                            {salvando === chave ? "…" : ativo ? "✓ " : "+ "}
                            {p.codigo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Eye className="size-4" /> Acessos a fichas BPA-I (LGPD) — {leituras.length}{" "}
                recentes
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Toda abertura de ficha BPA-I (com dado pessoal do paciente) é registrada.
              </p>
              {leituras.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhum acesso registrado ainda.
                </p>
              ) : (
                <div className="mt-3 max-h-80 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Quando</th>
                        <th className="py-1 pr-3 font-medium">Quem</th>
                        <th className="py-1 pr-3 font-medium">CNES</th>
                        <th className="py-1 font-medium">Ficha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leituras.map((l, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-1 pr-3 tabular-nums">{fmt(l.lida_em)}</td>
                          <td className="py-1 pr-3">{l.email}</td>
                          <td className="py-1 pr-3 font-mono">{l.cnes}</td>
                          <td className="py-1 truncate">{l.titulo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
