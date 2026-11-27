// Modal de procedimentos e detalhe do profissional (com a impressão da produção e das fichas).
// Movidos SEM ALTERAÇÃO de lógica do index.tsx no redesign v2 da dashboard.
import { useEffect, useMemo, useState } from "react";
import { Activity, FileText, IdCard, MapPin, Printer, Stethoscope, X } from "lucide-react";
import type { ProducaoBpaRow, TipoBpa } from "@/lib/dashboard-producao";
import { paletaRelatorio } from "@/lib/relatorio-cor";
import { SPA_EMBLEMA_DATA_URI } from "@/lib/spa-emblem-pdf";
import { CHART_COLORS, agrupar, mesLabel, nomeCarater, nomeOuCodigo } from "./util";

export function ProcedimentosModal({
  rows,
  onClose,
}: {
  rows: { key: string; name: string; quantidade: number; atendimentos: number }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  const max = rows[0]?.quantidade || 1;
  const totalQtd = rows.reduce((s, r) => s + r.quantidade, 0);
  const totalAtend = rows.reduce((s, r) => s + r.atendimentos, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <FileText className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Todos os procedimentos</h2>
              <p className="text-xs text-muted-foreground">
                {rows.length} procedimento{rows.length === 1 ? "" : "s"} ·{" "}
                {totalQtd.toLocaleString("pt-BR")} quantidade · {totalAtend.toLocaleString("pt-BR")}{" "}
                atendimento{totalAtend === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <ol className="divide-y divide-border p-5">
          {rows.map((r, i) => (
            <li key={r.key} className="py-2.5">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-6 shrink-0 text-right text-xs font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 truncate text-sm text-foreground">{r.name}</span>
                  {r.name !== r.key && (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {r.key}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{r.atendimentos} atend.</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                    {r.quantidade.toLocaleString("pt-BR")}
                  </span>
                </span>
              </div>
              <div className="ml-8 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, (r.quantidade / max) * 100)}%`,
                    background: CHART_COLORS[i % CHART_COLORS.length],
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// Item agrupado (mesma forma de `agrupar`): usado nas listas do relatório de impressão.
interface ItemAgrupado {
  key: string;
  name: string;
  quantidade: number;
  atendimentos: number;
}

// Abre uma janela nova com um relatório A4 autocontido da produção do profissional (o
// conteúdo do modal) e dispara a impressão nativa do navegador. Não mexe no CSS da
// dashboard — o relatório é um documento próprio, com seu próprio estilo de impressão.
function imprimirProducaoProfissional(d: {
  nome: string;
  cns: string | null;
  cbo: string | null;
  cboNome: string | null;
  competenciaLabel: string;
  logo: string | null;
  cor: string | null;
  totalQtd: number;
  atendimentos: number;
  bpaC: number;
  bpaI: number;
  procedimentos: ItemAgrupado[];
  unidades: ItemAgrupado[];
  carateres: ItemAgrupado[];
  cids: ItemAgrupado[];
}) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const num = (n: number) => n.toLocaleString("pt-BR");
  // Mesma cor de destaque dos demais relatórios (verde padrão / roxo Ruy Barbosa etc.).
  const { accent, accentClaro } = paletaRelatorio(d.cor);
  const AC = `rgb(${accent[0]},${accent[1]},${accent[2]})`;
  const ACL = `rgb(${accentClaro[0]},${accentClaro[1]},${accentClaro[2]})`;

  const linhaProc = (p: ItemAgrupado) => `
    <tr>
      <td>${esc(p.name)}${p.name !== p.key ? ` <span class="cod">${esc(p.key)}</span>` : ""}</td>
      <td class="num">${num(p.quantidade)}</td>
    </tr>`;
  const chip = (c: ItemAgrupado, mostrarKey: boolean) =>
    `<li>${esc(c.name)}${mostrarKey && c.name !== c.key ? ` <span class="cod">${esc(c.key)}</span>` : ""} <b>${num(c.quantidade)}</b></li>`;

  const bloco = (titulo: string, itens: ItemAgrupado[], mostrarKey: boolean) =>
    itens.length === 0
      ? ""
      : `
      <section>
        <h2>${esc(titulo)}</h2>
        <ul class="chips">${itens.map((c) => chip(c, mostrarKey)).join("")}</ul>
      </section>`;

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Produção — ${esc(d.nome)}</title>
<style>
  /* margin: 0 no @page faz o Chrome NÃO imprimir o cabeçalho/rodapé automático (data,
     "about:blank", nº de página). As margens do conteúdo vêm do padding do body. */
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111827; margin: 0; padding: 14mm; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Banda de cabeçalho na cor de destaque (mesmo padrão dos relatórios em PDF). Sangra até a
     borda da página (margens negativas cancelam o padding do body). */
  header { background: ${AC}; color: #fff; margin: -14mm -14mm 16px; padding: 12mm 14mm 10mm; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  header .logo-box { background: #fff; border-radius: 8px; padding: 6px 8px; display: inline-flex; }
  header .logo { max-height: 52px; max-width: 150px; width: auto; height: auto; object-fit: contain; }
  header .tit { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.8); }
  header h1 { font-size: 20px; margin: 3px 0 8px; color: #fff; }
  header .meta { font-size: 11px; color: rgba(255,255,255,.92); display: flex; flex-wrap: wrap; gap: 14px; }
  header .meta b { color: #fff; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
  .stats div { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; }
  .stats div.destaque { background: ${ACL}; border-color: ${AC}; }
  .stats span { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
  .stats b { font-size: 18px; }
  .stats div.destaque b { color: ${AC}; }
  section { margin-bottom: 16px; page-break-inside: avoid; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: ${AC}; border-bottom: 2px solid ${AC}; padding-bottom: 4px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 4px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 700; width: 70px; color: ${AC}; }
  .cod { color: #9ca3af; font-family: ui-monospace, monospace; font-size: 10px; }
  ul.chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  ul.chips li { border: 1px solid #e5e7eb; border-radius: 999px; padding: 3px 9px; }
  ul.chips b { margin-left: 4px; color: ${AC}; }
  footer { margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 10px; color: #9ca3af; }
  @media screen { body { max-width: 800px; margin: 24px auto; padding: 0; } header { margin: 0 0 16px; padding: 20px 24px; border-radius: 0 0 12px 12px; } .stats, section, footer { padding-left: 24px; padding-right: 24px; } }
</style></head>
<body>
  <header>
    <div>
      <div class="tit">Relatório de produção · SPA Digital</div>
      <h1>${esc(d.nome)}</h1>
      <div class="meta">
        <span>Competência: <b>${esc(d.competenciaLabel)}</b></span>
        <span>CNS: ${esc(d.cns || "não informado")}</span>
        <span>CBO: ${d.cbo ? esc(d.cbo) : "não informado"}${d.cboNome ? ` — ${esc(d.cboNome)}` : ""}</span>
        ${d.unidades.map((u) => `<span>Unidade: ${esc(u.name)}${u.name !== u.key ? ` (CNES ${esc(u.key)})` : ""}</span>`).join("")}
      </div>
    </div>
    ${d.logo ? `<span class="logo-box"><img class="logo" src="${esc(d.logo)}" alt="Logo" /></span>` : ""}
  </header>
  <div class="stats">
    <div class="destaque"><span>Procedimentos</span><b>${num(d.totalQtd)}</b></div>
    <div><span>Atendimentos</span><b>${num(d.atendimentos)}</b></div>
    <div><span>BPA-C</span><b>${num(d.bpaC)}</b></div>
    <div><span>BPA-I</span><b>${num(d.bpaI)}</b></div>
  </div>
  <section>
    <h2>Procedimentos realizados</h2>
    <table><tbody>${d.procedimentos.map(linhaProc).join("")}</tbody></table>
  </section>
  ${bloco("Caráter de atendimento", d.carateres, true)}
  ${bloco("CID mais frequentes", d.cids, false)}
  <footer><img src="${SPA_EMBLEMA_DATA_URI}" alt="" style="height:12px;width:12px;vertical-align:-2px;margin-right:5px;opacity:.7" />Gerado pelo SPA Digital em ${new Date().toLocaleString("pt-BR")}.</footer>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Aguarda o layout antes de imprimir (evita janela em branco em alguns navegadores).
  win.onload = () => {
    win.focus();
    win.print();
  };
}

export function ProfissionalDetalhe({
  chave,
  rows,
  nomeProc,
  nomeCbo,
  rotuloCid,
  competenciaLabel,
  logo,
  cor,
  onClose,
}: {
  chave: string;
  rows: ProducaoBpaRow[];
  nomeProc: (codigo: string) => string | null;
  nomeCbo: (cbo: string | null) => string | null;
  rotuloCid: (cid: string | null) => string;
  competenciaLabel: string;
  logo: string | null;
  cor: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const nome = rows.find((r) => r.profissional_nome)?.profissional_nome || chave;
  const cns = rows.find((r) => r.profissional_cns)?.profissional_cns || null;
  const cbo = rows.find((r) => r.cbo)?.cbo || null;
  const totalQtd = rows.reduce((s, r) => s + r.quantidade, 0);
  const atendimentos = rows.length;
  const bpaC = rows.filter((r) => r.tipo === "BPA-C").reduce((s, r) => s + r.quantidade, 0);
  const bpaI = rows.filter((r) => r.tipo === "BPA-I").reduce((s, r) => s + r.quantidade, 0);
  const unidades = agrupar(
    rows,
    (r) => r.cnes || "sem-cnes",
    (r) => nomeOuCodigo(r.estabelecimento_nome, r.cnes),
  );
  const procedimentos = agrupar(
    rows,
    (r) => r.procedimento,
    (r) => nomeProc(r.procedimento) || r.procedimento,
  );
  const cids = agrupar(
    rows.filter((r) => r.cid),
    (r) => r.cid || "?",
    (r) => rotuloCid(r.cid),
  );
  const carateres = agrupar(
    rows.filter((r) => r.carater),
    (r) => r.carater || "?",
    (r) => nomeCarater(r.carater) || `Caráter ${r.carater}`,
  );

  const cboNome = nomeCbo(cbo);
  const [fichasOpen, setFichasOpen] = useState(false);

  const imprimir = () =>
    imprimirProducaoProfissional({
      nome,
      cns,
      cbo,
      cboNome,
      competenciaLabel,
      logo,
      cor,
      totalQtd,
      atendimentos,
      bpaC,
      bpaI,
      procedimentos,
      unidades,
      carateres,
      cids,
    });

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={onClose}
      >
        <div
          className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {(nome || "?").trim().slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-foreground">{nome}</h2>
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  <p className="flex items-start gap-1.5">
                    <IdCard className="mt-0.5 size-3 shrink-0" />
                    <span>CNS {cns || "não informado"}</span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <Stethoscope className="mt-0.5 size-3 shrink-0" />
                    <span>
                      CBO {cbo || "não informado"}
                      {cboNome ? ` — ${cboNome}` : ""}
                    </span>
                  </p>
                  {unidades.map((u) => (
                    <p key={u.key} className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 size-3 shrink-0" />
                      <span>
                        {u.name}
                        {u.name !== u.key ? ` — CNES ${u.key}` : ""}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <button
                onClick={imprimir}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <FileText className="size-3.5" /> Imprimir resumo
              </button>
              <button
                onClick={() => setFichasOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Printer className="size-3.5" /> Imprimir fichas
              </button>
              <button
                onClick={onClose}
                className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </header>

          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Procedimentos" value={totalQtd} destaque />
              <MiniStat label="Atendimentos" value={atendimentos} />
              <MiniStat label="BPA-C" value={bpaC} />
              <MiniStat label="BPA-I" value={bpaI} />
            </div>

            <DetalheBloco
              titulo="Procedimentos realizados"
              icon={<FileText className="size-3.5" />}
            >
              <ul className="divide-y divide-border">
                {procedimentos.map((p) => (
                  <li key={p.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="min-w-0 truncate text-foreground">{p.name}</span>
                      {p.name !== p.key && (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {p.key}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                      {p.quantidade.toLocaleString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            </DetalheBloco>

            {carateres.length > 0 && (
              <DetalheBloco
                titulo="Caráter de atendimento"
                icon={<Activity className="size-3.5" />}
              >
                <ul className="flex flex-wrap gap-2">
                  {carateres.map((c) => (
                    <li
                      key={c.key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground"
                    >
                      {c.name}{" "}
                      <span className="font-mono text-[10px] text-muted-foreground">{c.key}</span>
                      <span className="rounded-full bg-primary/10 px-1.5 font-semibold tabular-nums text-primary">
                        {c.quantidade}
                      </span>
                    </li>
                  ))}
                </ul>
              </DetalheBloco>
            )}

            {cids.length > 0 && (
              <DetalheBloco titulo="CID mais frequentes" icon={<IdCard className="size-3.5" />}>
                <ul className="flex flex-wrap gap-2">
                  {cids.map((c) => (
                    <li
                      key={c.key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground"
                    >
                      {c.name}{" "}
                      <span className="rounded-full bg-primary/10 px-1.5 font-semibold tabular-nums text-primary">
                        {c.quantidade}
                      </span>
                    </li>
                  ))}
                </ul>
              </DetalheBloco>
            )}
          </div>
        </div>
      </div>
      {fichasOpen && (
        <ImprimirFichasProfissional
          nome={nome}
          rows={rows}
          nomeProc={nomeProc}
          onClose={() => setFichasOpen(false)}
        />
      )}
    </>
  );
}

// Modal p/ imprimir as FICHAS (folhas do BPA, não o resumo) de um profissional, podendo
// filtrar por competência (atendimento) e por procedimento. Monta a lista de ids e abre a
// página /imprimir (mesma usada em "Minhas fichas"), que captura cada ficha e imprime.
function ImprimirFichasProfissional({
  nome,
  rows,
  nomeProc,
  onClose,
}: {
  nome: string;
  rows: ProducaoBpaRow[];
  nomeProc: (codigo: string) => string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const [comp, setComp] = useState("todas");
  const [proc, setProc] = useState("todos");

  // Agrupa as linhas de produção por ficha (uma ficha tem várias linhas/procedimentos).
  const fichas = useMemo(() => {
    const map = new Map<
      string,
      { id: string; tipo: TipoBpa; competencia: string; procs: Set<string> }
    >();
    for (const r of rows) {
      if (!r.ficha_id) continue;
      const f = map.get(r.ficha_id) ?? {
        id: r.ficha_id,
        tipo: r.tipo,
        competencia: r.competencia,
        procs: new Set<string>(),
      };
      f.procs.add(r.procedimento);
      map.set(r.ficha_id, f);
    }
    return [...map.values()];
  }, [rows]);

  const competencias = useMemo(
    () =>
      [...new Set(rows.map((r) => r.competencia).filter(Boolean))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [rows],
  );
  const procedimentos = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows)
      if (!map.has(r.procedimento))
        map.set(r.procedimento, nomeProc(r.procedimento) || r.procedimento);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, nomeProc]);

  const selecionadas = fichas.filter(
    (f) => (comp === "todas" || f.competencia === comp) && (proc === "todos" || f.procs.has(proc)),
  );

  const imprimir = () => {
    if (selecionadas.length === 0) return;
    const itens = selecionadas
      .map((f) => `${f.tipo === "BPA-C" ? "C" : f.tipo === "RAAS" ? "R" : "I"}~${f.id}`)
      .join(",");
    window.open(`/imprimir?itens=${encodeURIComponent(itens)}`, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Printer className="size-4" /> Imprimir fichas
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{nome}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Competência
            </span>
            <select
              value={comp}
              onChange={(e) => setComp(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="todas">Todas as competências</option>
              {competencias.map((c) => (
                <option key={c} value={c}>
                  {mesLabel(c)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Procedimento
            </span>
            <select
              value={proc}
              onChange={(e) => setProc(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="todos">Todos os procedimentos</option>
              {procedimentos.map(([cod, label]) => (
                <option key={cod} value={cod}>
                  {label !== cod ? `${label} (${cod})` : cod}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            <b className="tabular-nums">{selecionadas.length}</b> ficha
            {selecionadas.length === 1 ? "" : "s"} selecionada{selecionadas.length === 1 ? "" : "s"}{" "}
            para impressão.
          </div>

          <button
            onClick={imprimir}
            disabled={selecionadas.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Printer className="size-4" /> Imprimir{" "}
            {selecionadas.length > 0 ? `${selecionadas.length} ` : ""}ficha
            {selecionadas.length === 1 ? "" : "s"}
          </button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Abre uma nova aba que prepara as folhas de cada ficha e chama a impressão do navegador.
          </p>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  destaque = false,
}: {
  label: string;
  value: number;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${destaque ? "border-primary/30 bg-primary/5" : "border-border bg-muted/40"}`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
        {value.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

function DetalheBloco({
  titulo,
  icon,
  children,
}: {
  titulo: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {titulo}
      </h3>
      {children}
    </section>
  );
}
