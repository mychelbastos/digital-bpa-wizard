// Diálogo "Criar conta" (3 passos). Mesma validação e mesmo criarConta de antes.
import { useEffect, useState, type ReactNode } from "react";
import { BadgeCheck, Eye, EyeOff, Loader2 } from "lucide-react";
import type { EstabelecimentoOrg, PermissaoCat } from "@/lib/admin";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ProfissionalPicker } from "./ProfissionalPicker";
import { cn } from "@/lib/utils";
import { nomeCargo, nomePerm } from "./constantes";
import { Campo, Pill, btnOutline, btnPrimario, inputCls } from "./ui";

function Passo({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground">
        <span
          aria-hidden="true"
          className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground"
        >
          {n}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

export function CriarContaDialog({
  aberto,
  onAberto,
  orgs,
  orgNome,
  cargos,
  cargoDefaults,
  perms,
  estabPorOrg,
  criando,
  onCriar,
}: {
  aberto: boolean;
  onAberto: (v: boolean) => void;
  orgs: { id: string; nome: string }[];
  orgNome: string;
  cargos: string[];
  cargoDefaults: Record<string, string[]>;
  perms: PermissaoCat[];
  estabPorOrg: Record<string, EstabelecimentoOrg[]>;
  criando: boolean;
  onCriar: (
    email: string,
    senha: string,
    cnes: string,
    papel: string,
    nome: string,
    cns: string,
  ) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [org, setOrg] = useState(orgs.length === 1 ? orgs[0].id : "");
  const [cnes, setCnes] = useState("");
  const [papel, setPapel] = useState("");
  const [nome, setNome] = useState("");
  const [cns, setCns] = useState("");
  const [confere, setConfere] = useState(false);

  const resetar = () => {
    setEmail("");
    setSenha("");
    setVerSenha(false);
    setCnes("");
    setPapel("");
    setNome("");
    setCns("");
    setConfere(false);
    setOrg(orgs.length === 1 ? orgs[0].id : "");
  };
  useEffect(() => {
    if (aberto) setOrg(orgs.length === 1 ? orgs[0].id : "");
  }, [aberto, orgs]);

  const estabs = estabPorOrg[org] ?? [];
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const cnsOk = /^[0-9]{15}$/.test(cns);
  const faltas = [
    !emailOk && "e-mail",
    senha.length < 8 && "senha (mín. 8)",
    !cnes && "unidade",
    !papel && "cargo",
    (!nome.trim() || !cnsOk) && "profissional (nome e CNS)",
  ].filter(Boolean) as string[];
  const valido = faltas.length === 0;
  const rotuloPerm = new Map(perms.map((p) => [p.codigo, nomePerm(p)]));
  const inclui = (cargoDefaults[papel] ?? []).map((c) => rotuloPerm.get(c) ?? c);

  const submeter = async () => {
    if (!valido) return;
    const ok = await onCriar(email.trim(), senha, cnes, papel, nome.trim(), cns);
    if (ok) {
      resetar();
      onAberto(false);
    }
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) resetar();
        onAberto(v);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-[680px] gap-0 overflow-y-auto rounded-2xl p-0">
        <div className="border-b border-border px-6 py-5">
          <DialogTitle className="text-xl font-bold">Criar conta</DialogTitle>
          <DialogDescription className="mt-1 text-[13.5px]">
            {orgNome} · a conta é ativada na hora, sem e-mail de confirmação.
          </DialogDescription>
        </div>
        <div className="space-y-7 px-6 py-6">
          <Passo n={1} titulo="Acesso">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="E-mail" htmlFor="cc-email">
                <input
                  id="cc-email"
                  type="email"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pessoa@exemplo.com"
                  autoComplete="off"
                  data-nocaps
                />
              </Campo>
              <Campo
                rotulo="Senha inicial"
                htmlFor="cc-senha"
                ajuda={
                  <span
                    className={cn(
                      senha.length > 0 && senha.length < 8 && "font-medium text-rose-600",
                    )}
                  >
                    {senha.length} caracteres · mínimo 8
                  </span>
                }
              >
                <div className="relative">
                  <input
                    id="cc-senha"
                    type={verSenha ? "text" : "password"}
                    className={cn(
                      inputCls,
                      "pr-11",
                      senha.length > 0 && senha.length < 8 && "border-rose-400",
                    )}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    autoComplete="new-password"
                    data-nocaps
                  />
                  <button
                    type="button"
                    onClick={() => setVerSenha((v) => !v)}
                    aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {verSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Campo>
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              Oriente a pessoa a trocar a senha no primeiro acesso (Perfil).
            </p>
          </Passo>

          <Passo n={2} titulo="Lotação">
            <div className="grid gap-4 sm:grid-cols-2">
              {orgs.length > 1 && (
                <Campo rotulo="Organização" htmlFor="cc-org" className="sm:col-span-2">
                  <select
                    id="cc-org"
                    className={inputCls}
                    value={org}
                    onChange={(e) => {
                      setOrg(e.target.value);
                      setCnes("");
                    }}
                  >
                    <option value="">Selecione…</option>
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}
              <Campo rotulo="Unidade de cadastro" htmlFor="cc-cnes">
                <select
                  id="cc-cnes"
                  className={inputCls}
                  value={cnes}
                  onChange={(e) => setCnes(e.target.value)}
                  disabled={!org}
                >
                  <option value="">Selecione…</option>
                  {estabs.map((e) => (
                    <option key={e.cnes} value={e.cnes}>
                      {e.cnes} — {e.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Cargo" htmlFor="cc-cargo">
                <select
                  id="cc-cargo"
                  className={inputCls}
                  value={papel}
                  onChange={(e) => setPapel(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {cargos.map((c) => (
                    <option key={c} value={c}>
                      {nomeCargo(c)}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            {papel && (
              <div className="rounded-xl border border-primary/20 bg-primary/[0.05] px-4 py-3">
                <div className="text-[13px] font-semibold text-foreground">
                  O cargo {nomeCargo(papel)} já inclui
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {inclui.length ? (
                    inclui.map((r) => (
                      <Pill key={r} tom="azul">
                        {r}
                      </Pill>
                    ))
                  ) : (
                    <span className="text-[12.5px] text-muted-foreground">
                      Nenhuma permissão no pacote.
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  Depois de criar, você pode vincular outras unidades e ajustar exceções no painel
                  do usuário.
                </p>
              </div>
            )}
          </Passo>

          <Passo n={3} titulo="Profissional no SCNES">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-foreground">
                  Buscar profissional
                </span>
                {confere && (
                  <Pill tom="verde">
                    <BadgeCheck className="size-3.5" /> Confere com SCNES
                  </Pill>
                )}
              </div>
              <ProfissionalPicker
                cnes={cnes}
                nome={nome}
                cns={cns}
                confere={confere}
                onChange={(nm, c, ok) => {
                  setNome(nm);
                  setCns(c);
                  setConfere(ok);
                }}
              />
              {!cnes && (
                <p className="text-[12.5px] text-muted-foreground">
                  Escolha a unidade de cadastro para buscar os profissionais dela.
                </p>
              )}
            </div>
          </Passo>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-6 py-4">
          <span
            className={cn(
              "text-[13px]",
              valido
                ? "font-semibold text-emerald-700 dark:text-emerald-300"
                : "text-muted-foreground",
            )}
          >
            {valido ? "Tudo pronto para criar" : `Falta: ${faltas.join(", ")}`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className={btnOutline}
              onClick={() => {
                resetar();
                onAberto(false);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={btnPrimario}
              onClick={submeter}
              disabled={!valido || criando}
            >
              {criando && <Loader2 className="size-4 animate-spin" />} Criar e vincular
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
