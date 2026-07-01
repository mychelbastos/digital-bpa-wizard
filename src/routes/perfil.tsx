import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  User, IdCard, Phone, Stethoscope, Building2, Lock, Settings2,
  LogOut, ArrowLeft, Check, Loader2, AlertCircle, ShieldCheck, Mail, CalendarDays,
} from "lucide-react";
import { signOut } from "@/lib/bpa-i-v2/auth";
import {
  carregarPerfil, salvarPerfil, trocarSenha,
  perfilVazio, type PerfilDados, type ContaInfo,
} from "@/lib/bpa-i-v2/perfil";
import { validarCns, cnsCompleto } from "@/lib/bpa-i-v2/validacao";

export const Route = createFileRoute("/perfil")({
  head: () => ({ meta: [{ title: "Meu perfil — BPA Digital" }] }),
  component: Perfil,
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({ icon, label, children, hint }: { icon?: React.ReactNode; label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
        {icon}
        {label}
        {hint}
      </span>
      {children}
    </label>
  );
}

function Card({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

type Status = { tipo: "idle" | "loading" | "ok" | "erro"; msg?: string };

function StatusMsg({ s }: { s: Status }) {
  if (s.tipo === "ok") return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="size-3.5" /> {s.msg ?? "Salvo"}</span>;
  if (s.tipo === "erro") return <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><AlertCircle className="size-3.5" /> {s.msg ?? "Erro"}</span>;
  return null;
}

function Perfil() {
  const [perfil, setPerfil] = useState<PerfilDados>(perfilVazio);
  const [conta, setConta] = useState<ContaInfo>({ email: null, criadoEm: null, id: null });
  const [carregando, setCarregando] = useState(true);

  const [statusPerfil, setStatusPerfil] = useState<Status>({ tipo: "idle" });
  const [statusSenha, setStatusSenha] = useState<Status>({ tipo: "idle" });
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");

  useEffect(() => {
    carregarPerfil().then(({ perfil, conta }) => {
      setPerfil(perfil);
      setConta(conta);
      setCarregando(false);
    });
  }, []);

  const set = <K extends keyof PerfilDados>(k: K, v: PerfilDados[K]) => setPerfil((p) => ({ ...p, [k]: v }));
  const setCfg = <K extends keyof PerfilDados["config"]>(k: K, v: PerfilDados["config"][K]) =>
    setPerfil((p) => ({ ...p, config: { ...p.config, [k]: v } }));

  const salvar = async () => {
    setStatusPerfil({ tipo: "loading" });
    const r = await salvarPerfil(perfil);
    setStatusPerfil(r.ok ? { tipo: "ok" } : { tipo: "erro", msg: r.erro });
    if (r.ok) setTimeout(() => setStatusPerfil({ tipo: "idle" }), 2500);
  };

  const salvarSenha = async () => {
    if (novaSenha.length < 6) return setStatusSenha({ tipo: "erro", msg: "Mínimo 6 caracteres" });
    if (novaSenha !== confirmaSenha) return setStatusSenha({ tipo: "erro", msg: "As senhas não conferem" });
    setStatusSenha({ tipo: "loading" });
    const r = await trocarSenha(novaSenha);
    if (r.ok) { setNovaSenha(""); setConfirmaSenha(""); setStatusSenha({ tipo: "ok", msg: "Senha alterada" }); setTimeout(() => setStatusSenha({ tipo: "idle" }), 2500); }
    else setStatusSenha({ tipo: "erro", msg: r.erro });
  };

  // Badge de validação do CNS ao vivo.
  const cnsBadge = () => {
    if (!cnsCompleto(perfil.cns)) return null;
    return validarCns(perfil.cns)
      ? <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200"><ShieldCheck className="size-3" /> válido</span>
      : <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-200"><AlertCircle className="size-3" /> inválido</span>;
  };

  const iniciais = (perfil.nome || conta.email || "?").trim().slice(0, 2).toUpperCase();
  const mesInput = perfil.competenciaPadrao.length === 6 ? `${perfil.competenciaPadrao.slice(0, 4)}-${perfil.competenciaPadrao.slice(4, 6)}` : "";

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Topo */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Início
          </Link>
          <button onClick={() => signOut()} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <LogOut className="size-3.5" /> Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Cabeçalho do perfil */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground shadow-sm">
            {iniciais}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{perfil.nome || "Meu perfil"}</h1>
            <p className="text-sm text-muted-foreground">{conta.email}</p>
          </div>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando perfil...
          </div>
        ) : (
          <div className="space-y-5">
            {/* Dados pessoais */}
            <Card icon={<User className="size-5" />} title="Dados pessoais" desc="Usados na confirmação eletrônica do Responsável.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field icon={<User className="size-3.5 text-muted-foreground" />} label="Nome completo">
                    <input className={inputCls} value={perfil.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Seu nome" />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field icon={<IdCard className="size-3.5 text-muted-foreground" />} label="CNS (Cartão Nacional de Saúde)" hint={cnsBadge()}>
                    <input className={inputCls} inputMode="numeric" maxLength={15} value={perfil.cns}
                      onChange={(e) => set("cns", e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="15 dígitos" />
                  </Field>
                </div>
                <Field icon={<Stethoscope className="size-3.5 text-muted-foreground" />} label="CBO (opcional)">
                  <input className={inputCls} inputMode="numeric" maxLength={6} value={perfil.cbo}
                    onChange={(e) => set("cbo", e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Ex.: 225125" />
                </Field>
                <Field icon={<Phone className="size-3.5 text-muted-foreground" />} label="Telefone (opcional)">
                  <input className={inputCls} value={perfil.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(00) 00000-0000" />
                </Field>
              </div>
            </Card>

            {/* Estabelecimento / arquivo magnético */}
            <Card icon={<Building2 className="size-5" />} title="Configuração do estabelecimento" desc="Cabeçalho do arquivo magnético (BPA). Sincronizado na sua conta.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Órgão de origem (nome)">
                    <input className={inputCls} maxLength={30} value={perfil.config.orgaoOrigemNome} onChange={(e) => setCfg("orgaoOrigemNome", e.target.value)} placeholder="Ex.: SEC MUN SAUDE DE ..." />
                  </Field>
                </div>
                <Field label="Sigla">
                  <input className={inputCls} maxLength={6} value={perfil.config.sigla} onChange={(e) => setCfg("sigla", e.target.value)} placeholder="SMS" />
                </Field>
                <Field label="CNPJ/CPF (só números)">
                  <input className={inputCls} inputMode="numeric" maxLength={14} value={perfil.config.cgcCpf} onChange={(e) => setCfg("cgcCpf", e.target.value.replace(/\D/g, ""))} placeholder="14 dígitos" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Órgão de destino (nome)">
                    <input className={inputCls} maxLength={40} value={perfil.config.orgaoDestinoNome} onChange={(e) => setCfg("orgaoDestinoNome", e.target.value)} placeholder="Ex.: SES / SMS destino" />
                  </Field>
                </div>
                <Field label="Tipo do órgão de destino">
                  <select className={inputCls} value={perfil.config.destinoTipo} onChange={(e) => setCfg("destinoTipo", e.target.value as "M" | "E")}>
                    <option value="M">Municipal (M)</option>
                    <option value="E">Estadual (E)</option>
                  </select>
                </Field>
              </div>
            </Card>

            {/* Preferências */}
            <Card icon={<Settings2 className="size-5" />} title="Preferências" desc="Padrões do app e informações da conta.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field icon={<CalendarDays className="size-3.5 text-muted-foreground" />} label="Competência padrão (opcional)">
                  <input type="month" className={inputCls} value={mesInput}
                    onChange={(e) => set("competenciaPadrao", e.target.value ? e.target.value.replace("-", "") : "")} />
                </Field>
                <Field icon={<Mail className="size-3.5 text-muted-foreground" />} label="E-mail da conta">
                  <input className={`${inputCls} opacity-70`} value={conta.email ?? ""} disabled />
                </Field>
              </div>
              {conta.criadoEm && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Conta criada em {new Date(conta.criadoEm).toLocaleDateString("pt-BR")} · ID <span className="font-mono">{conta.id?.slice(0, 8)}…</span>
                </p>
              )}
            </Card>

            {/* Botão salvar (perfil + estabelecimento + preferências) */}
            <div className="flex items-center justify-end gap-3">
              <StatusMsg s={statusPerfil} />
              <button onClick={salvar} disabled={statusPerfil.tipo === "loading"}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60">
                {statusPerfil.tipo === "loading" ? <><Loader2 className="size-4 animate-spin" /> Salvando...</> : <><Check className="size-4" /> Salvar alterações</>}
              </button>
            </div>

            {/* Segurança */}
            <Card icon={<Lock className="size-5" />} title="Segurança" desc="Alterar a senha de acesso.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nova senha">
                  <input type="password" className={inputCls} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
                </Field>
                <Field label="Confirmar nova senha">
                  <input type="password" className={inputCls} value={confirmaSenha} onChange={(e) => setConfirmaSenha(e.target.value)} placeholder="Repita a senha" autoComplete="new-password" />
                </Field>
              </div>
              <div className="mt-4 flex items-center justify-end gap-3">
                <StatusMsg s={statusSenha} />
                <button onClick={salvarSenha} disabled={statusSenha.tipo === "loading" || !novaSenha}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60">
                  {statusSenha.tipo === "loading" ? <><Loader2 className="size-4 animate-spin" /> Alterando...</> : <><Lock className="size-4" /> Trocar senha</>}
                </button>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
