import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Pencil, Check, Loader2, FileText, Printer, ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Square, CheckSquare, X } from "lucide-react";
import { listarFichas, renomearFicha, type FichaResumo } from "@/lib/bpa-i-v2/fichas";
import { buscarNomesPorCns } from "@/lib/bpa-i-v2/profissionais";
import { rotuloExibicao } from "@/lib/bpa-i-v2/titulo-ficha";

export const Route = createFileRoute("/minhas-fichas")({
  head: () => ({ meta: [{ title: "Minhas fichas — BPA" }] }),
  component: MinhasFichasPage,
});

const PAGE_SIZE = 25;

// Rótulo do mês (AAAAMM -> "julho/2026").
function labelComp(comp: string | null): string {
  if (!comp || !/^[0-9]{6}$/.test(comp)) return "Sem competência";
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${meses[Number(comp.slice(4, 6)) - 1]}/${comp.slice(0, 4)}`;
}

const rotaDoTipo = (tipo: FichaResumo["tipo"], id: string) => (tipo === "BPA-C" ? `/bpa-c-v3?ficha=${id}` : `/bpa-i-v3?ficha=${id}`);
// Token de uma ficha para a página /imprimir ("I~<id>" ou "C~<id>").
const tokenImpressao = (f: FichaResumo) => `${f.tipo === "BPA-C" ? "C" : "I"}~${f.id}`;

type TipoFiltro = "todos" | "BPA-C" | "BPA-I";

function MinhasFichasPage() {
  const [fichas, setFichas] = useState<FichaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  // Mês selecionado no menu ("todos" = geral; null = ainda não escolheu → cai no mais recente).
  const [mesSel, setMesSel] = useState<string | null>(null);
  const [tipoSel, setTipoSel] = useState<TipoFiltro>("todos");
  const [pagina, setPagina] = useState(1);
  const [verTodas, setVerTodas] = useState(false);
  const [menuMesesAberto, setMenuMesesAberto] = useState(false);
  // Modo "imprimir várias": caixinhas por ficha + seleção da página inteira.
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listarFichas().then(async (f) => {
      setFichas(f);
      setCarregando(false);
      // Fichas importadas guardam só o CNS — resolve o nome do profissional (na tabela
      // `profissionais`) p/ o rótulo mostrar o nome no lugar do CNS. Uma consulta em lote.
      const pares = f
        .filter((x) => !x.profNome && x.profCns && x.cnes)
        .map((x) => ({ cnes: x.cnes!, cns: x.profCns! }));
      if (pares.length === 0) return;
      const mapa = await buscarNomesPorCns(pares);
      if (mapa.size === 0) return;
      setFichas((prev) => prev.map((x) => {
        if (x.profNome || !x.profCns) return x;
        const nome = mapa.get(`${x.cnes}|${x.profCns}`) ?? mapa.get(x.profCns);
        return nome ? { ...x, profNome: nome } : x;
      }));
    });
  }, []);

  const confirmarRenomeio = async (id: string) => {
    const titulo = novoNome.trim();
    if (titulo && (await renomearFicha(id, titulo))) {
      setFichas((prev) => prev.map((f) => (f.id === id ? { ...f, titulo } : f)));
    }
    setEditandoId(null);
  };

  // Agrupa pelo MÊS DE PRODUÇÃO (mês de apresentação = mes_producao), não pela competência
  // de atendimento: uma ficha de atendimento de out/2025 apresentada em janeiro faz parte da
  // PRODUÇÃO DE JANEIRO (foi lançada/importada nesse mês). A competência de atendimento de
  // cada ficha é mostrada como detalhe na própria linha.
  const mesProd = (f: FichaResumo) => f.mes_producao ?? f.competencia; // fallback p/ fichas antigas
  const chaveMes = (comp: string | null) => comp ?? "sem";

  // Grupos por mês de produção (para o menu). A contagem do menu é por mês (todos os tipos).
  const grupos = useMemo(() => {
    const gs: { comp: string | null; itens: FichaResumo[] }[] = [];
    for (const f of fichas) {
      const chave = mesProd(f);
      const g = gs.find((x) => x.comp === chave);
      if (g) g.itens.push(f);
      else gs.push({ comp: chave, itens: [f] });
    }
    gs.sort((a, b) => (b.comp ?? "").localeCompare(a.comp ?? ""));
    return gs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichas]);

  // Default: o mês mais recente; a pessoa troca no menu ou escolhe "Geral".
  const mesAtivo = mesSel ?? (grupos[0] ? chaveMes(grupos[0].comp) : "todos");

  // Lista achatada, já filtrada por mês + tipo e ordenada. Dentro de cada mês, ordena pela
  // competência de ATENDIMENTO desc e, em seguida, pelo título com ordenação NUMÉRICA
  // (numeric:true) — assim "folha 2" vem antes de "folha 10" (antes saía 1,10,11…,2,20).
  const itensFiltrados = useMemo(() => {
    const visiveis = mesAtivo === "todos" ? grupos : grupos.filter((g) => chaveMes(g.comp) === mesAtivo);
    const flat: FichaResumo[] = [];
    for (const g of visiveis) {
      const itens = g.itens
        .filter((f) => tipoSel === "todos" || f.tipo === tipoSel)
        .sort((a, b) =>
          (b.competencia ?? "").localeCompare(a.competencia ?? "") ||
          (a.titulo ?? "").localeCompare(b.titulo ?? "", "pt-BR", { numeric: true }));
      flat.push(...itens);
    }
    return flat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupos, mesAtivo, tipoSel]);

  // Volta pra página 1 sempre que muda o filtro (mês/tipo).
  useEffect(() => { setPagina(1); }, [mesAtivo, tipoSel]);

  const totalPaginas = Math.max(1, Math.ceil(itensFiltrados.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * PAGE_SIZE;
  // "Ver todas": mostra a lista inteira do filtro (sem paginar). Aí "selecionar todas"
  // passa a abranger TODAS as fichas visíveis, independentemente da quantidade.
  const itensPagina = verTodas ? itensFiltrados : itensFiltrados.slice(inicio, inicio + PAGE_SIZE);

  // Agrupa a fatia da página por mês, só para exibir os cabeçalhos "Produção de …".
  const secoesPagina: { comp: string | null; itens: FichaResumo[] }[] = [];
  for (const f of itensPagina) {
    const chave = mesProd(f);
    const s = secoesPagina.find((x) => x.comp === chave);
    if (s) s.itens.push(f);
    else secoesPagina.push({ comp: chave, itens: [f] });
  }

  const pill = (ativo: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      ativo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"
    }`;

  const rolar = (dir: -1 | 1) => stripRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });

  // Seleção p/ impressão em lote.
  const idsPagina = itensPagina.map((f) => f.id);
  const todasPaginaSel = idsPagina.length > 0 && idsPagina.every((id) => sel.has(id));
  const toggleSel = (id: string) => setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleTodasPagina = () => setSel((prev) => {
    const n = new Set(prev);
    if (todasPaginaSel) idsPagina.forEach((id) => n.delete(id));
    else idsPagina.forEach((id) => n.add(id));
    return n;
  });
  const sairSelecao = () => { setSelMode(false); setSel(new Set()); };
  const imprimirSelecionadas = () => {
    const toks = itensFiltrados.filter((f) => sel.has(f.id)).map(tokenImpressao);
    if (toks.length === 0) return;
    window.open(`/imprimir?itens=${toks.join(",")}`, "_blank", "noopener");
  };

  // Barra de paginação (renderizada acima e abaixo da lista). Traz o "Ver todas as fichas":
  // ao ativar, some a paginação e a lista inteira do filtro aparece — e "selecionar todas"
  // passa a abranger tudo que está visível.
  const barraPaginacao = (totalPaginas > 1 || verTodas) ? (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {verTodas ? (
        <>
          <span className="px-2 text-xs text-muted-foreground">Mostrando todas as {itensFiltrados.length} fichas</span>
          <button onClick={() => setVerTodas(false)} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">Mostrar paginado</button>
        </>
      ) : (
        <>
          <button disabled={paginaAtual === 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40">
            <ChevronLeft className="size-4" /> Anterior
          </button>
          <span className="px-2 text-xs text-muted-foreground">Página {paginaAtual} de {totalPaginas} · {itensFiltrados.length} fichas</span>
          <button disabled={paginaAtual === totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40">
            Próxima <ChevronRight className="size-4" />
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
          <button onClick={() => setVerTodas(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
            <FileText className="size-3.5" /> Ver todas as fichas
          </button>
        </>
      )}
    </div>
  ) : null;

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
            {/* Filtro por tipo de formulário + ação de imprimir várias (linha de cima). */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Tipo:</span>
              {(["todos", "BPA-C", "BPA-I"] as TipoFiltro[]).map((t) => (
                <button key={t} onClick={() => setTipoSel(t)} className={pill(tipoSel === t)}>
                  {t === "todos" ? "Todos" : t}
                </button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">{itensFiltrados.length} ficha{itensFiltrados.length === 1 ? "" : "s"}</span>
              {/* Ver todos os meses (dropdown) — fica aqui em cima p/ não roubar largura do
                  carrossel; útil quando há muitos meses. */}
              <div className="relative shrink-0">
                <button onClick={() => setMenuMesesAberto((v) => !v)} className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                  <CalendarDays className="size-3.5" /> Meses <ChevronDown className="size-3.5" />
                </button>
                {menuMesesAberto && (
                  <>
                    <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenuMesesAberto(false)} />
                    <div className="absolute right-0 z-20 mt-1 max-h-72 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                      <button onClick={() => { setMesSel("todos"); setMenuMesesAberto(false); }} className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted ${mesAtivo === "todos" ? "font-semibold text-primary" : "text-foreground"}`}>
                        Geral <span className="text-xs text-muted-foreground">{fichas.length}</span>
                      </button>
                      {grupos.map((g) => (
                        <button key={chaveMes(g.comp)} onClick={() => { setMesSel(chaveMes(g.comp)); setMenuMesesAberto(false); }} className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm capitalize hover:bg-muted ${mesAtivo === chaveMes(g.comp) ? "font-semibold text-primary" : "text-foreground"}`}>
                          {labelComp(g.comp)} <span className="text-xs text-muted-foreground">{g.itens.length}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {!selMode && (
                <button onClick={() => setSelMode(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                  <Printer className="size-3.5" /> Imprimir várias
                </button>
              )}
            </div>

            {/* Menu por mês/ano — carrossel em linha própria (largura total). "Geral" fixo à
                esquerda, setas nas pontas; o "Meses" (dropdown) fica na linha de cima. */}
            <div className="mb-5 flex items-center gap-1.5">
              <button onClick={() => setMesSel("todos")} className={pill(mesAtivo === "todos")}>
                Geral <span className="opacity-70">({fichas.length})</span>
              </button>
              <span className="mx-0.5 h-4 w-px bg-border" />
              <button onClick={() => rolar(-1)} aria-label="Anterior" className="shrink-0 rounded-full border border-border bg-card p-1 text-muted-foreground hover:bg-muted"><ChevronLeft className="size-4" /></button>
              <div ref={stripRef} className="flex flex-1 gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {grupos.map((g) => (
                  <button key={chaveMes(g.comp)} onClick={() => setMesSel(chaveMes(g.comp))} className={`${pill(mesAtivo === chaveMes(g.comp))} capitalize`}>
                    {labelComp(g.comp)} <span className="opacity-70">({g.itens.length})</span>
                  </button>
                ))}
              </div>
              <button onClick={() => rolar(1)} aria-label="Próximo" className="shrink-0 rounded-full border border-border bg-card p-1 text-muted-foreground hover:bg-muted"><ChevronRight className="size-4" /></button>
            </div>

            {/* Barra de seleção (modo imprimir várias). */}
            {selMode && (
              <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 backdrop-blur">
                <button onClick={toggleTodasPagina} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                  {todasPaginaSel ? <CheckSquare className="size-3.5 text-primary" /> : <Square className="size-3.5" />}
                  {todasPaginaSel
                    ? (verTodas ? "Desmarcar todas" : "Desmarcar página")
                    : (verTodas ? `Selecionar todas (${itensFiltrados.length})` : "Selecionar todas (página)")}
                </button>
                <span className="text-xs text-muted-foreground">{sel.size} selecionada{sel.size === 1 ? "" : "s"}</span>
                <button onClick={imprimirSelecionadas} disabled={sel.size === 0} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  <Printer className="size-3.5" /> Imprimir selecionadas ({sel.size})
                </button>
                <button onClick={sairSelecao} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                  <X className="size-3.5" /> Cancelar
                </button>
              </div>
            )}

            {itensFiltrados.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma ficha para este filtro.</p>
            ) : (
              <>
                {barraPaginacao && <div className="mb-4">{barraPaginacao}</div>}
                {secoesPagina.map((g) => (
                  <section key={g.comp ?? "sem"} className="mb-6">
                    <h2 className="mb-2 text-sm font-semibold text-foreground">
                      <span className="capitalize">Produção de {labelComp(g.comp)}</span>
                    </h2>
                    <div className="space-y-1.5">
                      {g.itens.map((f) => {
                        const marcada = sel.has(f.id);
                        return (
                        <div
                          key={f.id}
                          onClick={selMode ? () => toggleSel(f.id) : undefined}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${selMode ? "cursor-pointer select-none" : ""} ${marcada && selMode ? "border-primary bg-primary/5 ring-1 ring-inset ring-primary/20" : "border-border bg-card"}`}
                        >
                          {selMode && (
                            marcada
                              ? <CheckSquare className="size-4 shrink-0 text-primary" />
                              : <Square className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${f.tipo === "BPA-C" ? "bg-teal-100 text-teal-700" : "bg-sky-100 text-sky-700"}`}>{f.tipo}</span>
                          {f.competencia && f.competencia !== mesProd(f) && (
                            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-amber-800" title="Atendimento retroativo — apresentado neste mês de produção">
                              atend. {labelComp(f.competencia)}
                            </span>
                          )}
                          {selMode ? (
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-foreground">{rotuloExibicao(f)}</div>
                              <div className="text-xs text-muted-foreground">Atualizada {new Date(f.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
                            </div>
                          ) : editandoId === f.id ? (
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <input autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") confirmarRenomeio(f.id); if (e.key === "Escape") setEditandoId(null); }}
                                className="min-w-0 flex-1 rounded-md border border-primary bg-background px-2 py-1 text-sm outline-none ring-2 ring-primary/30" />
                              <button onClick={() => confirmarRenomeio(f.id)} className="rounded-md p-1.5 text-primary hover:bg-primary/10"><Check className="size-4" /></button>
                            </div>
                          ) : (
                            <>
                              <a href={rotaDoTipo(f.tipo, f.id)} className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground">{rotuloExibicao(f)}</div>
                                <div className="text-xs text-muted-foreground">Atualizada {new Date(f.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
                              </a>
                              <a href={rotaDoTipo(f.tipo, f.id)} className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"><FileText className="mr-1 inline size-3.5" />Abrir</a>
                              <a
                                href={`/imprimir?itens=${tokenImpressao(f)}`}
                                target="_blank"
                                rel="noopener"
                                aria-label="Imprimir (abre a impressão do navegador)"
                                title="Imprimir no navegador (sem baixar)"
                                className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                              ><Printer className="mr-1 inline size-3.5" />Imprimir</a>
                              <button aria-label="Renomear" onClick={() => { setEditandoId(f.id); setNovoNome(f.titulo || ""); }} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-4" /></button>
                            </>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </section>
                ))}

                {barraPaginacao && <div className="mt-4">{barraPaginacao}</div>}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
