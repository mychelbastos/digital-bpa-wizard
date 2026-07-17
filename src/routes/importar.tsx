import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Upload, FileText, AlertTriangle, Loader2, Save, CheckCircle2, Database } from "lucide-react";
import { toast } from "sonner";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { parseArquivoMagnetico, type ResultadoMagnetico } from "@/lib/bpa-magnetico/parse-magnetico";
import { gravarMagnetico, contarImportadasNoMes } from "@/lib/bpa-magnetico/importar-magnetico";

export const Route = createFileRoute("/importar")({
  head: () => ({ meta: [{ title: "Importar produção (BPA Magnético)" }] }),
  component: ImportarPage,
});

const competenciaAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const compLabel = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : c);
const int = (n: number) => n.toLocaleString("pt-BR");

function ImportarPage() {
  const user = useAuthUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ResultadoMagnetico | null>(null);
  const [mesProducao, setMesProducao] = useState(competenciaAtual());
  const [nomesEstab, setNomesEstab] = useState<Record<string, string>>({});
  const [jaImportadas, setJaImportadas] = useState(0);
  const [processando, setProcessando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState<{ fichas: number; bpaC: number; bpaI: number } | null>(null);

  const totalFichas = parsed ? parsed.fichasC.length + parsed.fichasI.length : 0;
  const totalQtd = parsed ? parsed.totais.quantidadeBpaC + parsed.totais.quantidadeBpaI : 0;
  const compValida = /^\d{6}$/.test(mesProducao);

  const aoEscolher = async (file: File) => {
    setProcessando(true);
    setFeito(null);
    try {
      const buf = await file.arrayBuffer();
      const txt = new TextDecoder("iso-8859-1").decode(buf);
      const r = parseArquivoMagnetico(txt);
      setParsed(r);
      setFileName(file.name);
      const mes = r.cabecalho?.competencia ?? competenciaAtual();
      setMesProducao(mes);
      const nomes = await Promise.all(r.cnes.map(async (c) => [c, (await buscarEstabelecimento(c)) || ""] as const));
      setNomesEstab(Object.fromEntries(nomes));
      setJaImportadas(await contarImportadasNoMes(mes, r.cnes));
    } catch {
      toast.error("Não consegui ler o arquivo. Confirme que é um BPA Magnético (.MAR/.JUN/.txt).");
      setParsed(null);
    } finally {
      setProcessando(false);
    }
  };

  const aoMudarMes = async (mes: string) => {
    setMesProducao(mes);
    if (/^\d{6}$/.test(mes) && parsed) setJaImportadas(await contarImportadasNoMes(mes, parsed.cnes));
  };

  const salvar = async () => {
    if (!parsed || !compValida || totalFichas === 0) return;
    setSalvando(true);
    const res = await gravarMagnetico(parsed, mesProducao, nomesEstab);
    setSalvando(false);
    if (res.erro) { toast.error(`Falha ao gravar: ${res.erro}`); return; }
    toast.success(`${res.fichas} ficha(s) importada(s) em ${compLabel(mesProducao)}.`);
    setFeito({ fichas: res.fichas, bpaC: res.bpaC, bpaI: res.bpaI });
    setParsed(null);
    setFileName("");
  };

  const nomeCnes = (c: string) => nomesEstab[c] || c;

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
          <h1 className="flex items-center gap-2 text-base font-semibold"><Database className="size-4" /> Importar produção (BPA Magnético)</h1>
        </div>
      </header>

      <main className="mx-auto mt-5 max-w-3xl space-y-4 px-4">
        <p className="text-sm text-muted-foreground">
          Importe um arquivo de produção do BPA Magnético (<span className="font-mono">.MAR</span>, <span className="font-mono">.JUN</span>, <span className="font-mono">.txt</span>) — BPA-C e BPA-I.
          A produção entra na dashboard e no comparativo FPO. O arquivo <strong>não</strong> é armazenado; só os dados das fichas.
        </p>

        {feito && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="size-5 shrink-0" />
            <span>Importado: <strong>{feito.fichas}</strong> ficha(s) ({feito.bpaC} BPA-C · {feito.bpaI} BPA-I). <Link to="/" className="font-semibold underline">Ver na dashboard</Link></span>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <input ref={inputRef} type="file" accept=".mar,.jun,.txt,.abr,.mai,.jul,.ago,.set,.out,.nov,.dez,.jan,.fev" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) aoEscolher(f); e.target.value = ""; }} />
          <button onClick={() => inputRef.current?.click()} disabled={processando}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-sm text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-60">
            {processando ? <><Loader2 className="size-4 animate-spin" /> Lendo arquivo…</> : <><FileText className="size-5" /> {fileName || "Escolher o arquivo de produção"}</>}
          </button>
        </div>

        {parsed && (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            {/* Cabeçalho do arquivo */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-sm">
                <span className="text-xs font-medium text-muted-foreground">Órgão / origem (do arquivo)</span>
                <p className="font-semibold">{parsed.cabecalho?.orgaoOrigem || "—"} {parsed.cabecalho?.sigla && <span className="text-muted-foreground">({parsed.cabecalho.sigla})</span>}</p>
                {parsed.cabecalho?.versao && <p className="text-[11px] text-muted-foreground">Versão layout {parsed.cabecalho.versao} · destino {parsed.cabecalho.tipoDestino}</p>}
              </div>
              <label className="text-sm">
                <span className="text-xs font-medium text-muted-foreground">Mês de produção (apresentação)</span>
                <input type="month" value={compValida ? `${mesProducao.slice(0, 4)}-${mesProducao.slice(4, 6)}` : ""}
                  onChange={(e) => e.target.value && aoMudarMes(e.target.value.replace("-", ""))}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                <span className="text-[11px] text-muted-foreground">Mês em que a produção aparece na dashboard/FPO.</span>
              </label>
            </div>

            {/* Totais */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini titulo="Fichas" valor={int(totalFichas)} sub={`${parsed.fichasC.length} BPA-C · ${parsed.fichasI.length} BPA-I`} />
              <Mini titulo="Linhas" valor={int(parsed.totais.linhas02 + parsed.totais.linhas03)} sub={`${parsed.totais.linhas02} (02) · ${parsed.totais.linhas03} (03)`} />
              <Mini titulo="Quantidade total" valor={int(totalQtd)} sub="soma das quantidades" />
              <Mini titulo="Unidades" valor={int(parsed.cnes.length)} sub={parsed.competencias.map(compLabel).join(", ")} />
            </div>

            {/* Unidades */}
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Unidades no arquivo</p>
              <ul className="flex flex-wrap gap-2">
                {parsed.cnes.map((c) => (
                  <li key={c} className="rounded-lg border border-border bg-muted/40 px-2 py-1 text-xs">
                    <span className="font-medium">{nomeCnes(c)}</span> <span className="font-mono text-muted-foreground">{c}</span>
                  </li>
                ))}
              </ul>
            </div>

            {parsed.avisos.length > 0 && (
              <ul className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {parsed.avisos.map((a, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-px size-3 shrink-0" /> {a}</li>)}
              </ul>
            )}

            {jaImportadas > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                <span>Já existem <strong>{jaImportadas}</strong> ficha(s) importada(s) em {compLabel(mesProducao)} para estas unidades. Importar de novo pode <strong>duplicar</strong> a produção.</span>
              </div>
            )}

            <button onClick={salvar} disabled={!compValida || totalFichas === 0 || salvando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {salvando ? <><Loader2 className="size-4 animate-spin" /> Gravando…</> : <><Save className="size-4" /> Importar {int(totalFichas)} ficha(s) em {compLabel(mesProducao)}</>}
            </button>
            {!user && <p className="text-center text-[11px] text-rose-600">Você precisa estar logado para gravar.</p>}
          </div>
        )}
      </main>
    </div>
  );
}

function Mini({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{valor}</p>
      {sub && <p className="truncate text-[10px] text-muted-foreground" title={sub}>{sub}</p>}
    </div>
  );
}
