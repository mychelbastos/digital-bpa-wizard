import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardCheck, CheckCircle2, AlertTriangle, ExternalLink, Loader2, Play, ShieldAlert, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { souSuperAdmin } from "@/lib/permissoes";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/checklist")({
  head: () => ({ meta: [{ title: "Checklist mensal — SPA Digital" }] }),
  component: Checklist,
});

interface ItemChecklist {
  item: string;
  status: "ok" | "atencao" | "manual" | "nao_verificado";
  atual: string | null;
  nosso: string | null;
  pagina?: string;
  detalhe: string;
}

const VISUAL: Record<string, { cor: string; icone: React.ReactNode; rotulo: string }> = {
  ok: { cor: "border-emerald-200 bg-emerald-50", icone: <CheckCircle2 className="size-5 text-emerald-600" />, rotulo: "Em dia" },
  atencao: { cor: "border-amber-300 bg-amber-50", icone: <AlertTriangle className="size-5 text-amber-600" />, rotulo: "Atenção" },
  manual: { cor: "border-sky-200 bg-sky-50", icone: <ExternalLink className="size-5 text-sky-600" />, rotulo: "Conferir no link" },
  nao_verificado: { cor: "border-slate-200 bg-slate-50", icone: <HelpCircle className="size-5 text-slate-500" />, rotulo: "Não verificado" },
};

function Checklist() {
  const [master, setMaster] = useState<boolean | null>(null);
  const [rodando, setRodando] = useState(false);
  const [itens, setItens] = useState<ItemChecklist[] | null>(null);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);

  useEffect(() => { souSuperAdmin().then(setMaster); }, []);

  const rodar = async () => {
    if (rodando || !supabase) return;
    setRodando(true);
    try {
      const { data, error } = await supabase.functions.invoke("checklist-mensal", { body: {} });
      if (error) throw error;
      const d = data as { geradoEm: string; itens: ItemChecklist[] };
      setItens(d.itens);
      setGeradoEm(d.geradoEm);
      const alertas = d.itens.filter((i) => i.status === "atencao").length;
      if (alertas) toast.warning(`Checklist concluído com ${alertas} ponto(s) de atenção.`);
      else toast.success("Checklist concluído.");
    } catch (e) {
      console.error("checklist falhou", e);
      toast.error("Falha ao rodar o checklist. Veja o console.");
    } finally {
      setRodando(false);
    }
  };

  if (master === null) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" /> Verificando acesso…</div>;
  }
  if (!master) {
    return (
      <div className="mx-auto mt-16 max-w-md px-4 text-center">
        <ShieldAlert className="mx-auto size-10 text-amber-500" />
        <h1 className="mt-3 text-lg font-bold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">Esta página é exclusiva da conta master (super-admin) do SPA.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <main className="mx-auto mt-5 max-w-[900px] px-4">
        <PageHeader icon={ClipboardCheck} titulo="Checklist mensal"
          descricao="Rode uma vez por mês para manter o SPA atualizado com o DATASUS/SIA."
          right={
            <button onClick={rodar} disabled={rodando}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {rodando ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} {rodando ? "Rodando…" : "Rodar checklist"}
            </button>
          } />

        <div className="mt-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Ao rodar, o sistema: <strong className="text-foreground">(1)</strong> verifica se há competência nova do SIGTAP (e importa pelo cron dia 20);
          <strong className="text-foreground"> (2)</strong> mostra as versões de BPA/FPO/RAAS/APAC para você conferir no DATASUS;
          <strong className="text-foreground"> (3)</strong> atualiza a base de profissionais do SCNES (homologação);
          <strong className="text-foreground"> (4)</strong> sinaliza possível conflito dessas versões com os arquivos que exportamos.
        </div>

        {geradoEm && <p className="mt-4 text-xs text-muted-foreground">Última execução: {new Date(geradoEm).toLocaleString("pt-BR")}</p>}

        {itens && (
          <div className="mt-2 space-y-2.5">
            {itens.map((i, idx) => {
              const v = VISUAL[i.status] ?? VISUAL.nao_verificado;
              return (
                <div key={idx} className={`flex items-start gap-3 rounded-xl border p-4 ${v.cor}`}>
                  <div className="mt-0.5 shrink-0">{v.icone}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{i.item}</span>
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/70">{v.rotulo}</span>
                      {i.atual && <span className="text-xs text-muted-foreground">atual: <strong className="text-foreground">{i.atual}</strong></span>}
                      {i.nosso && <span className="text-xs text-muted-foreground">· nosso: <strong className="text-foreground">{i.nosso}</strong></span>}
                    </div>
                    <p className="mt-1 text-sm text-foreground/80">{i.detalhe}</p>
                  </div>
                  {i.pagina && (
                    <a href={i.pagina} target="_blank" rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                      <ExternalLink className="size-3.5" /> abrir
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!itens && !rodando && (
          <p className="mt-6 text-center text-sm text-muted-foreground">Clique em <strong>Rodar checklist</strong> para começar.</p>
        )}
      </main>
    </div>
  );
}
