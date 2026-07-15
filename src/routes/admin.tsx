import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { souSuperAdmin } from "@/lib/permissoes";
import { sincronizarProfissionais } from "@/lib/bpa-i-v2/profissionais";
import {
  ShieldCheck,
  Loader2,
  Users,
  Eye,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building2,
  Plus,
  X,
  Landmark,
} from "lucide-react";
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
  listarOrganizacoes,
  salvarOrganizacao,
  salvarGestao,
  criarOrganizacao,
  adicionarEstabelecimento,
  leiturasRecentes,
  listarDonosSistema,
  type VinculoAdmin,
  type PessoaAdmin,
  type PermissaoCat,
  type EstabelecimentoOrg,
  type OrganizacaoAdmin,
  type LeituraLog,
  type DonoSistema,
} from "@/lib/admin";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administração de vínculos e acessos" }] }),
  component: Admin,
});

const LABEL_CARGO: Record<string, string> = {
  digitador: "Digitador",
  coordenador: "Coordenador",
  operador_remessa: "Operador de remessa",
  secretario_municipal: "Secretário municipal",
};
const nomeCargo = (p: string) => LABEL_CARGO[p] ?? p;

// Descrição curta do que o cargo FAZ (o nome diz o que ele É). Ex.: Coordenador "só visualiza".
const DESC_CARGO: Record<string, string> = {
  coordenador: "só visualiza",
};

// Escopo de cada cargo, mostrado como etiqueta na tela. O "Dono do sistema" (super-admin)
// não é um papel de papel_permissoes — é Global e não atribuível pela tela.
type Escopo = "cnes" | "organizacao" | "global";
const ESCOPO_CARGO: Record<string, Escopo> = {
  digitador: "cnes",
  coordenador: "cnes",
  operador_remessa: "cnes",
  secretario_municipal: "organizacao",
};
const LABEL_ESCOPO: Record<Escopo, string> = {
  cnes: "CNES",
  organizacao: "Organização",
  global: "Global",
};
const escopoDoCargo = (p: string): Escopo => ESCOPO_CARGO[p] ?? "cnes";

// Rótulos curtos e legíveis das permissões (o código cru vai no tooltip, p/ suporte).
// Fallback: se surgir uma permissão nova no catálogo sem rótulo aqui, usa a descrição
// do banco e, na falta dela, o próprio código — nunca fica em branco.
const LABEL_PERM: Record<string, string> = {
  criar_ficha: "Criar ficha",
  editar_ficha_propria: "Editar a própria ficha",
  conferir_ficha: "Conferir/assinar ficha",
  ver_fichas_da_unidade: "Ver fichas da unidade",
  gerar_producao: "Fechar e gerar produção",
  reabrir_producao: "Reabrir produção",
  retificar_ficha_exportada: "Retificar ficha exportada",
  gerenciar_vinculos: "Gerenciar usuários e acessos",
  ver_fichas_do_municipio: "Ver fichas do município",
};
const nomePerm = (p: PermissaoCat) => LABEL_PERM[p.codigo] ?? p.descricao ?? p.codigo;

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
  const [organizacoes, setOrganizacoes] = useState<OrganizacaoAdmin[]>([]);
  const [leituras, setLeituras] = useState<LeituraLog[]>([]);
  const [donos, setDonos] = useState<DonoSistema[]>([]);
  const [superAdmin, setSuperAdmin] = useState(false);
  // Master-detail: null = lista de prefeituras; id = detalhe daquela prefeitura.
  const [prefSel, setPrefSel] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    souSuperAdmin().then(setSuperAdmin);
  }, []);

  const recarregar = useCallback(() => {
    return Promise.all([
      listarPessoasAdmin(),
      listarVinculosAdmin(),
      listarPermissoes(),
      listarPapelPermissoes(),
      listarOrganizacoes(),
      leiturasRecentes(50),
      listarDonosSistema(),
    ]).then(async ([pe, v, p, cd, orgs, l, dn]) => {
      setPessoas(pe as PessoaAdmin[]);
      setVinculos(v as VinculoAdmin[]);
      setPerms(p as PermissaoCat[]);
      setCargoDefaults(cd as Record<string, string[]>);
      setOrganizacoes(orgs as OrganizacaoAdmin[]);
      setLeituras(l as LeituraLog[]);
      setDonos(dn as DonoSistema[]);
      // Estabelecimentos de TODAS as orgs geridas (inclui prefeituras ainda sem pessoas).
      const orgIds = [
        ...new Set([
          ...(orgs as OrganizacaoAdmin[]).map((o) => o.id),
          ...(pe as PessoaAdmin[]).map((x) => x.organizacao_id),
        ]),
      ];
      const listas = await Promise.all(orgIds.map((o) => estabelecimentosOrg(o)));
      setEstabPorOrg(Object.fromEntries(orgIds.map((o, i) => [o, listas[i]])));
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

  const gravarOrganizacao = async (o: OrganizacaoAdmin) => {
    setSalvando(`org:${o.id}`);
    try {
      await salvarOrganizacao({
        id: o.id,
        nome: o.nome,
        municipio_ibge: o.municipio_ibge ?? "",
        uf: o.uf ?? "",
        cab_orgao_origem: o.cab_orgao_origem ?? "",
        cab_sigla: o.cab_sigla ?? "",
        cab_cgc_cpf: o.cab_cgc_cpf ?? "",
        cab_orgao_destino: o.cab_orgao_destino ?? "",
        cab_destino_tipo: o.cab_destino_tipo,
        cab_versao: o.cab_versao,
      });
      await recarregar();
      toast.success("Organização salva.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar organização.");
    } finally {
      setSalvando(null);
    }
  };

  const gravarGestao = async (
    o: OrganizacaoAdmin,
    g: { id: string | null; nome: string; inicio: string; fim: string },
  ) => {
    setSalvando(`gestao:${o.id}`);
    try {
      await salvarGestao(o.id, g.id, g.nome, g.inicio, g.fim || null);
      await recarregar();
      toast.success("Gestão salva.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar gestão.");
    } finally {
      setSalvando(null);
    }
  };

  const adicionarCnes = async (org: OrganizacaoAdmin, cnes: string, nome: string) => {
    setSalvando(`estab:${org.id}`);
    try {
      await adicionarEstabelecimento(org.id, cnes, nome);
      // Puxa os profissionais do CNES (cache) pela integração que já existe.
      await sincronizarProfissionais(cnes);
      await recarregar();
      toast.success(`CNES ${cnes} cadastrado.`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cadastrar CNES.");
      return false;
    } finally {
      setSalvando(null);
    }
  };

  const criarPrefeitura = async (nome: string, ibge: string, uf: string) => {
    setSalvando("criar-prefeitura");
    try {
      await criarOrganizacao(nome, ibge, uf);
      await recarregar();
      toast.success(`Prefeitura "${nome}" criada.`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar prefeitura.");
      return false;
    } finally {
      setSalvando(null);
    }
  };

  const hojeISO = new Date().toISOString().slice(0, 10);
  const semAcesso = !carregando && pessoas.length === 0 && organizacoes.length === 0 && !superAdmin;

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
        ) : prefSel ? (
          (() => {
            const org = organizacoes.find((o) => o.id === prefSel);
            if (!org) {
              return (
                <button
                  onClick={() => setPrefSel(null)}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ChevronLeft className="size-4" /> Voltar para prefeituras
                </button>
              );
            }
            const pessoasOrg = pessoas.filter((p) => p.organizacao_id === prefSel);
            return (
              <>
                <button
                  onClick={() => setPrefSel(null)}
                  className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="size-4" /> Todas as prefeituras
                </button>

                {/* Gestão, cabeçalho magnético e unidades desta prefeitura */}
                <section className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Landmark className="size-4" /> {org.nome}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dados do município, gestão e o <strong>cabeçalho do arquivo magnético</strong>{" "}
                    (registro 01), além das unidades (CNES) da prefeitura.
                  </p>
                  <div className="mt-4">
                    <OrgCard
                      org={org}
                      estabelecimentos={estabPorOrg[org.id] ?? []}
                      salvandoOrg={salvando === `org:${org.id}`}
                      salvandoGestao={salvando === `gestao:${org.id}`}
                      salvandoCnes={salvando === `estab:${org.id}`}
                      onSalvarOrg={gravarOrganizacao}
                      onSalvarGestao={gravarGestao}
                      onAddCnes={adicionarCnes}
                    />
                  </div>
                </section>

                {/* Usuários desta prefeitura */}
                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Users className="size-4" /> Usuários ({pessoasOrg.length})
                    </h2>
                    <CriarContaForm
                      orgs={[{ id: org.id, nome: org.nome }]}
                      cargos={Object.keys(cargoDefaults).sort()}
                      estabPorOrg={estabPorOrg}
                      criando={salvando === "criar-conta"}
                      onCriar={criarContaNova}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Uma pessoa por cartão. O <strong>cargo</strong> traz o pacote-padrão de
                    permissões; ajustes ficam marcados como{" "}
                    <span className="text-amber-700">≠ padrão</span>. As permissões de unidade valem
                    para todas as unidades da pessoa (personalize por unidade no rodapé de cada
                    cartão).
                  </p>
                  <div className="mt-4 space-y-4">
                    {pessoasOrg.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum usuário nesta prefeitura ainda.
                      </p>
                    ) : (
                      pessoasOrg.map((pessoa) => (
                        <PessoaCard
                          key={`${pessoa.user_id}:${pessoa.organizacao_id}`}
                          pessoa={pessoa}
                          ehDono={donos.some((d) => d.user_id === pessoa.user_id)}
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
                      ))
                    )}
                  </div>
                </section>
              </>
            );
          })()
        ) : (
          <>
            {/* Dono do sistema — escopo global, não atribuível pela tela */}
            {donos.length > 0 && (
              <section className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
                <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-violet-900">
                  <ShieldCheck className="size-4" /> Dono do sistema
                  <span className="rounded bg-violet-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-900">
                    {LABEL_ESCOPO.global}
                  </span>
                </h2>
                <p className="mt-1 text-xs text-violet-800">
                  {donos.map((d) => d.email).join(", ")} — administra qualquer prefeitura; para ver
                  ficha ainda precisa de vínculo no CNES. Não atribuível pela tela.
                </p>
              </section>
            )}

            {/* Lista de prefeituras — clique para configurar gestão, unidades e usuários */}
            <section className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Landmark className="size-4" /> Prefeituras ({organizacoes.length})
                </h2>
                {superAdmin && (
                  <CriarPrefeituraForm
                    criando={salvando === "criar-prefeitura"}
                    onCriar={criarPrefeitura}
                  />
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Abra uma prefeitura para ver e editar sua gestão, unidades e usuários.
                {superAdmin && " Como super-admin, você vê todas as prefeituras."}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {organizacoes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma prefeitura cadastrada.</p>
                ) : (
                  organizacoes.map((o) => {
                    const nUnid = (estabPorOrg[o.id] ?? []).length;
                    const nPess = pessoas.filter((p) => p.organizacao_id === o.id).length;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setPrefSel(o.id)}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-muted"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">
                            {o.nome}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {nUnid} unidade{nUnid === 1 ? "" : "s"} · {nPess} usuário
                            {nPess === 1 ? "" : "s"}
                          </div>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            {/* Logs de acesso (LGPD) */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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

function CriarPrefeituraForm({
  criando,
  onCriar,
}: {
  criando: boolean;
  onCriar: (nome: string, ibge: string, uf: string) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [ibge, setIbge] = useState("");
  const [uf, setUf] = useState("");
  const campo = "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground";

  const submeter = async () => {
    if (!nome.trim()) return;
    const ok = await onCriar(nome.trim(), ibge.trim(), uf.trim());
    if (ok) {
      setNome("");
      setIbge("");
      setUf("");
      setAberto(false);
    }
  };

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
      >
        <Plus className="size-3.5" /> Criar prefeitura
      </button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-2">
      <label className="flex flex-1 flex-col gap-0.5 text-[10px] font-medium text-muted-foreground">
        Nome da prefeitura
        <input
          className={campo}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: FMS — Cidade/UF"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted-foreground">
        Município (IBGE)
        <input
          className={`${campo} w-24`}
          value={ibge}
          onChange={(e) => setIbge(e.target.value.replace(/\D/g, ""))}
          placeholder="2927200"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted-foreground">
        UF
        <input
          className={`${campo} w-12`}
          maxLength={2}
          value={uf}
          onChange={(e) => setUf(e.target.value.toUpperCase())}
        />
      </label>
      <button
        onClick={submeter}
        disabled={!nome.trim() || criando}
        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {criando ? <Loader2 className="size-3.5 animate-spin" /> : null} Criar
      </button>
      <button
        onClick={() => setAberto(false)}
        className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        Cancelar
      </button>
    </div>
  );
}

function OrgCard({
  org,
  estabelecimentos,
  salvandoOrg,
  salvandoGestao,
  salvandoCnes,
  onSalvarOrg,
  onSalvarGestao,
  onAddCnes,
}: {
  org: OrganizacaoAdmin;
  estabelecimentos: EstabelecimentoOrg[];
  salvandoOrg: boolean;
  salvandoGestao: boolean;
  salvandoCnes: boolean;
  onSalvarOrg: (o: OrganizacaoAdmin) => void;
  onSalvarGestao: (
    o: OrganizacaoAdmin,
    g: { id: string | null; nome: string; inicio: string; fim: string },
  ) => void;
  onAddCnes: (o: OrganizacaoAdmin, cnes: string, nome: string) => Promise<boolean>;
}) {
  const [o, setO] = useState<OrganizacaoAdmin>(org);
  const [addCnesAberto, setAddCnesAberto] = useState(false);
  const [novoCnes, setNovoCnes] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [g, setG] = useState({
    id: org.gestao_id,
    nome: org.gestao_nome ?? "",
    inicio: org.gestao_inicio ?? "",
    fim: org.gestao_fim ?? "",
  });
  const set = <K extends keyof OrganizacaoAdmin>(k: K, v: OrganizacaoAdmin[K]) =>
    setO((prev) => ({ ...prev, [k]: v }));
  const campo = "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground";
  const rotulo = "flex flex-col gap-0.5 text-[10px] font-medium text-muted-foreground";

  const confirmarAddCnes = async () => {
    if (!/^[0-9]{7}$/.test(novoCnes)) return;
    const ok = await onAddCnes(org, novoCnes, novoNome);
    if (ok) {
      setNovoCnes("");
      setNovoNome("");
      setAddCnesAberto(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="text-sm font-semibold text-foreground">{org.nome}</div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={rotulo}>
          Nome da organização
          <input className={campo} value={o.nome} onChange={(e) => set("nome", e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={rotulo}>
            Município (IBGE)
            <input
              className={campo}
              value={o.municipio_ibge ?? ""}
              onChange={(e) => set("municipio_ibge", e.target.value)}
            />
          </label>
          <label className={rotulo}>
            UF
            <input
              className={campo}
              maxLength={2}
              value={o.uf ?? ""}
              onChange={(e) => set("uf", e.target.value.toUpperCase())}
            />
          </label>
        </div>
      </div>

      <div className="mt-3 text-[11px] font-medium text-muted-foreground">
        Cabeçalho do arquivo magnético (registro 01)
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        Deve bater com o que o DATASUS aceita <strong>na competência de apresentação</strong>. O
        órgão de destino e a versão mudam quase todo mês (atual{" "}
        <span className="font-mono">D04.14</span>) — atualize a cada remessa.
      </p>
      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={rotulo}>
          Órgão de origem (máx. 30)
          <input
            className={campo}
            maxLength={30}
            value={o.cab_orgao_origem ?? ""}
            onChange={(e) => set("cab_orgao_origem", e.target.value)}
            placeholder="Ex.: SECRETARIA MUNICIPAL DE SAUDE"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={rotulo}>
            Sigla (máx. 6)
            <input
              className={campo}
              maxLength={6}
              value={o.cab_sigla ?? ""}
              onChange={(e) => set("cab_sigla", e.target.value)}
            />
          </label>
          <label className={rotulo}>
            CNPJ/CPF (14 díg.)
            <input
              className={campo}
              inputMode="numeric"
              maxLength={14}
              value={o.cab_cgc_cpf ?? ""}
              onChange={(e) => set("cab_cgc_cpf", e.target.value.replace(/\D/g, ""))}
            />
          </label>
        </div>
        <label className={rotulo}>
          Órgão de destino (máx. 40)
          <input
            className={campo}
            maxLength={40}
            value={o.cab_orgao_destino ?? ""}
            onChange={(e) => set("cab_orgao_destino", e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={rotulo}>
            Tipo de destino
            <select
              className={campo}
              value={o.cab_destino_tipo}
              onChange={(e) => set("cab_destino_tipo", e.target.value)}
            >
              <option value="M">Municipal</option>
              <option value="E">Estadual</option>
            </select>
          </label>
          <label className={rotulo}>
            Versão do layout
            <input
              className={campo}
              maxLength={6}
              value={o.cab_versao}
              onChange={(e) => set("cab_versao", e.target.value)}
            />
          </label>
        </div>
      </div>
      <p className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
        ⚠️ O layout do DATASUS <strong>muda quase todo mês</strong>: atualize o órgão de destino e a
        versão quando sair uma nova (jun/2026 = MINISTERIO DA SAUDE / D04.14; mar = Secretaria do
        Estado / D04.11). E o tipo é <strong>“Municipal” (M)</strong> mesmo com destino federal — é
        o valor que o DATASUS aceita (o relatório imprime “ORGAO (M)UNICIPAL OU (E)STADUAL : M”).
        Não troque para “E” sem novo arquivo de referência.
      </p>
      <div className="mt-2">
        <button
          onClick={() => onSalvarOrg(o)}
          disabled={salvandoOrg}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {salvandoOrg ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar organização
        </button>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="text-[11px] font-medium text-muted-foreground">
          Gestão vigente (mandato)
        </div>
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className={rotulo}>
            Nome
            <input
              className={campo}
              value={g.nome}
              onChange={(e) => setG((p) => ({ ...p, nome: e.target.value }))}
              placeholder="Ex.: 2025–2028"
            />
          </label>
          <label className={rotulo}>
            Início
            <input
              type="date"
              className={campo}
              value={g.inicio}
              onChange={(e) => setG((p) => ({ ...p, inicio: e.target.value }))}
            />
          </label>
          <label className={rotulo}>
            Fim (opcional)
            <input
              type="date"
              className={campo}
              value={g.fim}
              onChange={(e) => setG((p) => ({ ...p, fim: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => onSalvarGestao(org, g)}
            disabled={salvandoGestao || !g.nome || !g.inicio}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {salvandoGestao ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {g.id ? "Salvar gestão" : "Criar gestão"}
          </button>
          {g.id && (
            <button
              onClick={() => setG({ id: null, nome: "", inicio: "", fim: "" })}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              + nova gestão
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-medium text-muted-foreground">
            Unidades (CNES) — {estabelecimentos.length}
          </div>
          {!addCnesAberto && (
            <button
              onClick={() => setAddCnesAberto(true)}
              className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3" /> Adicionar CNES
            </button>
          )}
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Ao cadastrar um CNES, o sistema puxa os profissionais dele pela API do CNES. (A busca
          automática por município virá da base pública do DATASUS.)
        </p>
        {estabelecimentos.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {estabelecimentos.map((e) => (
              <span
                key={e.cnes}
                title={e.nome}
                className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] text-foreground"
              >
                <span className="font-mono">{e.cnes}</span> · {e.nome}
              </span>
            ))}
          </div>
        )}
        {addCnesAberto && (
          <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-2">
            <label className={rotulo}>
              CNES (7 dígitos)
              <input
                className={`${campo} w-28`}
                inputMode="numeric"
                maxLength={7}
                value={novoCnes}
                onChange={(e) => setNovoCnes(e.target.value.replace(/\D/g, ""))}
                placeholder="2510332"
              />
            </label>
            <label className={`${rotulo} flex-1`}>
              Nome da unidade (opcional)
              <input
                className={campo}
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex.: HOSPITAL REGIONAL"
              />
            </label>
            <button
              onClick={confirmarAddCnes}
              disabled={!/^[0-9]{7}$/.test(novoCnes) || salvandoCnes}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {salvandoCnes ? <Loader2 className="size-3.5 animate-spin" /> : null} Cadastrar
            </button>
            <button
              onClick={() => setAddCnesAberto(false)}
              className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
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
  ehDono,
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
  ehDono: boolean;
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
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{pessoa.email}</span>
            {ehDono && (
              <span
                title="Super-admin: administra qualquer prefeitura. Não atribuível pela tela."
                className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-800"
              >
                Dono do sistema · {LABEL_ESCOPO.global}
              </span>
            )}
          </div>
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
          {cargoAtual !== "" && (
            <span
              title={`Escopo do cargo: ${LABEL_ESCOPO[escopoDoCargo(cargoAtual)]}`}
              className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground"
            >
              {LABEL_ESCOPO[escopoDoCargo(cargoAtual)]}
            </span>
          )}
        </label>
      </div>
      {cargoAtual !== "" && DESC_CARGO[cargoAtual] && (
        <div className="mt-0.5 text-right text-[11px] text-muted-foreground">{DESC_CARGO[cargoAtual]}</div>
      )}

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
                  label={nomePerm(p)}
                  title={p.codigo}
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
                label={nomePerm(p)}
                title={p.codigo}
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
                          label={nomePerm(p)}
                          title={p.codigo}
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
