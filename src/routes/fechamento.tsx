import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Download, CalendarCheck, Loader2 } from "lucide-react";
import { fichasDoMes } from "@/lib/bpa-i-v2/fichas";
import { gerarArquivoMes, type FechamentoMes } from "@/lib/fechamento-mes";
import { loadConfig } from "@/lib/bpa-i-v2/config";
import { baixarTxt } from "@/lib/export-txt";

export const Route = createFileRoute("/fechamento")({
  head: () => ({ meta: [{ title: "Fechamento do mês — arquivo magnético BPA" }] }),
  component: Fechamento,
});

const compAtual = () => {
  const h = new Date();
  return `${h.getFullYear()}${String(h.getMonth() + 1).padStart(2, "0")}`;
};

function Fechamento() {
  const [comp, setComp] = useState(compAtual());
  const [cnes, setCnes] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<FechamentoMes | null>(null);

  const gerar = async () => {
    if (!/^[0-9]{6}$/.test(comp)) {
      toast.error("Informe a competência de apresentação no formato AAAAMM.");
      return;
    }
    setLoading(true);
    setRes(null);
    try {
      const fichas = await fichasDoMes(comp, cnes.trim() || undefined);
      const r = gerarArquivoMes(fichas, comp, comp.slice(0, 4).split(""), comp.slice(4, 6).split(""), loadConfig());
      setRes(r);
      if (!r.arquivo) toast.warning("Nenhuma produção encontrada para esse mês/CNES.");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao gerar o arquivo do mês. Veja o console.");
    } finally {
      setLoading(false);
    }
  };

  const baixar = () => { if (res?.arquivo) baixarTxt(res.arquivo.nome, res.arquivo.conteudo); };

  const input = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:border-primary focus:ring-2";

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
          <h1 className="flex items-center gap-2 text-base font-semibold"><CalendarCheck className="size-4" /> Fechamento do mês</h1>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-[900px] px-4">
        <p className="text-sm text-muted-foreground">
          Gera <strong>um único arquivo magnético</strong> (.txt) com toda a produção do mês de
          <strong> apresentação</strong> — BPA-C (registro 02) e BPA-I (registro 03) juntos, das fichas salvas.
          A competência de cada atendimento BPA-I vem da data do atendimento (produção retroativa é aceita).
        </p>

        <div className="mt-5 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
          <label className="text-xs font-medium text-foreground">
            Competência de apresentação (AAAAMM)
            <input value={comp} onChange={(e) => setComp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="202607" className={input} />
          </label>
          <label className="text-xs font-medium text-foreground">
            CNES do estabelecimento <span className="text-muted-foreground">(opcional — vazio = todos)</span>
            <input value={cnes} onChange={(e) => setCnes(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="0000000" className={input} />
          </label>
          <div className="sm:col-span-2">
            <button onClick={gerar} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {loading ? <><Loader2 className="size-4 animate-spin" /> Buscando…</> : <>Gerar arquivo do mês</>}
            </button>
          </div>
        </div>

        {res && (
          <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Resumo do mês {comp}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Linhas (total)" value={res.resumo.totalLinhas} />
              <Stat label="Folhas" value={res.resumo.totalFolhas} />
              <Stat label="BPA-C (02)" value={`${res.resumo.linhasBpaC} · ${res.resumo.fichasBpaC} fichas`} />
              <Stat label="BPA-I (03)" value={`${res.resumo.linhasBpaI} · ${res.resumo.fichasBpaI} fichas`} />
            </div>
            {res.arquivo ? (
              <>
                <button onClick={baixar} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
                  <Download className="size-4" /> Baixar {res.arquivo.nome}
                </button>
                <pre className="mt-4 max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-tight text-foreground">
                  {res.arquivo.conteudo.split("\r\n").slice(0, 8).join("\n")}
                  {res.arquivo.linhas > 7 ? "\n…" : ""}
                </pre>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Nenhuma produção encontrada para esse mês/CNES.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
