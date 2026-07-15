import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FolderOpen, Pencil, Check, Loader2, FileText, Printer } from "lucide-react";
import { listarFichas, renomearFicha, type FichaResumo } from "@/lib/bpa-i-v2/fichas";

export const Route = createFileRoute("/minhas-fichas")({
  head: () => ({ meta: [{ title: "Minhas fichas — BPA" }] }),
  component: MinhasFichasPage,
});

// Rótulo do mês (AAAAMM -> "julho/2026").
function labelComp(comp: string | null): string {
  if (!comp || !/^[0-9]{6}$/.test(comp)) return "Sem competência";
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${meses[Number(comp.slice(4, 6)) - 1]}/${comp.slice(0, 4)}`;
}

const rotaDoTipo = (tipo: FichaResumo["tipo"], id: string) => (tipo === "BPA-C" ? `/bpa-c-v2?ficha=${id}` : `/bpa-i-v3?ficha=${id}`);

function MinhasFichasPage() {
  const [fichas, setFichas] = useState<FichaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  // Mês selecionado no menu ("todos" = geral; null = ainda não escolheu → cai no mais recente).
  const [mesSel, setMesSel] = useState<string | null>(null);

  useEffect(() => {
    listarFichas().then((f) => { setFichas(f); setCarregando(false); });
  }, []);

  const confirmarRenomeio = async (id: string) => {
    const titulo = novoNome.trim();
    if (titulo && (await renomearFicha(id, titulo))) {
      setFichas((prev) => prev.map((f) => (f.id === id ? { ...f, titulo } : f)));
    }
    setEditandoId(null);
  };

  // Agrupa por competência (mês de apresentação), na ordem em que aparecem (já vêm
  // ordenadas por atualização desc).
  const grupos: { comp: string | null; itens: FichaResumo[] }[] = [];
  for (const f of fichas) {
    const g = grupos.find((x) => x.comp === f.competencia);
    if (g) g.itens.push(f);
    else grupos.push({ comp: f.competencia, itens: [f] });
  }
  grupos.sort((a, b) => (b.comp ?? "").localeCompare(a.comp ?? ""));

  // Chave estável de cada mês no menu (competência ou "sem"); "todos" = visão geral.
  const chaveMes = (comp: string | null) => comp ?? "sem";
  // Default: o mês mais recente (grupos[0]); a pessoa troca no menu ou escolhe "Geral".
  const mesAtivo = mesSel ?? (grupos[0] ? chaveMes(grupos[0].comp) : "todos");
  const gruposVisiveis = mesAtivo === "todos" ? grupos : grupos.filter((g) => chaveMes(g.comp) === mesAtivo);

  const pill = (ativo: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      ativo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"
    }`;

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
          <h1 className="flex items-center gap-2 text-base font-semibold"><FolderOpen className="size-4" /> Minhas fichas</h1>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-[900px] px-4">
        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </div>
        ) : fichas.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Nenhuma ficha salva ainda. Preencha um formulário e clique em “Salvar ficha”.</p>
        ) : (
          <>
            {/* Menu por mês/ano — abre no mais recente; "Geral" mostra todos os meses. */}
            <div className="mb-5 flex flex-wrap items-center gap-1.5">
              <button onClick={() => setMesSel("todos")} className={pill(mesAtivo === "todos")}>
                Geral <span className="opacity-70">({fichas.length})</span>
              </button>
              <span className="mx-1 h-4 w-px bg-border" />
              {grupos.map((g) => (
                <button key={chaveMes(g.comp)} onClick={() => setMesSel(chaveMes(g.comp))} className={`${pill(mesAtivo === chaveMes(g.comp))} capitalize`}>
                  {labelComp(g.comp)} <span className="opacity-70">({g.itens.length})</span>
                </button>
              ))}
            </div>
            {gruposVisiveis.map((g) => (
            <section key={g.comp ?? "sem"} className="mb-6">
              <h2 className="mb-2 text-sm font-semibold capitalize text-foreground">{labelComp(g.comp)} <span className="text-xs font-normal text-muted-foreground">· {g.itens.length} ficha{g.itens.length > 1 ? "s" : ""}</span></h2>
              <div className="space-y-1.5">
                {g.itens.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${f.tipo === "BPA-C" ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary"}`}>{f.tipo}</span>
                    {editandoId === f.id ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <input autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") confirmarRenomeio(f.id); if (e.key === "Escape") setEditandoId(null); }}
                          className="min-w-0 flex-1 rounded-md border border-primary bg-background px-2 py-1 text-sm outline-none ring-2 ring-primary/30" />
                        <button onClick={() => confirmarRenomeio(f.id)} className="rounded-md p-1.5 text-primary hover:bg-primary/10"><Check className="size-4" /></button>
                      </div>
                    ) : (
                      <>
                        <a href={rotaDoTipo(f.tipo, f.id)} className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">{f.titulo || "Ficha sem nome"}</div>
                          <div className="text-xs text-muted-foreground">Atualizada {new Date(f.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
                        </a>
                        <a href={rotaDoTipo(f.tipo, f.id)} className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"><FileText className="mr-1 inline size-3.5" />Abrir</a>
                        <a
                          href={`${rotaDoTipo(f.tipo, f.id)}&print=1`}
                          target="_blank"
                          rel="noopener"
                          aria-label="Imprimir / gerar PDF"
                          title="Imprimir / gerar PDF (abre em nova aba)"
                          className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                        ><Printer className="mr-1 inline size-3.5" />Imprimir</a>
                        <button aria-label="Renomear" onClick={() => { setEditandoId(f.id); setNovoNome(f.titulo || ""); }} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-4" /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
