// Aba Relatórios e gestão: identidade dos PDFs (logo + cor, com prévia) e mandato vigente.
import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { OrganizacaoAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { Campo, Card, Pill, btnOutline, btnPrimario, inputCls } from "./ui";

type SetOrg = <K extends keyof OrganizacaoAdmin>(k: K, v: OrganizacaoAdmin[K]) => void;
export type GestaoForm = { id: string | null; nome: string; inicio: string; fim: string };

const COR_PADRAO = "#107A57";
const AMOSTRAS = [
  { cor: "#107A57", nome: "Verde (padrão)" },
  { cor: "#2563D9", nome: "Azul" },
  { cor: "#1E3A8A", nome: "Azul-marinho" },
  { cor: "#7A2E8E", nome: "Roxo" },
  { cor: "#B42318", nome: "Vermelho" },
  { cor: "#B45309", nome: "Âmbar" },
];
const MAX_LOGO = 1_500_000;
const mesAno = () =>
  new Date()
    .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
    .replace(".", "")
    .replace(" de ", "/")
    .toUpperCase();

export function RelatoriosGestaoAba({
  org,
  o,
  set,
  salvandoOrg,
  salvandoGestao,
  onSalvarIdentidade,
  onSalvarGestao,
}: {
  org: OrganizacaoAdmin;
  o: OrganizacaoAdmin;
  set: SetOrg;
  salvandoOrg: boolean;
  salvandoGestao: boolean;
  onSalvarIdentidade: () => void;
  onSalvarGestao: (g: GestaoForm) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [g, setG] = useState<GestaoForm>({
    id: org.gestao_id,
    nome: org.gestao_nome ?? "",
    inicio: org.gestao_inicio ?? "",
    fim: org.gestao_fim ?? "",
  });
  // Recarregou do banco (ex.: depois de salvar) → reflete a gestão vigente.
  useEffect(() => {
    setG({
      id: org.gestao_id,
      nome: org.gestao_nome ?? "",
      inicio: org.gestao_inicio ?? "",
      fim: org.gestao_fim ?? "",
    });
  }, [org.gestao_id, org.gestao_nome, org.gestao_inicio, org.gestao_fim]);

  const cor = (o.cor_relatorio ?? COR_PADRAO).toUpperCase();
  const lerArquivo = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg)$/.test(f.type)) {
      toast.error("Use uma imagem PNG ou JPG.");
      return;
    }
    if (f.size > MAX_LOGO) {
      toast.error("Imagem muito grande (máx. 1,5 MB). Reduza o arquivo.");
      return;
    }
    const r = new FileReader();
    r.onload = () => set("logo_relatorio", typeof r.result === "string" ? r.result : null);
    r.readAsDataURL(f);
  };

  return (
    <div className="space-y-5">
      <Card
        titulo="Identidade dos relatórios"
        subtitulo="Timbre e cor usados nos PDFs de Produção e FPO. Cada gestão pode adotar a sua."
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <div className="space-y-2">
              <span className="text-[13px] font-semibold text-foreground">Logo / timbre</span>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastando(false);
                  lerArquivo(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-5 py-6 text-center transition-colors",
                  arrastando ? "border-primary bg-primary/5" : "border-border bg-muted/20",
                )}
              >
                {o.logo_relatorio ? (
                  <img
                    src={o.logo_relatorio}
                    alt="Logo atual dos relatórios"
                    className="max-h-20 w-auto rounded-md border border-border bg-white object-contain px-2 py-1"
                  />
                ) : (
                  <ImagePlus className="size-8 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => fileRef.current?.click()}
                  >
                    {o.logo_relatorio ? "Trocar" : "Enviar imagem"}
                  </button>
                  {o.logo_relatorio && (
                    <button
                      type="button"
                      className={btnOutline}
                      onClick={() => set("logo_relatorio", null)}
                    >
                      Remover
                    </button>
                  )}
                </div>
                <p className="text-[12.5px] text-muted-foreground">
                  ou arraste aqui · PNG ou JPG · horizontal ~3:1 (ex.: 1400×436) · até 1,5 MB
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  aria-label="Escolher imagem do timbre"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    lerArquivo(f);
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <span id="cor-rotulo" className="text-[13px] font-semibold text-foreground">
                Cor de destaque
              </span>
              <div
                role="radiogroup"
                aria-labelledby="cor-rotulo"
                className="flex flex-wrap items-center gap-2.5"
              >
                {AMOSTRAS.map((a) => {
                  const ativa = cor === a.cor;
                  return (
                    <button
                      key={a.cor}
                      type="button"
                      role="radio"
                      aria-checked={ativa}
                      aria-label={a.nome}
                      title={a.nome}
                      onClick={() => set("cor_relatorio", a.cor === COR_PADRAO ? null : a.cor)}
                      style={{ background: a.cor }}
                      className={cn(
                        "inline-flex size-10 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-card transition",
                        ativa ? "ring-2 ring-foreground" : "hover:scale-105",
                      )}
                    >
                      {ativa && <Check className="size-4" />}
                    </button>
                  );
                })}
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-border px-3 text-[13px] font-semibold hover:bg-muted">
                  <input
                    type="color"
                    value={cor}
                    onChange={(e) => set("cor_relatorio", e.target.value.toUpperCase())}
                    data-nocaps
                    className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                    aria-label="Cor personalizada"
                  />
                  Personalizada
                </label>
                <span className="font-mono text-[13px] text-muted-foreground">
                  {cor}
                  {o.cor_relatorio ? "" : " · padrão"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[13px] font-semibold text-foreground">Prévia do PDF</span>
            <div
              aria-hidden="true"
              className="rounded-xl border border-border bg-white p-4 text-[10px] text-slate-700 shadow-sm"
            >
              <div className="flex h-12 items-center justify-center rounded border border-dashed border-slate-200">
                {o.logo_relatorio ? (
                  <img src={o.logo_relatorio} alt="" className="max-h-11 w-auto object-contain" />
                ) : (
                  <span className="text-slate-400">[timbre da prefeitura]</span>
                )}
              </div>
              <div
                className="mt-3 rounded px-2 py-1.5 font-bold tracking-wide text-white"
                style={{ background: cor }}
              >
                PRODUÇÃO AMBULATORIAL · {mesAno()}
              </div>
              <div className="mt-2 space-y-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-2 rounded bg-slate-100"
                    style={{ width: `${92 - i * 9}%` }}
                  />
                ))}
              </div>
              <div
                className="mt-3 flex justify-between border-t-2 pt-1.5 font-bold"
                style={{ borderColor: cor, color: cor }}
              >
                <span>TOTAL</span>
                <span>0.000</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            className={btnOutline}
            disabled={!o.cor_relatorio}
            onClick={() => set("cor_relatorio", null)}
          >
            Usar padrão do sistema
          </button>
          <button
            type="button"
            className={btnPrimario}
            onClick={onSalvarIdentidade}
            disabled={salvandoOrg}
          >
            {salvandoOrg && <Loader2 className="size-4 animate-spin" />} Salvar identidade
          </button>
        </div>
      </Card>

      <Card
        titulo="Gestão (mandato)"
        subtitulo="Período da administração municipal."
        acoes={
          g.id ? (
            <button
              type="button"
              className={btnOutline}
              onClick={() => setG({ id: null, nome: "", inicio: "", fim: "" })}
            >
              <Plus className="size-4" /> Nova gestão
            </button>
          ) : undefined
        }
      >
        <div
          className={cn(
            "rounded-2xl border p-4",
            g.id ? "border-primary/30 bg-primary/[0.04]" : "border-border",
          )}
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[15px] font-semibold text-foreground">
              {g.id ? (org.gestao_nome ?? "Gestão") : "Nova gestão"}
            </span>
            {g.id && (
              <Pill tom="azul" className="uppercase">
                Vigente
              </Pill>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Nome" htmlFor="gestao-nome">
              <input
                id="gestao-nome"
                className={inputCls}
                value={g.nome}
                placeholder="Ex.: 2025–2028"
                onChange={(e) => setG((p) => ({ ...p, nome: e.target.value }))}
              />
            </Campo>
            <Campo rotulo="Início" htmlFor="gestao-inicio">
              <input
                id="gestao-inicio"
                type="date"
                className={inputCls}
                value={g.inicio}
                onChange={(e) => setG((p) => ({ ...p, inicio: e.target.value }))}
              />
            </Campo>
            <Campo
              rotulo={
                <>
                  Fim <span className="font-normal text-muted-foreground">(opcional)</span>
                </>
              }
              htmlFor="gestao-fim"
            >
              <input
                id="gestao-fim"
                type="date"
                className={inputCls}
                value={g.fim}
                onChange={(e) => setG((p) => ({ ...p, fim: e.target.value }))}
              />
            </Campo>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className={btnPrimario}
              disabled={salvandoGestao || !g.nome || !g.inicio}
              onClick={() => onSalvarGestao(g)}
            >
              {salvandoGestao && <Loader2 className="size-4 animate-spin" />}{" "}
              {g.id ? "Salvar gestão" : "Criar gestão"}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
