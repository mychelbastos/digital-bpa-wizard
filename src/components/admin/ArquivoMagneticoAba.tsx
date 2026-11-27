// Aba Arquivo magnético: dados da organização + cabeçalho do registro 01 + prévia ao vivo.
import { AlertTriangle } from "lucide-react";
import type { OrganizacaoAdmin } from "@/lib/admin";
import { HISTORICO_REFERENCIA, LAYOUT_REFERENCIA, layoutEmDia } from "@/lib/datasus-ref";
import { cn } from "@/lib/utils";
import { Campo, Card, inputCls } from "./ui";

type SetOrg = <K extends keyof OrganizacaoAdmin>(k: K, v: OrganizacaoAdmin[K]) => void;

const contador = (n: number, max: number) => (
  <span
    className={cn("text-[12px] tabular-nums", n > max ? "text-rose-600" : "text-muted-foreground")}
  >
    {n}/{max}
  </span>
);
const previa = (v: string | null | undefined, n: number) =>
  (v ?? "").toUpperCase().slice(0, n).padEnd(n, "·");

export function ArquivoMagneticoAba({ o, set }: { o: OrganizacaoAdmin; set: SetOrg }) {
  const emDia = layoutEmDia(o.cab_versao);
  const campos = [
    { k: "Órgão de origem", v: previa(o.cab_orgao_origem, 30) },
    { k: "Sigla", v: previa(o.cab_sigla, 6) },
    { k: "CNPJ / CPF", v: previa(o.cab_cgc_cpf, 14) },
    { k: "Órgão de destino", v: previa(o.cab_orgao_destino, 40) },
    { k: "Tipo (M/E)", v: previa(o.cab_destino_tipo, 1) },
    { k: "Versão", v: previa(o.cab_versao, 6) },
  ];
  return (
    <div className="space-y-5">
      <div
        role="note"
        className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div className="text-[14px] leading-relaxed">
          <strong>Confira antes de cada remessa.</strong> O layout do DATASUS muda quase todo mês.
          Órgão de destino e versão precisam bater com o que é aceito{" "}
          <strong>na competência de apresentação</strong>. Referência atual:{" "}
          {LAYOUT_REFERENCIA.competencia} = {LAYOUT_REFERENCIA.destino} ·{" "}
          <span className="font-mono">{LAYOUT_REFERENCIA.versao}</span>.
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card titulo="Dados da organização" subtitulo="Identificação usada em todo o sistema.">
            <div className="grid gap-4 sm:grid-cols-4">
              <Campo rotulo="Nome da organização" htmlFor="org-nome" className="sm:col-span-2">
                <input
                  id="org-nome"
                  className={inputCls}
                  value={o.nome}
                  onChange={(e) => set("nome", e.target.value)}
                />
              </Campo>
              <Campo rotulo="Município (IBGE)" htmlFor="org-ibge">
                <input
                  id="org-ibge"
                  className={`${inputCls} font-mono`}
                  inputMode="numeric"
                  maxLength={7}
                  value={o.municipio_ibge ?? ""}
                  onChange={(e) => set("municipio_ibge", e.target.value.replace(/\D/g, ""))}
                />
              </Campo>
              <Campo rotulo="UF" htmlFor="org-uf">
                <input
                  id="org-uf"
                  className={inputCls}
                  maxLength={2}
                  value={o.uf ?? ""}
                  onChange={(e) => set("uf", e.target.value.toUpperCase())}
                />
              </Campo>
            </div>
          </Card>

          <Card
            titulo="Origem · quem envia"
            subtitulo="Cabeçalho do arquivo magnético (registro 01). Muda raramente."
          >
            <div className="grid gap-4 sm:grid-cols-4">
              <Campo
                rotulo="Órgão de origem"
                htmlFor="cab-origem"
                className="sm:col-span-4"
                extra={contador((o.cab_orgao_origem ?? "").length, 30)}
              >
                <input
                  id="cab-origem"
                  className={inputCls}
                  maxLength={30}
                  value={o.cab_orgao_origem ?? ""}
                  onChange={(e) => set("cab_orgao_origem", e.target.value)}
                  placeholder="Ex.: SECRETARIA MUNICIPAL DE SAUDE"
                />
              </Campo>
              <Campo rotulo="Sigla" htmlFor="cab-sigla" ajuda="máx. 6" className="sm:col-span-1">
                <input
                  id="cab-sigla"
                  className={inputCls}
                  maxLength={6}
                  value={o.cab_sigla ?? ""}
                  onChange={(e) => set("cab_sigla", e.target.value)}
                />
              </Campo>
              <Campo
                rotulo="CNPJ / CPF"
                htmlFor="cab-cnpj"
                ajuda="14 dígitos"
                className="sm:col-span-3"
              >
                <input
                  id="cab-cnpj"
                  className={`${inputCls} font-mono`}
                  inputMode="numeric"
                  maxLength={14}
                  value={o.cab_cgc_cpf ?? ""}
                  onChange={(e) => set("cab_cgc_cpf", e.target.value.replace(/\D/g, ""))}
                />
              </Campo>
            </div>
          </Card>

          <Card
            titulo="Destino · confira todo mês"
            subtitulo="Esses campos mudam com o layout do DATASUS."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                rotulo="Órgão de destino"
                htmlFor="cab-destino"
                className="sm:col-span-2"
                extra={contador((o.cab_orgao_destino ?? "").length, 40)}
              >
                <input
                  id="cab-destino"
                  className={inputCls}
                  maxLength={40}
                  value={o.cab_orgao_destino ?? ""}
                  onChange={(e) => set("cab_orgao_destino", e.target.value)}
                />
              </Campo>
              <Campo
                rotulo="Versão do layout"
                htmlFor="cab-versao"
                ajuda={
                  emDia ? (
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">
                      Igual à referência mais recente
                    </span>
                  ) : (
                    <span className="font-medium text-amber-800 dark:text-amber-200">
                      Diferente da referência ({LAYOUT_REFERENCIA.versao})
                    </span>
                  )
                }
              >
                <input
                  id="cab-versao"
                  className={`${inputCls} font-mono`}
                  maxLength={6}
                  value={o.cab_versao}
                  onChange={(e) => set("cab_versao", e.target.value.toUpperCase())}
                />
              </Campo>
              <div className="flex flex-col gap-1.5">
                <span id="cab-tipo-rotulo" className="text-[13px] font-semibold text-foreground">
                  Tipo de órgão
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="cab-tipo-rotulo"
                  className="flex rounded-[10px] bg-muted p-1"
                >
                  {[
                    { v: "M", r: "M · Municipal" },
                    { v: "E", r: "E · Estadual" },
                  ].map((t) => (
                    <button
                      key={t.v}
                      type="button"
                      role="radio"
                      aria-checked={o.cab_destino_tipo === t.v}
                      onClick={() => set("cab_destino_tipo", t.v)}
                      className={cn(
                        "min-h-9 flex-1 rounded-lg text-[13.5px] font-semibold",
                        o.cab_destino_tipo === t.v
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.r}
                    </button>
                  ))}
                </div>
                <p className="text-[12.5px] leading-snug text-muted-foreground">
                  Use “M” mesmo com destino federal — é o valor que o DATASUS aceita. Não troque sem
                  novo arquivo de referência.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-4">
          <section className="rounded-2xl bg-sidebar p-5 text-sidebar-foreground shadow-sm">
            <h2 className="text-base font-semibold">Como sai no arquivo</h2>
            <p className="mt-0.5 text-[12.5px] opacity-75">
              Prévia do registro 01 com os valores atuais
            </p>
            <dl className="mt-4 space-y-3">
              {campos.map((c) => (
                <div key={c.k}>
                  <dt className="text-[12px] font-semibold opacity-75">{c.k}</dt>
                  <dd className="mt-0.5 break-all font-mono text-[13px] tracking-tight">{c.v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <Card titulo="Histórico de referência">
            <ul className="space-y-2.5">
              {HISTORICO_REFERENCIA.map((h) => (
                <li
                  key={h.competencia}
                  className="flex items-baseline justify-between gap-3 text-[13.5px]"
                >
                  <span className="font-semibold text-foreground">{h.competencia}</span>
                  <span className="text-right text-muted-foreground">
                    {h.destino} · <span className="font-mono">{h.versao}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
