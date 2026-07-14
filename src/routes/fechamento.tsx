import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, CalendarCheck, Loader2, Lock, Snowflake, LockOpen } from "lucide-react";
import { fichasDoMes } from "@/lib/bpa-i-v2/fichas";
import { gerarArquivoMes, type FechamentoMes } from "@/lib/fechamento-mes";
import { loadConfig, sincronizarConfigDaOrg } from "@/lib/bpa-i-v2/config";
import { baixarTxt } from "@/lib/export-txt";
import { cnesComPermissao } from "@/lib/permissoes";
import { exportarProducao, reabrirProducao, listarProducoes, type Producao } from "@/lib/producoes";
import { ConfirmModal } from "@/components/bpa-i-v2/ConfirmModal";

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
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<FechamentoMes | null>(null);
  const [cnesPermitidos, setCnesPermitidos] = useState<string[] | null>(null);
  const [producoes, setProducoes] = useState<Producao[]>([]);
  const [confirmarFechar, setConfirmarFechar] = useState(false);
  const [fechando, setFechando] = useState(false);
  // Reabertura: id da produção em reabertura + motivo digitado.
  const [reabrindo, setReabrindo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [reabrindoBusy, setReabrindoBusy] = useState(false);

  const recarregarProducoes = useCallback(() => {
    listarProducoes().then(setProducoes);
  }, []);
  useEffect(() => {
    cnesComPermissao("gerar_producao").then(setCnesPermitidos);
    recarregarProducoes();
    // Espelha a config do cabeçalho da organização (fonte da verdade) para o gerador.
    sincronizarConfigDaOrg();
  }, [recarregarProducoes]);

  const podeGerar = cnesPermitidos !== null && cnesPermitidos.length > 0;
  const prodDoMes = producoes.find((p) => p.mes_producao === comp);

  const gerar = async () => {
    if (!/^[0-9]{6}$/.test(comp)) {
      toast.error("Informe o mês de produção no formato AAAAMM.");
      return;
    }
    if (!podeGerar) {
      toast.error("Você não tem permissão para fechar produção.");
      return;
    }
    setLoading(true);
    setRes(null);
    try {
      const fichas = await fichasDoMes(comp);
      const r = gerarArquivoMes(
        fichas,
        comp,
        comp.slice(0, 4).split(""),
        comp.slice(4, 6).split(""),
        loadConfig(),
      );
      setRes(r);
      if (!r.arquivo) toast.warning("Nenhuma produção encontrada para esse mês.");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao gerar o arquivo do mês. Veja o console.");
    } finally {
      setLoading(false);
    }
  };

  const baixar = () => {
    if (res?.arquivo) baixarTxt(res.arquivo.nome, res.arquivo.conteudo);
  };

  // Fecha a produção: congela as fichas do mês (RPC atômica) e baixa o .txt. Ação
  // controlada — pede confirmação (as fichas ficam imutáveis até reabrir).
  const fecharProducao = async () => {
    setConfirmarFechar(false);
    if (!res?.arquivo) return;
    setFechando(true);
    try {
      const r = await exportarProducao(comp, res.arquivo.nome);
      baixar();
      toast.success(
        `Produção de ${comp} fechada — ${r.fichas_congeladas} ficha(s) congelada(s). Arquivo baixado.`,
      );
      recarregarProducoes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao fechar a produção.";
      toast.error(msg);
    } finally {
      setFechando(false);
    }
  };

  const confirmarReabrir = async () => {
    if (!reabrindo) return;
    if (!motivo.trim()) {
      toast.error("Informe o motivo da reabertura.");
      return;
    }
    setReabrindoBusy(true);
    try {
      await reabrirProducao(reabrindo, motivo.trim());
      toast.success("Produção reaberta. As fichas do mês voltaram a ser editáveis.");
      setReabrindo(null);
      setMotivo("");
      recarregarProducoes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao reabrir.");
    } finally {
      setReabrindoBusy(false);
    }
  };

  const input =
    "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:border-primary focus:ring-2";

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <ConfirmModal
        open={confirmarFechar}
        title="Fechar produção do mês"
        confirmLabel="Fechar e congelar"
        onCancel={() => setConfirmarFechar(false)}
        onConfirm={fecharProducao}
      >
        <p>
          Isto vai <strong>congelar todas as fichas</strong> do mês de produção{" "}
          <strong>{comp}</strong>: elas ficam imutáveis (o banco recusa alterações) até que a
          produção seja reaberta.
        </p>
        <p className="mt-2">
          Correção depois do fechamento: reabrir a produção ou emitir uma retificação (nova versão).
        </p>
      </ConfirmModal>

      <header className="border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Início
          </Link>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <CalendarCheck className="size-4" /> Fechamento do mês
          </h1>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-[900px] px-4">
        <p className="text-sm text-muted-foreground">
          Gera <strong>um único arquivo magnético</strong> (.txt) com toda a produção do
          <strong> mês de produção</strong> — BPA-C (registro 02) e BPA-I (registro 03) juntos, das
          fichas criadas nesse mês. A produção pode conter fichas de competências diferentes
          (retroativas, até ~4 meses): a competência de cada linha vem do{" "}
          <strong>cabeçalho da ficha</strong> (a mesma que aparece no painel); o cabeçalho do
          arquivo leva o mês de produção. <strong>Fechar</strong> a produção congela as fichas do
          mês.
        </p>

        <div className="mt-5 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <label className="text-xs font-medium text-foreground sm:max-w-xs">
            Mês de produção (AAAAMM)
            <input
              value={comp}
              onChange={(e) => setComp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="202607"
              className={input}
            />
          </label>
          <div>
            {cnesPermitidos !== null && !podeGerar && (
              <p className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <Lock className="size-4 shrink-0" /> Você não tem permissão para fechar produção
                (gerar .txt) em nenhuma unidade. Fale com o gestor.
              </p>
            )}
            {prodDoMes && prodDoMes.status !== "aberta" && (
              <p className="mb-3 flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                <Snowflake className="size-4 shrink-0" /> A produção de {comp} já está{" "}
                <strong>{prodDoMes.status}</strong> — as fichas estão congeladas. Reabra abaixo para
                editar.
              </p>
            )}
            <button
              onClick={gerar}
              disabled={loading || !podeGerar}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Buscando…
                </>
              ) : (
                <>Gerar prévia do mês</>
              )}
            </button>
          </div>
        </div>

        {res && (
          <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Resumo do mês {comp}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Linhas (total)" value={res.resumo.totalLinhas} />
              <Stat label="Folhas" value={res.resumo.totalFolhas} />
              <Stat
                label="BPA-C (02)"
                value={`${res.resumo.linhasBpaC} · ${res.resumo.fichasBpaC} fichas`}
              />
              <Stat
                label="BPA-I (03)"
                value={`${res.resumo.linhasBpaI} · ${res.resumo.fichasBpaI} fichas`}
              />
            </div>
            {res.resumo.chavesDuplicadas > 0 && (
              <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                ⚠️ Consistência: {res.resumo.chavesDuplicadas} linha(s) com chave duplicada (CNES ·
                profissional/CBO · competência · folha · sequência). O DATASUS recusaria a
                importação — não feche esta produção e reporte.
              </p>
            )}
            {res.arquivo ? (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={baixar}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    <Download className="size-4" /> Baixar prévia ({res.arquivo.nome})
                  </button>
                  <button
                    onClick={() => setConfirmarFechar(true)}
                    disabled={
                      fechando ||
                      prodDoMes?.status === "transmitida" ||
                      res.resumo.chavesDuplicadas > 0
                    }
                    title={
                      res.resumo.chavesDuplicadas > 0
                        ? "Há chaves duplicadas — corrija antes de fechar"
                        : undefined
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {fechando ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Fechando…
                      </>
                    ) : (
                      <>
                        <Snowflake className="size-4" /> Fechar produção e baixar
                      </>
                    )}
                  </button>
                </div>
                <pre className="mt-4 max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-tight text-foreground">
                  {res.arquivo.conteudo.split("\r\n").slice(0, 8).join("\n")}
                  {res.arquivo.linhas > 7 ? "\n…" : ""}
                </pre>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Nenhuma produção encontrada para esse mês.
              </p>
            )}
          </div>
        )}

        {producoes.length > 0 && (
          <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Produções</h2>
            <ul className="mt-3 divide-y divide-border">
              {producoes.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{p.mes_producao}</span>
                    <StatusBadge status={p.status} />
                    {p.arquivo_nome && (
                      <span className="text-xs text-muted-foreground">{p.arquivo_nome}</span>
                    )}
                  </div>
                  {p.status === "exportada" &&
                    (reabrindo === p.id ? (
                      <span className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          placeholder="Motivo da reabertura"
                          className="rounded border border-border bg-background px-2 py-1 text-xs"
                        />
                        <button
                          onClick={confirmarReabrir}
                          disabled={reabrindoBusy}
                          className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                        >
                          {reabrindoBusy ? "…" : "Confirmar"}
                        </button>
                        <button
                          onClick={() => {
                            setReabrindo(null);
                            setMotivo("");
                          }}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setReabrindo(p.id);
                          setMotivo("");
                        }}
                        className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      >
                        <LockOpen className="size-3.5" /> Reabrir
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: Producao["status"] }) {
  const map: Record<Producao["status"], string> = {
    aberta: "border-slate-300 bg-slate-100 text-slate-700",
    exportada: "border-sky-300 bg-sky-50 text-sky-800",
    transmitida: "border-emerald-300 bg-emerald-50 text-emerald-800",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${map[status]}`}>
      {status}
    </span>
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
