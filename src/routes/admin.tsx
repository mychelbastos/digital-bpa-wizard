// Administração (/admin) — orquestrador. Carrega os dados, guarda os handlers (todos com as
// mesmas RPCs de antes) e repassa para os componentes de src/components/admin/.
// Navegação pela URL: /admin?pref=<org>&aba=usuarios|unidades|arquivo|relatorios&usuario=<user>
// e, na tela inicial, /admin?aba=lgpd. (Redesign 11/2026.)
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Plus, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { souSuperAdmin } from "@/lib/permissoes";
import { limparCacheLogoOrg } from "@/lib/org-logo";
import { sincronizarProfissionais } from "@/lib/bpa-i-v2/profissionais";
import { cn } from "@/lib/utils";
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
  excluirPessoa,
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
import { nomeCargo } from "@/components/admin/constantes";
import { useConfirmar } from "@/components/admin/ConfirmarDialog";
import { PrefeiturasLista } from "@/components/admin/PrefeiturasLista";
import { AuditoriaLgpd } from "@/components/admin/AuditoriaLgpd";
import { PrefeituraHeader, type AbaPref } from "@/components/admin/PrefeituraHeader";
import { UsuariosAba } from "@/components/admin/UsuariosAba";
import {
  UsuarioPainel,
  tituloPessoa,
  type HandlersUsuario,
} from "@/components/admin/UsuarioPainel";
import { UnidadesAba } from "@/components/admin/UnidadesAba";
import { ArquivoMagneticoAba } from "@/components/admin/ArquivoMagneticoAba";
import { RelatoriosGestaoAba, type GestaoForm } from "@/components/admin/RelatoriosGestaoAba";
import { CriarContaDialog } from "@/components/admin/CriarContaDialog";
import { CriarPrefeituraDialog } from "@/components/admin/CriarPrefeituraDialog";
import { SalvarBarra } from "@/components/admin/SalvarBarra";
import { btnPrimario } from "@/components/admin/ui";

type AbaUrl = AbaPref | "lgpd";
interface BuscaAdmin {
  pref?: string;
  aba?: AbaUrl;
  usuario?: string;
  unidade?: string;
}
const ABAS: AbaUrl[] = ["usuarios", "unidades", "arquivo", "relatorios", "lgpd"];

export const Route = createFileRoute("/admin")({
  validateSearch: (s: Record<string, unknown>): BuscaAdmin => ({
    pref: typeof s.pref === "string" && s.pref ? s.pref : undefined,
    aba:
      typeof s.aba === "string" && (ABAS as string[]).includes(s.aba)
        ? (s.aba as AbaUrl)
        : undefined,
    usuario: typeof s.usuario === "string" && s.usuario ? s.usuario : undefined,
    unidade: typeof s.unidade === "string" && /^\d{7}$/.test(s.unidade) ? s.unidade : undefined,
  }),
  head: () => ({ meta: [{ title: "Administração — Prefeituras e acessos" }] }),
  component: Admin,
});

// Campos do formulário da prefeitura (Arquivo magnético + Relatórios) — p/ detectar alteração.
const CAMPOS_ORG: (keyof OrganizacaoAdmin)[] = [
  "nome",
  "municipio_ibge",
  "uf",
  "cab_orgao_origem",
  "cab_sigla",
  "cab_cgc_cpf",
  "cab_orgao_destino",
  "cab_destino_tipo",
  "cab_versao",
  "cor_relatorio",
  "logo_relatorio",
];
const mudouOrg = (a: OrganizacaoAdmin | null, b: OrganizacaoAdmin | null) =>
  Boolean(a && b && CAMPOS_ORG.some((k) => (a[k] ?? null) !== (b[k] ?? null)));

function Admin() {
  const busca = Route.useSearch();
  const navigate = useNavigate({ from: "/admin" });
  const { confirmar, dialogo } = useConfirmar();

  const [pessoas, setPessoas] = useState<PessoaAdmin[]>([]);
  const [vinculos, setVinculos] = useState<VinculoAdmin[]>([]);
  const [perms, setPerms] = useState<PermissaoCat[]>([]);
  const [cargoDefaults, setCargoDefaults] = useState<Record<string, string[]>>({});
  const [estabPorOrg, setEstabPorOrg] = useState<Record<string, EstabelecimentoOrg[]>>({});
  const [organizacoes, setOrganizacoes] = useState<OrganizacaoAdmin[]>([]);
  const [leituras, setLeituras] = useState<LeituraLog[]>([]);
  const [donos, setDonos] = useState<DonoSistema[]>([]);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [criarContaAberto, setCriarContaAberto] = useState(false);
  const [criarPrefAberto, setCriarPrefAberto] = useState(false);

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
  const cargos = useMemo(() => Object.keys(cargoDefaults).sort(), [cargoDefaults]);

  const defaultsDaPessoa = useCallback(
    (pessoa: PessoaAdmin) => {
      const s = new Set<string>();
      for (const papel of pessoa.papeis) for (const c of cargoDefaults[papel] ?? []) s.add(c);
      return s;
    },
    [cargoDefaults],
  );

  // Conta do dono do sistema (super-admin): intocável por quem não é super-admin. O banco
  // também bloqueia (defesa em profundidade); aqui evitamos a tentativa e avisamos.
  const protegido = (userId: string) => !superAdmin && donos.some((d) => d.user_id === userId);
  const avisarProtegido = () =>
    toast.error("Conta do dono do sistema — só o próprio dono pode alterar.");

  // ---------- Handlers (mesmas RPCs e mensagens de antes) ----------
  const definirPessoa = async (pessoa: PessoaAdmin, codigo: string, alvo: boolean | null) => {
    if (protegido(pessoa.user_id)) return avisarProtegido();
    setSalvando(`${pessoa.user_id}:${codigo}`);
    try {
      await definirPermissaoPessoa(pessoa.user_id, pessoa.organizacao_id, codigo, alvo);
      await recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar permissão.");
    } finally {
      setSalvando(null);
    }
  };

  // Override por UNIDADE (um vínculo).
  const definirVinculo = async (v: VinculoAdmin, codigo: string, alvo: boolean | null) => {
    if (protegido(v.user_id)) return avisarProtegido();
    setSalvando(`${v.vinculo_id}:${codigo}`);
    try {
      await definirPermissao(v.vinculo_id, codigo, alvo);
      await recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar permissão.");
    } finally {
      setSalvando(null);
    }
  };

  // Mesmo alvo (true=liberar, false=bloquear, null=padrão do cargo) para várias permissões.
  const definirGrupo = async (pessoa: PessoaAdmin, codigos: string[], alvo: boolean | null) => {
    if (protegido(pessoa.user_id)) return avisarProtegido();
    if (codigos.length === 0) return;
    setSalvando(`${pessoa.user_id}:grupo`);
    try {
      for (const c of codigos)
        await definirPermissaoPessoa(pessoa.user_id, pessoa.organizacao_id, c, alvo);
      await recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar permissões.");
    } finally {
      setSalvando(null);
    }
  };

  const definirGrupoVinculo = async (v: VinculoAdmin, codigos: string[], alvo: boolean | null) => {
    if (protegido(v.user_id)) return avisarProtegido();
    if (codigos.length === 0) return;
    setSalvando(`${v.vinculo_id}:grupo`);
    try {
      for (const c of codigos) await definirPermissao(v.vinculo_id, c, alvo);
      await recarregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar permissões.");
    } finally {
      setSalvando(null);
    }
  };

  const trocarCargo = async (pessoa: PessoaAdmin, papel: string) => {
    if (protegido(pessoa.user_id)) return avisarProtegido();
    if (!papel || papel === (pessoa.papeis.length === 1 ? pessoa.papeis[0] : "")) return;
    const ok = await confirmar({
      titulo: "Trocar o cargo?",
      descricao: (
        <>
          <p>
            Trocar o cargo de <strong className="text-foreground">{tituloPessoa(pessoa)}</strong>{" "}
            para “{nomeCargo(papel)}”?
          </p>
          <p>As permissões voltam ao pacote do cargo (ajustes por unidade são descartados).</p>
        </>
      ),
      confirmarRotulo: "Trocar cargo",
    });
    if (!ok) return;
    setSalvando(`${pessoa.user_id}:cargo`);
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

  const vincular = async (pessoa: PessoaAdmin, cnes: string, papel: string) => {
    if (protegido(pessoa.user_id)) return avisarProtegido();
    setSalvando(`${pessoa.user_id}:vinc`);
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
    if (protegido(pessoa.user_id)) return avisarProtegido();
    const ok = await confirmar({
      titulo: "Desvincular unidade?",
      descricao: (
        <>
          <p>
            Desvincular <strong className="text-foreground">{tituloPessoa(pessoa)}</strong> do CNES{" "}
            <span className="font-mono">{cnes}</span>?
          </p>
          <p>O acesso é encerrado agora; o histórico do vínculo é preservado.</p>
        </>
      ),
      confirmarRotulo: "Desvincular",
      destrutivo: true,
    });
    if (!ok) return;
    setSalvando(`${pessoa.user_id}:${cnes}:desvinc`);
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

  // Exclui a pessoa (remove todos os vínculos da org). Ação destrutiva — confirmação.
  const excluir = async (pessoa: PessoaAdmin) => {
    if (protegido(pessoa.user_id)) return avisarProtegido();
    const ok = await confirmar({
      titulo: "Excluir usuário desta prefeitura?",
      descricao: (
        <>
          <p>
            Excluir o usuário <strong className="text-foreground">{tituloPessoa(pessoa)}</strong> (
            {pessoa.email}) desta organização?
          </p>
          <p>
            Todos os vínculos e permissões dele serão{" "}
            <strong className="text-foreground">removidos</strong> e o acesso, encerrado. A conta de
            login continua existindo, mas sem acesso a nada. Esta ação não pode ser desfeita aqui.
          </p>
        </>
      ),
      confirmarRotulo: "Excluir usuário",
      destrutivo: true,
    });
    if (!ok) return;
    setSalvando(`${pessoa.user_id}:excluir`);
    try {
      await excluirPessoa(pessoa.user_id, pessoa.organizacao_id);
      await recarregar();
      toast.success(`Usuário ${pessoa.email} excluído da organização.`);
      if (busca.usuario === pessoa.user_id)
        void navigate({ search: (s: BuscaAdmin) => ({ ...s, usuario: undefined }) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir o usuário.");
    } finally {
      setSalvando(null);
    }
  };

  const criarContaNova = async (
    email: string,
    senha: string,
    cnes: string,
    papel: string,
    nome: string,
    cns: string,
  ) => {
    setSalvando("criar-conta");
    try {
      await criarConta(email, senha, cnes, papel, nome, cns);
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
        cor_relatorio: o.cor_relatorio ?? null,
        logo_relatorio: o.logo_relatorio ?? null,
      });
      limparCacheLogoOrg();
      await recarregar();
      toast.success("Organização salva.");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar organização.");
      return false;
    } finally {
      setSalvando(null);
    }
  };

  const gravarGestao = async (o: OrganizacaoAdmin, g: GestaoForm) => {
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

  // ---------- Prefeitura aberta + formulário compartilhado (Arquivo / Relatórios) ----------
  const org = busca.pref ? (organizacoes.find((o) => o.id === busca.pref) ?? null) : null;
  const [formOrg, setFormOrg] = useState<OrganizacaoAdmin | null>(null);
  useEffect(() => {
    setFormOrg(org);
    // Só ao trocar de prefeitura (ou quando ela chega do banco); recarregar por outra ação não
    // apaga o que está sendo editado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id]);
  const sujo = mudouOrg(formOrg, org);
  const setCampoOrg = <K extends keyof OrganizacaoAdmin>(k: K, v: OrganizacaoAdmin[K]) =>
    setFormOrg((p) => (p ? { ...p, [k]: v } : p));
  const salvarForm = async () => {
    if (formOrg) await gravarOrganizacao(formOrg);
  };

  // Navegação: pergunta antes de sair com alteração não salva (Arquivo ↔ Relatórios não perde nada).
  const irPara = async (nova: BuscaAdmin, opts: { replace?: boolean } = {}) => {
    const saiDoForm =
      nova.pref !== busca.pref || (nova.aba !== "arquivo" && nova.aba !== "relatorios");
    if (sujo && saiDoForm) {
      const ok = await confirmar({
        titulo: "Descartar alterações?",
        descricao: (
          <p>
            Há alterações não salvas no arquivo magnético ou na identidade dos relatórios. Se sair
            agora, elas serão perdidas.
          </p>
        ),
        confirmarRotulo: "Descartar e sair",
        destrutivo: true,
      });
      if (!ok) return;
      setFormOrg(org);
    }
    void navigate({ search: nova, replace: opts.replace });
  };

  const hojeISO = new Date().toISOString().slice(0, 10);
  const semAcesso = !carregando && pessoas.length === 0 && organizacoes.length === 0 && !superAdmin;
  const handlers: HandlersUsuario = {
    onTrocarCargo: trocarCargo,
    onVincular: vincular,
    onDesvincular: desvincular,
    onExcluir: excluir,
    onDefinirPessoa: definirPessoa,
    onDefinirVinculo: definirVinculo,
    onDefinirGrupo: definirGrupo,
    onDefinirGrupoVinculo: definirGrupoVinculo,
  };

  let conteudo: ReactNode;
  if (carregando) {
    conteudo = (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </div>
    );
  } else if (semAcesso) {
    conteudo = (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-[14px] text-amber-900">
        Você não administra nenhuma organização (precisa da permissão “gerenciar vínculos”).
      </p>
    );
  } else if (busca.pref && !org) {
    conteudo = (
      <div className="space-y-3 rounded-2xl border border-border bg-card px-5 py-6 text-sm">
        <p>Prefeitura não encontrada ou sem acesso.</p>
        <button type="button" className={btnPrimario} onClick={() => void navigate({ search: {} })}>
          Voltar para prefeituras
        </button>
      </div>
    );
  } else if (org && formOrg) {
    const aba: AbaPref = busca.aba && busca.aba !== "lgpd" ? busca.aba : "usuarios";
    const pessoasOrg = pessoas.filter((p) => p.organizacao_id === org.id);
    const estabs = estabPorOrg[org.id] ?? [];
    const pessoaSel = busca.usuario
      ? (pessoasOrg.find((p) => p.user_id === busca.usuario) ?? null)
      : null;
    const painel = pessoaSel ? (
      <UsuarioPainel
        key={pessoaSel.user_id}
        pessoa={pessoaSel}
        ehDono={donos.some((d) => d.user_id === pessoaSel.user_id)}
        permsOrg={permsOrg}
        permsCnes={permsCnes}
        defaults={defaultsDaPessoa(pessoaSel)}
        cargos={cargos}
        vinculos={vinculos.filter(
          (v) =>
            v.user_id === pessoaSel.user_id &&
            v.organizacao_id === org.id &&
            (v.fim === null || v.fim >= hojeISO),
        )}
        estabelecimentos={estabs}
        cargoDefaults={cargoDefaults}
        salvando={salvando}
        onFechar={() =>
          void navigate({ search: (s: BuscaAdmin) => ({ ...s, usuario: undefined }) })
        }
        h={handlers}
      />
    ) : null;
    conteudo = (
      <div className="space-y-6">
        <PrefeituraHeader
          org={org}
          nUsuarios={pessoasOrg.length}
          nUnidades={estabs.length}
          aba={aba}
          onAba={(a) => void irPara({ pref: org.id, aba: a })}
          onVoltar={() => void irPara({})}
        />
        {aba === "usuarios" && (
          <UsuariosAba
            pessoas={pessoasOrg}
            estabelecimentos={estabs}
            cargos={cargos}
            perms={perms}
            defaultsDaPessoa={defaultsDaPessoa}
            usuarioSel={pessoaSel?.user_id ?? null}
            filtroCnes={busca.unidade ?? ""}
            onFiltroCnes={(c) =>
              void navigate({
                search: (s: BuscaAdmin) => ({ ...s, unidade: c || undefined }),
                replace: true,
              })
            }
            onSelecionar={(id) =>
              void navigate({ search: (s: BuscaAdmin) => ({ ...s, usuario: id ?? undefined }) })
            }
            onCriarConta={() => setCriarContaAberto(true)}
            painel={painel}
          />
        )}
        {aba === "unidades" && (
          <UnidadesAba
            estabelecimentos={estabs}
            pessoas={pessoasOrg}
            salvando={salvando === `estab:${org.id}`}
            onAdicionar={(cnes, nome) => adicionarCnes(org, cnes, nome)}
            onVerUsuarios={(cnes) => void irPara({ pref: org.id, aba: "usuarios", unidade: cnes })}
          />
        )}
        {aba === "arquivo" && <ArquivoMagneticoAba o={formOrg} set={setCampoOrg} />}
        {aba === "relatorios" && (
          <RelatoriosGestaoAba
            org={org}
            o={formOrg}
            set={setCampoOrg}
            salvandoOrg={salvando === `org:${org.id}`}
            salvandoGestao={salvando === `gestao:${org.id}`}
            onSalvarIdentidade={() => void salvarForm()}
            onSalvarGestao={(g) => void gravarGestao(org, g)}
          />
        )}
        {(aba === "arquivo" || aba === "relatorios") && (
          <SalvarBarra
            visivel={sujo}
            salvando={salvando === `org:${org.id}`}
            onDescartar={() => setFormOrg(org)}
            onSalvar={() => void salvarForm()}
          />
        )}
        <CriarContaDialog
          aberto={criarContaAberto}
          onAberto={setCriarContaAberto}
          orgs={[{ id: org.id, nome: org.nome }]}
          orgNome={org.nome}
          cargos={cargos}
          cargoDefaults={cargoDefaults}
          perms={perms}
          estabPorOrg={estabPorOrg}
          criando={salvando === "criar-conta"}
          onCriar={criarContaNova}
        />
      </div>
    );
  } else {
    const abaInicio = busca.aba === "lgpd" ? "lgpd" : "prefeituras";
    conteudo = (
      <div className="space-y-5">
        <div
          role="tablist"
          aria-label="Seções da administração"
          className="flex gap-1 border-b border-border"
        >
          {[
            { id: "prefeituras", rotulo: "Prefeituras" },
            { id: "lgpd", rotulo: "Auditoria LGPD" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={abaInicio === t.id}
              onClick={() => void navigate({ search: t.id === "lgpd" ? { aba: "lgpd" } : {} })}
              className={cn(
                "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold transition-colors",
                abaInicio === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.rotulo}
            </button>
          ))}
        </div>
        {abaInicio === "lgpd" ? (
          <AuditoriaLgpd leituras={leituras} />
        ) : (
          <PrefeiturasLista
            organizacoes={organizacoes}
            estabPorOrg={estabPorOrg}
            pessoas={pessoas}
            donos={donos}
            leituras={leituras}
            onAbrir={(id) => void navigate({ search: { pref: id, aba: "usuarios" } })}
            onVerAuditoria={() => void navigate({ search: { aba: "lgpd" } })}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <main className="mx-auto mt-6 max-w-[1280px] px-4">
        {!org && (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <PageHeader
              icon={ShieldCheck}
              titulo="Prefeituras e acessos"
              descricao="Escolha uma prefeitura para gerenciar usuários, unidades, arquivo magnético e relatórios."
            />
            {superAdmin && !carregando && (
              <button
                type="button"
                className={btnPrimario}
                onClick={() => setCriarPrefAberto(true)}
              >
                <Plus className="size-4" /> Nova prefeitura
              </button>
            )}
          </div>
        )}
        {conteudo}
      </main>
      {superAdmin && (
        <CriarPrefeituraDialog
          aberto={criarPrefAberto}
          onAberto={setCriarPrefAberto}
          criando={salvando === "criar-prefeitura"}
          onCriar={criarPrefeitura}
        />
      )}
      {dialogo}
    </div>
  );
}
