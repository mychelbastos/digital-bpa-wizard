import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Loader2, Users, Eye, ChevronDown, Building2, Plus, X } from "lucide-react";
import {
  listarVinculosAdmin,
  listarPessoasAdmin,
  listarPermissoes,
  listarPapelPermissoes,
  definirPermissao,
  definirPermissaoPessoa,
  trocarCargoPessoa,
  estabelecimentosOrg,
  vincularUnidade,
  desvincularUnidade,
  criarConta,
  leiturasRecentes,
  type VinculoAdmin,
  type PessoaAdmin,
  type PermissaoCat,
  type EstabelecimentoOrg,
  type LeituraLog,
} from "@/lib/admin";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administração de vínculos e acessos" }] }),
  component: Admin,
});

const LABEL_CARGO: Record<string, string> = {
  digitador: "Digitador",
  operador_remessa: "Operador de remessa",
  coordenador: "Coordenador",
  admin_org: "Administrador de vínculos",
  administrador_geral: "Administrador geral",
};
const nomeCargo = (p: string) => LABEL_CARGO[p] ?? p;

// Estado de uma permissão numa pessoa, derivado de quantos vínculos a têm vs. o total.
type EstadoPerm = {
  ativa: boolean; // todos os vínculos têm
  parcial: boolean; // alguns têm
  padrao: boolean; // faz parte do pacote do cargo
  override: boolean; // difere do padrão do cargo (ou é parcial)
};

function estadoPermissao(
  codigo: string,
  perms: Record<string, number>,
  total: number,
  defaults: Set<string>,
): EstadoPerm {
  const c = perms[codigo] ?? 0;
  const ativa = total > 0 && c >= total;
  const parcial = c > 0 && c < total;
  const padrao = defaults.has(codigo);
  const override = parcial || ativa !== padrao;
  return { ativa, parcial, padrao, override };
}

function Admin() {
  const [pessoas, setPessoas] = useState<PessoaAdmin[]>([]);
  const [vinculos, setVinculos] = useState<VinculoAdmin[]>([]);
  const [perms, setPerms] = useState<PermissaoCat[]>([]);
  const [cargoDefaults, setCargoDefaults] = useState<Record<string, string[]>>({});
  const [estabPorOrg, setEstabPorOrg] = useState<Record<string, EstabelecimentoOrg[]>>({});
  const [leituras, setLeituras] = useState<LeituraLog[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  const recarregar = useCallback(() => {
    return Promise.all([
      listarPessoasAdmin(),
      listarVinculosAdmin(),
      listarPermissoes(),
      listarPapelPermissoes(),
      leiturasRecentes(50),
    ]).then(async ([pe, v, p, cd, l]) => {
      setPessoas(pe);
      setVinculos(v);
      setPerms(p);
      setCargoDefaults(cd);
      setLeituras(l);
      // Estabelecimentos por organização (para o seletor "adicionar unidade").
      const orgs = [...new Set(pe.map((x) => x.organizacao_id))];
      const listas = await Promise.all(orgs.map((o) => estabelecimentosOrg(o)));
      setEstabPorOrg(Object.fromEntries(orgs.map((o, i) => [o, listas[i]])));
    });
  }, []);

  useEffect(() => {
    recarregar().finally(() => setCarregando(false));
  }, [recarregar]);

  const permsOrg = useMemo(() => perms.filter((p) => p.escopo === "organizacao"), [perms]);
  const permsCnes = useMemo(() => perms.filter((p) => p.escopo === "cnes"), [perms]);

  const defaultsDaPessoa = useCallback(
    (pessoa: PessoaAdmin) => {
      const s = new Set<string>();
      for (const papel of pessoa.papeis) for (const c of cargoDefaults[papel] ?? []) s.add(c);
      return s;
    },
    [cargoDefaults],
  );

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  // Toggle no nível da PESSOA: aplica a todos os vínculos. Se já é override, reseta ao padrão.
  const togglePessoa = async (pessoa: PessoaAdmin, p: PermissaoCat, est: EstadoPerm) => {
    const chave = `${pessoa.user_id}:${p.codigo}`;
    setSalvando(chave);
    try {
      const alvo: boolean | null = est.override ? null : !est.padrao;
      await definirPermissaoPessoa(pessoa.user_id, pessoa.organizacao_id, p.codigo, alvo);
      await recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar permissão.");
    } finally {
      setSalvando(null);
    }
  };

  const trocarCargo = async (pessoa: PessoaAdmin, papel: string) => {
    if (papel === (pessoa.papeis.length === 1 ? pessoa.papeis[0] : "")) return;
    if (
      !window.confirm(
        `Trocar o cargo de ${pessoa.email} para "${nomeCargo(papel)}"? ` +
          "As permissões voltam ao pacote do cargo (ajustes por unidade são descartados).",
      )
    )
      return;
    const chave = `${pessoa.user_id}:cargo`;
    setSalvando(chave);
    try {
      await trocarCargoPessoa(pessoa.user_id, pessoa.organizacao_id, papel);
      await recarregar();
      toast.success(`Cargo alterado para ${nomeCargo(papel)}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao trocar cargo.");
    } finally {
      setSalvando(null);
    }
  };

  // Override por UNIDADE (um vínculo). Mesma lógica de ciclo contra o padrão do cargo do vínculo.
  const toggleVinculo = async (v: VinculoAdmin, p: PermissaoCat) => {
    const padrao = (cargoDefaults[v.papel] ?? []).includes(p.codigo);
    const ativa = v.permissoes.includes(p.codigo);
    const override = ativa !== padrao;
    const chave = `${v.vinculo_id}:${p.codigo}`;
    setSalvando(chave);
    try {
      const alvo: boolean | null = override ? null : !padrao;
      await definirPermissao(v.vinculo_id, p.codigo, alvo);
      await recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar permissão.");
    } finally {
      setSalvando(null);
    }
  };

  const vincular = async (pessoa: PessoaAdmin, cnes: string, papel: string) => {
    const chave = `${pessoa.user_id}:vinc`;
    setSalvando(chave);
    try {
      await vincularUnidade(pessoa.user_id, pessoa.organizacao_id, cnes, papel);
      await recarregar();
      toast.success(`Vinculado ao CNES ${cnes}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao vincular unidade.");
    } finally {
      setSalvando(null);
    }
  };

  const desvincular = async (pessoa: PessoaAdmin, cnes: string) => {
    if (
      !window.confirm(
        `Desvincular ${pessoa.email} do CNES ${cnes}? ` +
          "O acesso é encerrado agora; o histórico do vínculo é preservado.",
      )
    )
      return;
    const chave = `${pessoa.user_id}:${cnes}:desvinc`;
    setSalvando(chave);
    try {
      await desvincularUnidade(pessoa.user_id, pessoa.organizacao_id, cnes);
      await recarregar();
      toast.success(`Desvinculado do CNES ${cnes}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desvincular unidade.");
    } finally {
      setSalvando(null);
    }
  };

  const criarContaNova = async (email: string, senha: string, cnes: string, papel: string) => {
    setSalvando("criar-conta");
    try {
      await criarConta(email, senha, cnes, papel);
      await recarregar();
      toast.success(`Conta ${email} criada e vinculada ao CNES ${cnes}.`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar conta.");
      return false;
    } finally {
      setSalvando(null);
    }
  };

  // Organizações que o admin gerencia (derivadas das pessoas listadas), com nome.
  const orgs = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pessoas) m.set(p.organizacao_id, p.org_nome);
    return [...m].map(([id, nome]) => ({ id, nome }));
  }, [pessoas]);

  const hojeISO = new Date().toISOString().slice(0, 10);
  const semAcesso = !carregando && pessoas.length === 0;

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1000px] items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Início
          </Link>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="size-4" /> Administração de vínculos e acessos
          </h1>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-[1000px] px-4">
        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </div>
        ) : semAcesso ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Você não administra nenhuma organização (precisa da permissão “gerenciar vínculos”).
          </p>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Users className="size-4" /> Pessoas ({pessoas.length})
                </h2>
                <CriarContaForm
                  orgs={orgs}
                  cargos={Object.keys(cargoDefaults).sort()}
                  estabPorOrg={estabPorOrg}
                  criando={salvando === "criar-conta"}
                  onCriar={criarContaNova}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Uma pessoa por cartão. O <strong>cargo</strong> traz o pacote-padrão de permissões;
                ajustes ficam marcados como <span className="text-amber-700">≠ padrão</span>. As
                permissões de unidade valem para todas as unidades da pessoa (personalize por
                unidade no rodapé de cada cartão).
              </p>
              <div className="mt-4 space-y-4">
                {pessoas.map((pessoa) => (
                  <PessoaCard
                    key={`${pessoa.user_id}:${pessoa.organizacao_id}`}
                    pessoa={pessoa}
                    permsOrg={permsOrg}
                    permsCnes={permsCnes}
                    defaults={defaultsDaPessoa(pessoa)}
                    cargos={Object.keys(cargoDefaults).sort()}
                    vinculos={vinculos.filter(
                      (v) =>
                        v.user_id === pessoa.user_id &&
                        v.organizacao_id === pessoa.organizacao_id &&
                        (v.fim === null || v.fim >= hojeISO),
                    )}
                    estabelecimentos={estabPorOrg[pessoa.organizacao_id] ?? []}
                    cargoDefaults={cargoDefaults}
                    salvando={salvando}
                    onTogglePessoa={togglePessoa}
                    onTrocarCargo={trocarCargo}
                    onToggleVinculo={toggleVinculo}
                    onVincular={vincular}
                    onDesvincular={desvincular}
                  />
                ))}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Eye className="size-4" /> Acessos a fichas BPA-I (LGPD) — {leituras.length}{" "}
                recentes
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Toda abertura de ficha BPA-I (com dado pessoal do paciente) é registrada.
              </p>
              {leituras.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhum acesso registrado ainda.
                </p>
              ) : (
                <div className="mt-3 max-h-80 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Quando</th>
                        <th className="py-1 pr-3 font-medium">Quem</th>
                        <th className="py-1 pr-3 font-medium">CNES</th>
                        <th className="py-1 font-medium">Ficha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leituras.map((l, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-1 pr-3 tabular-nums">{fmt(l.lida_em)}</td>
                          <td className="py-1 pr-3">{l.email}</td>
                          <td className="py-1 pr-3 font-mono">{l.cnes}</td>
                          <td className="py-1 truncate">{l.titulo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function PermPill({
  label,
  title,
  est,
  loading,
  onClick,
}: {
  label: string;
  title: string;
  est: EstadoPerm;
  loading: boolean;
  onClick: () => void;
}) {
  const base =
    "relative rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50";
  let cls: string;
  if (est.parcial) cls = "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100";
  else if (est.ativa)
    cls = "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
  else cls = "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100";
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={`${title}${est.override ? " · diferente do padrão do cargo" : ""}`}
      className={`${base} ${cls} ${est.override ? "ring-2 ring-amber-300/70" : ""}`}
    >
      {loading ? "…" : est.parcial ? "◐ " : est.ativa ? "✓ " : "+ "}
      {label}
      {est.override && !loading ? <span className="ml-1 text-amber-600">≠</span> : null}
    </button>
  );
}

function CriarContaForm({
  orgs,
  cargos,
  estabPorOrg,
  criando,
  onCriar,
}: {
  orgs: { id: string; nome: string }[];
  cargos: string[];
  estabPorOrg: Record<string, EstabelecimentoOrg[]>;
  criando: boolean;
  onCriar: (email: string, senha: string, cnes: string, papel: string) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [org, setOrg] = useState(orgs.length === 1 ? orgs[0].id : "");
  const [cnes, setCnes] = useState("");
  const [papel, setPapel] = useState("");

  const estabs = estabPorOrg[org] ?? [];
  const senhaCurta = senha.length > 0 && senha.length < 8;
  const valido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && senha.length >= 8 && cnes && papel;

  const submeter = async () => {
    if (!valido) return;
    const ok = await onCriar(email.trim(), senha, cnes, papel);
    if (ok) {
      setEmail("");
      setSenha("");
      setCnes("");
      setPapel("");
      setAberto(false);
    }
  };

  if (!aberto) {
    return (
      <button
        onClick={() => {
          setAberto(true);
          setOrg(orgs.length === 1 ? orgs[0].id : "");
        }}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
      >
        <Plus className="size-3.5" /> Criar conta
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-muted/30 p-3">
      <div className="text-xs font-semibold text-foreground">Criar conta nova</div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        A conta é ativada na hora (sem e-mail de confirmação). A pessoa entra com este e-mail e
        senha — oriente-a a trocar a senha depois.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted-foreground">
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@exemplo.com"
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted-foreground">
          Senha inicial (mín. 8)
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="new-password"
            className={`rounded-md border bg-background px-2 py-1 text-xs text-foreground ${senhaCurta ? "border-destructive" : "border-border"}`}
          />
        </label>
        {orgs.length > 1 && (
          <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted-foreground">
            Organização
            <select
              value={org}
              onChange={(e) => {
                setOrg(e.target.value);
                setCnes("");
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="">Selecione…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted-foreground">
          Unidade (CNES)
          <select
            value={cnes}
            onChange={(e) => setCnes(e.target.value)}
            disabled={!org}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-50"
          >
            <option value="">Selecione…</option>
            {estabs.map((e) => (
              <option key={e.cnes} value={e.cnes}>
                {e.cnes} — {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted-foreground">
          Cargo
          <select
            value={papel}
            onChange={(e) => setPapel(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            <option value="">Selecione…</option>
            {cargos.map((c) => (
              <option key={c} value={c}>
                {nomeCargo(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={submeter}
          disabled={!valido || criando}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {criando ? <Loader2 className="size-3.5 animate-spin" /> : null} Criar e vincular
        </button>
        <button
          onClick={() => setAberto(false)}
          className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function PessoaCard({
  pessoa,
  permsOrg,
  permsCnes,
  defaults,
  cargos,
  vinculos,
  estabelecimentos,
  cargoDefaults,
  salvando,
  onTogglePessoa,
  onTrocarCargo,
  onToggleVinculo,
  onVincular,
  onDesvincular,
}: {
  pessoa: PessoaAdmin;
  permsOrg: PermissaoCat[];
  permsCnes: PermissaoCat[];
  defaults: Set<string>;
  cargos: string[];
  vinculos: VinculoAdmin[];
  estabelecimentos: EstabelecimentoOrg[];
  cargoDefaults: Record<string, string[]>;
  salvando: string | null;
  onTogglePessoa: (p: PessoaAdmin, perm: PermissaoCat, est: EstadoPerm) => void;
  onTrocarCargo: (p: PessoaAdmin, papel: string) => void;
  onToggleVinculo: (v: VinculoAdmin, perm: PermissaoCat) => void;
  onVincular: (p: PessoaAdmin, cnes: string, papel: string) => void;
  onDesvincular: (p: PessoaAdmin, cnes: string) => void;
}) {
  const [abrirUnidades, setAbrirUnidades] = useState(false);
  const [addAberto, setAddAberto] = useState(false);
  const [novoCnes, setNovoCnes] = useState("");
  const [novoPapel, setNovoPapel] = useState("");
  const cargoAtual = pessoa.papeis.length === 1 ? pessoa.papeis[0] : "";
  const cnesDisponiveis = estabelecimentos.filter((e) => !pessoa.cnes.includes(e.cnes));

  const confirmarAdd = () => {
    if (!novoCnes || !novoPapel) return;
    onVincular(pessoa, novoCnes, novoPapel);
    setAddAberto(false);
    setNovoCnes("");
    setNovoPapel("");
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{pessoa.email}</div>
          <div className="text-xs text-muted-foreground">{pessoa.org_nome}</div>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Cargo
          <div className="relative">
            <select
              value={cargoAtual}
              onChange={(e) => onTrocarCargo(pessoa, e.target.value)}
              disabled={salvando === `${pessoa.user_id}:cargo`}
              className="appearance-none rounded-md border border-border bg-background py-1 pl-2.5 pr-7 text-xs font-medium text-foreground disabled:opacity-50"
            >
              {cargoAtual === "" && <option value="">— vários —</option>}
              {cargos.map((c) => (
                <option key={c} value={c}>
                  {nomeCargo(c)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Building2 className="size-3" /> Unidades ({pessoa.cnes.length}):
        </span>
        {pessoa.cnes.length === 0 && (
          <span className="text-[11px] text-muted-foreground">nenhuma unidade ativa</span>
        )}
        {pessoa.cnes.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 py-0.5 pl-1.5 pr-1 font-mono text-[11px] text-foreground"
          >
            {c}
            <button
              onClick={() => onDesvincular(pessoa, c)}
              disabled={salvando === `${pessoa.user_id}:${c}:desvinc`}
              title="Desvincular esta unidade"
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {!addAberto && cnesDisponiveis.length > 0 && (
          <button
            onClick={() => {
              setAddAberto(true);
              setNovoPapel(cargoAtual || "");
            }}
            className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-3" /> Adicionar unidade
          </button>
        )}
      </div>

      {addAberto && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-2">
          <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted-foreground">
            Unidade (CNES)
            <select
              value={novoCnes}
              onChange={(e) => setNovoCnes(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="">Selecione…</option>
              {cnesDisponiveis.map((e) => (
                <option key={e.cnes} value={e.cnes}>
                  {e.cnes} — {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted-foreground">
            Cargo na unidade
            <select
              value={novoPapel}
              onChange={(e) => setNovoPapel(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="">Selecione…</option>
              {cargos.map((c) => (
                <option key={c} value={c}>
                  {nomeCargo(c)}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={confirmarAdd}
            disabled={!novoCnes || !novoPapel || salvando === `${pessoa.user_id}:vinc`}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Vincular
          </button>
          <button
            onClick={() => setAddAberto(false)}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
        </div>
      )}

      {permsOrg.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-medium text-muted-foreground">
            Permissão da organização
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {permsOrg.map((p) => {
              const est = estadoPermissao(p.codigo, pessoa.perms, pessoa.total_vinculos, defaults);
              return (
                <PermPill
                  key={p.codigo}
                  label={p.codigo}
                  title={p.descricao}
                  est={est}
                  loading={salvando === `${pessoa.user_id}:${p.codigo}`}
                  onClick={() => onTogglePessoa(pessoa, p, est)}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="text-[11px] font-medium text-muted-foreground">
          Permissões de unidade (valem para todas)
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {permsCnes.map((p) => {
            const est = estadoPermissao(p.codigo, pessoa.perms, pessoa.total_vinculos, defaults);
            return (
              <PermPill
                key={p.codigo}
                label={p.codigo}
                title={p.descricao}
                est={est}
                loading={salvando === `${pessoa.user_id}:${p.codigo}`}
                onClick={() => onTogglePessoa(pessoa, p, est)}
              />
            );
          })}
        </div>
      </div>

      {vinculos.length > 1 && (
        <div className="mt-3 border-t border-border pt-2">
          <button
            onClick={() => setAbrirUnidades((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${abrirUnidades ? "rotate-180" : ""}`}
            />
            Personalizar por unidade
          </button>
          {abrirUnidades && (
            <div className="mt-2 space-y-2">
              {vinculos.map((v) => (
                <div key={v.vinculo_id} className="rounded-lg border border-border/70 p-2">
                  <div className="text-[11px] text-muted-foreground">
                    CNES <span className="font-mono text-foreground">{v.cnes}</span> · cargo{" "}
                    {nomeCargo(v.papel)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {permsCnes.map((p) => {
                      const padrao = (cargoDefaults[v.papel] ?? []).includes(p.codigo);
                      const ativa = v.permissoes.includes(p.codigo);
                      const est: EstadoPerm = {
                        ativa,
                        parcial: false,
                        padrao,
                        override: ativa !== padrao,
                      };
                      return (
                        <PermPill
                          key={p.codigo}
                          label={p.codigo}
                          title={p.descricao}
                          est={est}
                          loading={salvando === `${v.vinculo_id}:${p.codigo}`}
                          onClick={() => onToggleVinculo(v, p)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
