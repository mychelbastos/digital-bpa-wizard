import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ambulance, Plus, Search, X, Loader2, Save, MapPin, Receipt, ChevronDown, Users, Pencil, Trash2, FileBarChart, Download, FileText, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import { carregarVinculosUsuario } from "@/lib/dashboard-producao";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { cnesComPermissao } from "@/lib/permissoes";
import { buscarProfissionais, buscarCbosVinculo } from "@/lib/bpa-i-v2/profissionais";
import {
  buscarPacientes, carregarPaciente, registrarLeituraPaciente, pacienteFaltando, type Paciente,
} from "@/lib/pacientes";
import { PacientePicker, PacienteForm } from "@/components/pacientes/PacientePicker";
import { ExcluirPacienteModal } from "@/components/pacientes/ExcluirPacienteModal";
import { campo, label, digitos, UFS, ROTULO_CAMPO, ComboField } from "@/components/pacientes/ui";
import {
  orgDoCnes, listarDestinos, salvarDestino, atualizarDestino, excluirDestino, valoresVigentes, valoresTfdDetalhado, definirValorVigente,
  listarTfd, salvarTfd, atualizarStatusTfd, excluirTfd, carregarTfd, gerarFaturamentoMes, previaTfd,
  listarTfdsDoPaciente, carregarRelatorioTfd, CNES_TFD,
  type TfdDestino, type TfdRegistroView, type TfdStatus, type TfdHistoricoItem, type TfdEdicao, type TfdRelatorioRow,
} from "@/lib/tfd/tfd";
import { CODIGOS_TFD } from "@/lib/relatorios/tfd-rel";
import { MUNICIPIOS_IBGE } from "@/lib/bpa-i-v2/municipios-ibge";
import { carregarLogoOrg, carregarCorOrg } from "@/lib/org-logo";
import { construirPdfTfd } from "@/lib/tfd/relatorio-tfd";

export const Route = createFileRoute("/tfd")({
  validateSearch: (s: Record<string, unknown>): { cnes?: string; comp?: string } => ({
    cnes: typeof s.cnes === "string" ? s.cnes : undefined,
    comp: typeof s.comp === "string" && /^\d{6}$/.test(s.comp) ? s.comp : undefined,
  }),
  head: () => ({ meta: [{ title: "TFD — Tratamento Fora de Domicílio" }] }),
  component: TfdPage,
});

const competenciaAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const compLabel = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : c);
// Competência de trabalho do TFD: mês atual + 3 anteriores (mesma regra de retenção; meses
// mais antigos só via relatórios). Registro/edição ficam limitados a estas 4 competências.
const competenciasRecentes = (): string[] => {
  const d = new Date();
  return Array.from({ length: 4 }, (_, i) => {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}`;
  });
};
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Os 6 códigos/rótulos do TFD vêm de `tfd-rel` (fonte única, reusada no agrupamento por
// procedimento). Aqui são usados na tela de valores e no relatório.

const STATUS_META: Record<TfdStatus, { rotulo: string; cor: string }> = {
  agendada: { rotulo: "Agendada", cor: "bg-amber-100 text-amber-800" },
  realizada: { rotulo: "Realizada", cor: "bg-blue-100 text-blue-800" },
  faturada: { rotulo: "Faturada", cor: "bg-emerald-100 text-emerald-800" },
  cancelada: { rotulo: "Cancelada", cor: "bg-muted text-muted-foreground line-through" },
};





const MESES = [
  ["01", "Janeiro"], ["02", "Fevereiro"], ["03", "Março"], ["04", "Abril"], ["05", "Maio"], ["06", "Junho"],
  ["07", "Julho"], ["08", "Agosto"], ["09", "Setembro"], ["10", "Outubro"], ["11", "Novembro"], ["12", "Dezembro"],
];
const ANOS: string[] = (() => {
  const atual = new Date().getFullYear();
  const arr: string[] = [];
  for (let a = atual + 1; a >= atual - 4; a--) arr.push(String(a));
  return arr;
})();

// Seletor de competência (mês + ano) — evita erro de digitação. value/onChange em AAAAMM.
function CompetenciaSelect(props: { value: string; onChange: (v: string) => void; className?: string }) {
  const ano = props.value.slice(0, 4);
  const mes = props.value.slice(4, 6);
  const cls = props.className ?? campo;
  return (
    <div className="flex gap-2">
      <select value={mes} onChange={(e) => props.onChange(`${ano || String(new Date().getFullYear())}${e.target.value}`)} className={cls} data-nocaps>
        <option value="">Mês</option>
        {MESES.map(([c, nome]) => <option key={c} value={c}>{nome}</option>)}
      </select>
      <select value={ano} onChange={(e) => props.onChange(`${e.target.value}${mes || "01"}`)} className={`${cls} max-w-[6rem]`} data-nocaps>
        <option value="">Ano</option>
        {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  );
}


function TfdPage() {
  const user = useAuthUser();
  const search = Route.useSearch();
  const [cnesOpcoes, setCnesOpcoes] = useState<{ cnes: string; nome: string }[]>([]);
  const [geriveis, setGeriveis] = useState<Set<string>>(new Set());
  const [reabriveis, setReabriveis] = useState<Set<string>>(new Set());
  const [cnes, setCnes] = useState(search.cnes ?? "");
  const [competencia, setCompetencia] = useState(search.comp ?? competenciaAtual());
  const [orgId, setOrgId] = useState<string | null>(null);
  const [destinos, setDestinos] = useState<TfdDestino[]>([]);
  const [valores, setValores] = useState<Record<string, number>>({});
  const [registros, setRegistros] = useState<TfdRegistroView[]>([]);
  const [loading, setLoading] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<TfdEdicao | null>(null);
  const [valoresAberto, setValoresAberto] = useState(false);
  const [pacientesAberto, setPacientesAberto] = useState(false);
  const [destinosAberto, setDestinosAberto] = useState(false);
  const [relatoriosAberto, setRelatoriosAberto] = useState(false);
  const [carregouUnidades, setCarregouUnidades] = useState(false);

  const podeGerir = cnes ? geriveis.has(cnes) : false;
  const podeReabrir = cnes ? reabriveis.has(cnes) : false; // pode alterar TFD já faturado
  const nomeUnidade = cnesOpcoes.find((o) => o.cnes === cnes)?.nome ?? cnes;
  const semAcesso = carregouUnidades && cnesOpcoes.length === 0;

  // Só as unidades habilitadas para o TFD em que o usuário tem vínculo + onde pode gerir.
  useEffect(() => {
    (async () => {
      const [vincs, ger, reab] = await Promise.all([carregarVinculosUsuario(), cnesComPermissao("gerir_tfd"), cnesComPermissao("reabrir_producao")]);
      const unicos = [...new Set(vincs.map((v) => v.cnes).filter(Boolean))].filter((c) => CNES_TFD.includes(c));
      const nomes = await Promise.all(unicos.map(async (c) => ({ cnes: c, nome: (await buscarEstabelecimento(c)) || c })));
      setCnesOpcoes(nomes);
      setGeriveis(new Set(ger));
      setReabriveis(new Set(reab));
      // Padrão: Secretaria Municipal (2510375) quando o usuário tem vínculo nela.
      const padrao = unicos.includes("2510375") ? "2510375" : unicos[0];
      if (padrao) setCnes((atual) => (atual && unicos.includes(atual) ? atual : padrao));
      setCarregouUnidades(true);
    })();
  }, []);

  // Resolve org do CNES + carrega catálogos/valores.
  useEffect(() => {
    if (!cnes) { setOrgId(null); return; }
    (async () => {
      const org = await orgDoCnes(cnes);
      setOrgId(org);
      if (org) {
        const [dest, vals] = await Promise.all([listarDestinos(org), valoresVigentes(org, cnes, competencia)]);
        setDestinos(dest);
        setValores(vals);
      }
    })();
  }, [cnes, competencia]);

  const carregar = useCallback(async () => {
    if (!cnes || !competencia) { setRegistros([]); return; }
    setLoading(true);
    setRegistros(await listarTfd(cnes, competencia));
    setLoading(false);
  }, [cnes, competencia]);
  useEffect(() => { carregar(); }, [carregar]);

  const recarregarDestinos = useCallback(async () => {
    if (orgId) setDestinos(await listarDestinos(orgId));
  }, [orgId]);

  // Total do mês = soma dos totais por paciente (valores guardados em tfd_linhas).
  const totalMesRS = useMemo(() => registros.reduce((s, r) => s + r.total_rs, 0), [registros]);

  const [faturando, setFaturando] = useState(false);
  // Faturamento do mês: consolida todos os TFDs da competência em fichas BPA-I (1 por
  // profissional responsável), que o Fechamento transforma no .txt do BPA Magnético.
  const faturarMes = async () => {
    if (!podeGerir || !cnes || !competencia) return;
    setFaturando(true);
    const res = await gerarFaturamentoMes(cnes, competencia, nomeUnidade, { nome: user?.nome ?? "", cns: user?.cns ?? "" });
    setFaturando(false);
    if (!res) { toast.error("Falha ao gerar o faturamento. Verifique sua permissão."); return; }
    if (res.tfds === 0) { toast.info("Nenhum TFD para faturar neste mês."); return; }
    let msg = `${res.fichas} ficha(s) BPA-I geradas (${res.tfds} TFD, ${res.seqs} seqs).`;
    if (res.semProf > 0) msg += ` ${res.semProf} sem profissional responsável — não faturados.`;
    toast.success(msg);
    carregar();
  };

  // TFD faturado só pode ser alterado por quem reabre produção (trava do fechamento).
  const travado = (r: TfdRegistroView) => r.status === "faturada" && !podeReabrir;
  const avisoTravado = () => toast.error("TFD faturado. Só quem pode reabrir a produção do mês altera este TFD.");

  const mudarStatus = async (r: TfdRegistroView, status: TfdStatus) => {
    if (!podeGerir) return;
    if (travado(r)) { avisoTravado(); return; }
    const res = await atualizarStatusTfd(r.id, status);
    if (res.ok) { toast.success(`Status: ${STATUS_META[status].rotulo}.`); carregar(); }
    else toast.error(res.erro || "Não foi possível mudar o status.");
  };

  const editarTfd = async (r: TfdRegistroView) => {
    if (!podeGerir) return;
    if (travado(r)) { avisoTravado(); return; }
    const ed = await carregarTfd(r.id);
    if (!ed) { toast.error("Não consegui carregar o TFD."); return; }
    setEditando(ed);
    setFormAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removerTfd = async (r: TfdRegistroView) => {
    if (!podeGerir) return;
    if (travado(r)) { avisoTravado(); return; }
    if (!window.confirm(`Excluir o TFD de ${r.paciente_nome || "paciente"} (${compLabel(r.competencia)})?`)) return;
    const res = await excluirTfd(r.id);
    if (res.ok) { toast.success("TFD excluído."); carregar(); }
    else toast.error(res.erro || "Falha ao excluir o TFD.");
  };

  // Ao salvar o form: se o TFD editado já estava faturado, atualiza a MESMA ficha (sem gerar nova).
  const aoSalvarForm = async () => {
    const eraFaturada = Boolean(editando && (editando.tfd.ficha_id || editando.tfd.status === "faturada"));
    fecharForm();
    if (eraFaturada) await gerarFaturamentoMes(cnes, competencia, nomeUnidade, { nome: user?.nome ?? "", cns: user?.cns ?? "" });
    carregar();
  };

  const abrirNovo = () => { setEditando(null); setFormAberto(true); };
  const fecharForm = () => { setFormAberto(false); setEditando(null); };

  if (semAcesso) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <PageHeader icon={Ambulance} titulo="TFD" descricao="Tratamento Fora de Domicílio — gera a produção da Central de Regulação." />
        <div className="mt-6 rounded-lg border border-border bg-card p-6 text-center text-sm font-semibold text-muted-foreground">
          SEM PERMISSÃO DE ACESSO
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Cabeçalho */}
      <PageHeader icon={Ambulance} titulo="TFD" descricao="Tratamento Fora de Domicílio — gera a produção da Central de Regulação." />

      {podeGerir && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPacientesAberto(true)}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
            <Users className="size-4" /> Pacientes
          </button>
          <button type="button" onClick={() => setDestinosAberto(true)}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
            <MapPin className="size-4" /> Destinos
          </button>
          <button type="button" onClick={() => setRelatoriosAberto(true)}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
            <FileBarChart className="size-4" /> Relatórios
          </button>
          <button type="button" onClick={faturarMes} disabled={faturando || registros.length === 0}
            className="flex items-center gap-2 rounded-md border border-primary/40 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            title="Consolida os TFDs do mês em fichas BPA-I (por profissional)">
            {faturando ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />} Gerar faturamento do mês
          </button>
          <button type="button" onClick={abrirNovo}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> Novo TFD
          </button>
        </div>
      )}

      {pacientesAberto && orgId && (
        <PacientesPanel orgId={orgId} onFechar={() => setPacientesAberto(false)} />
      )}
      {destinosAberto && orgId && (
        <DestinosPanel orgId={orgId} onFechar={() => setDestinosAberto(false)} onMudou={recarregarDestinos} />
      )}
      {relatoriosAberto && (
        <RelatoriosPanel cnes={cnes} nomeUnidade={nomeUnidade} competencia={competencia} onFechar={() => setRelatoriosAberto(false)} />
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="min-w-[220px] flex-1">
          <div className={label}>Unidade</div>
          <select value={cnes} onChange={(e) => setCnes(e.target.value)} className={campo}>
            {cnesOpcoes.length === 0 && <option value="">—</option>}
            {cnesOpcoes.map((o) => <option key={o.cnes} value={o.cnes}>{o.nome} ({o.cnes})</option>)}
          </select>
        </div>
        <div>
          <div className={label}>Competência</div>
          <select value={competencia} onChange={(e) => setCompetencia(e.target.value)} className={`${campo} w-40`} data-nocaps>
            {competenciasRecentes().map((c, i) => (
              <option key={c} value={c}>{compLabel(c)}{i === 0 ? " (atual)" : ""}</option>
            ))}
            {!competenciasRecentes().includes(competencia) && <option value={competencia}>{compLabel(competencia)}</option>}
          </select>
        </div>
        {!podeGerir && cnes && (
          <p className="text-xs text-amber-700">Você não tem permissão para gerir TFD nesta unidade (somente leitura).</p>
        )}
      </div>

      {/* Formulário de novo/editar TFD */}
      {formAberto && podeGerir && orgId && (
        <FormTfd
          key={editando?.tfd.id ?? "novo"}
          orgId={orgId} cnes={cnes} competencia={competencia} destinos={destinos} valores={valores}
          edicao={editando ?? undefined}
          onFecha={fecharForm}
          onDestinosMudou={recarregarDestinos}
          onSalvo={aoSalvarForm}
        />
      )}

      {/* Resumo do mês */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{registros.length}</span> registro(s) em {compLabel(competencia)}
        </div>
        <div className="text-sm text-muted-foreground">
          Total estimado: <span className="font-semibold text-foreground">{brl(totalMesRS)}</span>
        </div>
      </div>

      {/* Lista de registros */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Paciente</th>
              <th className="px-3 py-2 text-left">Destino</th>
              <th className="px-3 py-2 text-right">Viagens</th>
              <th className="px-3 py-2 text-right">Km</th>
              <th className="px-3 py-2 text-center">Acomp.</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                <Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
            )}
            {!loading && registros.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nenhum TFD registrado neste mês.</td></tr>
            )}
            {!loading && registros.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground">{r.paciente_nome || "—"}</div>
                  {r.paciente_cns && <div className="text-[11px] text-muted-foreground">CNS {r.paciente_cns}</div>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.destino_descricao || "—"}</td>
                <td className="px-3 py-2 text-right">{r.qtd_com_pernoite + r.qtd_sem_pernoite}
                  <span className="text-[11px] text-muted-foreground"> ({r.qtd_com_pernoite}c/{r.qtd_sem_pernoite}s)</span>
                </td>
                <td className="px-3 py-2 text-right">{r.distancia_km}</td>
                <td className="px-3 py-2 text-center" title={r.acompanhante_nome ?? ""}>
                  {r.tem_acompanhante ? (r.acompanhante_nome ? "Sim ✓" : "Sim ⚠") : "—"}
                </td>
                <td className="px-3 py-2 text-right font-medium">{brl(r.total_rs)}</td>
                <td className="px-3 py-2 text-center">
                  {podeGerir && !travado(r) ? (
                    <select value={r.status} onChange={(e) => mudarStatus(r, e.target.value as TfdStatus)}
                      className={`cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-medium outline-none ${STATUS_META[r.status].cor}`}>
                      <option value="agendada">Agendada</option>
                      <option value="realizada">Realizada</option>
                      <option value="faturada">Faturada</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  ) : (
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_META[r.status].cor}`}>{STATUS_META[r.status].rotulo}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {podeGerir && (
                    <div className="flex justify-end gap-1">
                      {r.status === "faturada" && r.ficha_id && (
                        <Link to="/minhas-fichas" title="Ver ficha BPA-I gerada" className="rounded border border-border p-1 text-primary hover:bg-muted">
                          <FileText className="size-3.5" />
                        </Link>
                      )}
                      {travado(r) ? (
                        <span title="TFD faturado — travado (requer permissão de reabrir produção)" className="rounded border border-border p-1 text-muted-foreground">
                          <Lock className="size-3.5" />
                        </span>
                      ) : (
                        <>
                          <button type="button" onClick={() => editarTfd(r)} title="Editar TFD" className="rounded border border-border p-1 hover:bg-muted">
                            <Pencil className="size-3.5" />
                          </button>
                          <button type="button" onClick={() => removerTfd(r)} title="Excluir TFD" className="rounded border border-border p-1 text-destructive hover:bg-destructive/10">
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Valores (vigência) */}
      <div className="mt-4 rounded-lg border border-border">
        <button type="button" onClick={() => setValoresAberto((a) => !a)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
          <span className="flex items-center gap-2"><Receipt className="size-4 text-primary" /> Valores unitários ({compLabel(competencia)})</span>
          <ChevronDown className={`size-4 transition-transform ${valoresAberto ? "" : "-rotate-90"}`} />
        </button>
        {valoresAberto && orgId && (
          <TabelaValores orgId={orgId} cnes={cnes} competencia={competencia} podeEditar={podeGerir}
            onSalvo={async () => setValores(await valoresVigentes(orgId, cnes, competencia))} userId={user?.id ?? null} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulário de novo TFD.
// ---------------------------------------------------------------------------
function FormTfd(props: {
  orgId: string; cnes: string; competencia: string; destinos: TfdDestino[]; valores: Record<string, number>;
  edicao?: TfdEdicao; onFecha: () => void; onDestinosMudou: () => void; onSalvo: () => void;
}) {
  const { orgId, cnes, competencia, destinos, valores, edicao } = props;
  const et = edicao?.tfd;
  const [paciente, setPaciente] = useState<Paciente | null>(edicao?.paciente ?? null);
  const [destinoId, setDestinoId] = useState(et?.destino_id ?? "");
  const [distanciaKm, setDistanciaKm] = useState(et ? String(et.distancia_km) : "0");
  // Lista de viagens: cada uma com data + pernoite. Começa com uma linha vazia (ou as da edição).
  const [viagens, setViagens] = useState<{ data: string; pernoite: "com" | "sem" }[]>(
    et?.viagens?.length ? et.viagens.map((v) => ({ data: v.data, pernoite: v.pernoite })) : [{ data: "", pernoite: "sem" }],
  );
  const [temAcomp, setTemAcomp] = useState(et?.tem_acompanhante ?? false);
  const [acompanhante, setAcompanhante] = useState<Paciente | null>(edicao?.acompanhante ?? null);
  const [profCns, setProfCns] = useState(et?.prof_cns ?? "");
  const [profNome, setProfNome] = useState(et?.prof_nome ?? "");
  const [profCbo, setProfCbo] = useState(et?.prof_cbo ?? "");
  const [obs, setObs] = useState(et?.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [novoDestino, setNovoDestino] = useState(false);
  // Override manual do valor unitário por código (senão usa o vigente da org).
  const [valorOverride, setValorOverride] = useState<Record<string, string>>({});

  const aoEscolherDestino = (id: string) => {
    setDestinoId(id);
    const d = destinos.find((x) => x.id === id);
    if (d) setDistanciaKm(String(d.distancia_km));
  };

  // Acompanhante HABITUAL do paciente (vindo do cadastro dele) — guardado p/ pré-selecionar
  // tanto na escolha do paciente quanto ao (re)marcar "tem acompanhante".
  const acompHabitualRef = useRef<Paciente | null>(edicao?.acompanhante ?? null);

  // Acompanhante habitual do cadastro do paciente. Carrega SEMPRE (inclusive na edição) para
  // ficar disponível ao marcar "tem acompanhante"; mas só auto-seleciona num TFD NOVO (na
  // edição preserva o que já estava gravado — só serve de sugestão se o campo estiver vazio).
  useEffect(() => {
    const accId = paciente?.acompanhante_id;
    if (!accId) { if (!edicao) acompHabitualRef.current = null; return; }
    carregarPaciente(accId, false).then((ac) => {
      if (!ac) return;
      if (!acompHabitualRef.current) acompHabitualRef.current = ac; // não sobrescreve o acompanhante já salvo no TFD
      if (!edicao) { setTemAcomp(true); setAcompanhante(ac); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paciente?.id]);

  // Marca/desmarca "tem acompanhante": ao marcar, pré-seleciona o acompanhante habitual do
  // paciente (se houver e nenhum estiver selecionado) — evita ter de buscá-lo à mão.
  const aoMarcarAcompanhante = (v: boolean) => {
    setTemAcomp(v);
    if (v && !acompanhante && acompHabitualRef.current) setAcompanhante(acompHabitualRef.current);
  };

  const viagensValidas = viagens.filter((v) => v.data);
  const comP = viagensValidas.filter((v) => v.pernoite === "com").length;
  const semP = viagensValidas.filter((v) => v.pernoite === "sem").length;
  const entrada = {
    distanciaKm: Number(distanciaKm) || 0,
    qtdComPernoite: comP,
    qtdSemPernoite: semP,
    temAcompanhante: temAcomp,
  };
  const setViagem = (i: number, patch: Partial<{ data: string; pernoite: "com" | "sem" }>) =>
    setViagens((vs) => vs.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const addViagem = () => setViagens((vs) => [...vs, { data: "", pernoite: "sem" }]);
  const removeViagem = (i: number) => setViagens((vs) => (vs.length > 1 ? vs.filter((_, k) => k !== i) : vs));
  const valorDe = (codigo: string) =>
    valorOverride[codigo] !== undefined ? Number(valorOverride[codigo].replace(",", ".")) || 0 : (valores[codigo] ?? 0);
  const linhas = previaTfd(entrada);
  const linhasComValor = linhas.map((l) => ({ codigo: l.codigo, quantidade: l.quantidade, para: l.para, valor_unitario: valorDe(l.codigo) }));
  const totalRS = linhasComValor.reduce((s, l) => s + l.quantidade * l.valor_unitario, 0);

  const salvar = async () => {
    if (!paciente) { toast.error("Selecione ou cadastre o paciente."); return; }
    if (!destinoId) { toast.error("Selecione um destino para o TFD."); return; }
    if (viagensValidas.length === 0) { toast.error("Adicione ao menos uma viagem com data."); return; }
    if (temAcomp && !acompanhante) { toast.error("Cadastre/selecione o acompanhante (ou desmarque acompanhante)."); return; }
    setSalvando(true);
    const res = await salvarTfd(et?.id ?? null, {
      organizacao_id: orgId, cnes, competencia, paciente_id: paciente.id,
      destino_id: destinoId || null, distancia_km: Number(distanciaKm) || 0,
      viagens: viagensValidas, tem_acompanhante: temAcomp,
      acompanhante_id: temAcomp ? acompanhante?.id ?? null : null,
      prof_cns: profCns, prof_nome: profNome, prof_cbo: profCbo, observacoes: obs,
      ...(et ? {} : { status: "agendada" as const }),
    }, linhasComValor);
    setSalvando(false);
    if (!res.id) { toast.error(res.erro || "Falha ao salvar o TFD."); return; }
    if (res.erro) toast.warning(res.erro); // salvou o TFD mas algo secundário falhou
    else toast.success(et ? "TFD atualizado." : "TFD salvo.");
    props.onSalvo();
  };

  return (
    <div className="mb-4 rounded-lg border border-primary/30 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{et ? "Editar TFD" : "Novo TFD"}</h2>
        <button type="button" onClick={props.onFecha} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>

      {/* Paciente */}
      <PacientePicker orgId={orgId} paciente={paciente} onEscolhe={setPaciente} />

      {/* Destino + distância */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <div className={label}>Destino (rota)</div>
            <button type="button" onClick={() => setNovoDestino((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <MapPin className="size-3" /> {novoDestino ? "Fechar" : "Cadastrar novo destino"}
            </button>
          </div>
          <select value={destinoId} onChange={(e) => aoEscolherDestino(e.target.value)} className={campo}>
            <option value="">— selecione —</option>
            {props.destinos.map((d) => <option key={d.id} value={d.id}>{d.descricao} · {d.distancia_km} km</option>)}
          </select>
        </div>
        <div>
          <div className={label}>Distância (km, só ida)</div>
          <input value={distanciaKm} onChange={(e) => setDistanciaKm(e.target.value.replace(/[^\d.]/g, ""))} className={campo} />
        </div>
      </div>

      {novoDestino && (
        <NovoDestino orgId={orgId} onCriado={(d) => { props.onDestinosMudou(); setNovoDestino(false); aoEscolherDestino(d.id); }} onCancela={() => setNovoDestino(false)} />
      )}

      {/* Viagens: uma linha por viagem (data + pernoite), com botão de adicionar */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <div className={label}>Viagens ({viagensValidas.length}) — {comP} c/ pernoite, {semP} s/ pernoite</div>
          <button type="button" onClick={addViagem} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Plus className="size-3" /> Adicionar viagem
          </button>
        </div>
        <div className="space-y-2">
          {viagens.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="date" value={v.data} onChange={(e) => setViagem(i, { data: e.target.value })} className={`${campo} max-w-[180px]`} />
              <select value={v.pernoite} onChange={(e) => setViagem(i, { pernoite: e.target.value as "com" | "sem" })} className={`${campo} max-w-[190px]`}>
                <option value="sem">Sem pernoite</option>
                <option value="com">Com pernoite</option>
              </select>
              <button type="button" onClick={() => removeViagem(i)} disabled={viagens.length <= 1}
                className="shrink-0 rounded-md border border-border p-2 text-muted-foreground hover:bg-muted disabled:opacity-40" title="Remover viagem">
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={temAcomp} onChange={(e) => aoMarcarAcompanhante(e.target.checked)} className="size-4" />
        Tem acompanhante
      </label>

      {temAcomp && (
        <div className="mt-2">
          <PacientePicker orgId={orgId} paciente={acompanhante} onEscolhe={setAcompanhante} titulo="Acompanhante"
            enderecoPadrao={paciente ? {
              cep: paciente.cep, cod_logradouro: paciente.cod_logradouro, logradouro: paciente.logradouro,
              numero: paciente.numero, complemento: paciente.complemento, bairro: paciente.bairro,
              municipio_nome: paciente.municipio_nome, municipio_ibge: paciente.municipio_ibge, uf: paciente.uf,
            } : undefined} emModal />
        </div>
      )}

      {/* Profissional responsável */}
      <div className="mt-3">
        <div className={label}>Profissional responsável (CBO usado no BPA-I)</div>
        <ProfPicker cnes={cnes} cns={profCns} nome={profNome} cbo={profCbo}
          onMuda={(v) => { setProfCns(v.cns); setProfNome(v.nome); setProfCbo(v.cbo); }} />
      </div>

      {/* Observações */}
      <div className="mt-3">
        <div className={label}>Observações</div>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={campo} />
      </div>

      {/* Prévia dos procedimentos + valores por paciente (editáveis) */}
      {linhas.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Procedimentos e valores deste paciente (viram seqs do BPA-I)</div>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 text-left">Código</th>
                <th className="py-1 pr-2 text-left">Procedimento</th>
                <th className="py-1 pr-2 text-right">Qtd</th>
                <th className="py-1 pr-2 text-right">Valor unit.</th>
                <th className="py-1 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.codigo}>
                  <td className="py-1 pr-2 font-mono text-xs text-muted-foreground">{l.codigo}</td>
                  <td className="py-1 pr-2">{l.descricao}</td>
                  <td className="py-1 pr-2 text-right">{l.quantidade}×</td>
                  <td className="py-1 pr-2 text-right">
                    <input
                      value={valorOverride[l.codigo] !== undefined ? valorOverride[l.codigo] : String(valores[l.codigo] ?? 0)}
                      onChange={(e) => setValorOverride((s) => ({ ...s, [l.codigo]: e.target.value.replace(/[^\d.,]/g, "") }))}
                      className="w-20 rounded border border-border bg-background px-2 py-0.5 text-right text-sm outline-none focus:border-primary" />
                  </td>
                  <td className="py-1 text-right text-muted-foreground">{brl(l.quantidade * valorDe(l.codigo))}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td colSpan={4} className="py-1 text-right">Total do paciente</td>
                <td className="py-1 text-right">{brl(totalRS)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={props.onFecha} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando || !paciente}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar TFD
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel de Pacientes do TFD: buscar, ver/editar cadastro e histórico de viagens/fichas.
// ---------------------------------------------------------------------------
function PacientesPanel(props: { orgId: string; onFechar: () => void }) {
  const [termo, setTermo] = useState("");
  const [sugestoes, setSugestoes] = useState<Paciente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState<Paciente | null>(null);
  const [editando, setEditando] = useState(false);
  const [historico, setHistorico] = useState<TfdHistoricoItem[]>([]);
  const [carregandoHist, setCarregandoHist] = useState(false);
  const [excluirOpen, setExcluirOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (sel) return;
    if (timer.current) clearTimeout(timer.current);
    const q = termo.trim();
    if (q.length < 3) { setSugestoes([]); return; }
    setBuscando(true);
    timer.current = setTimeout(async () => { setSugestoes(await buscarPacientes(props.orgId, q, true)); setBuscando(false); }, 250);
  }, [termo, props.orgId, sel]);

  const abrir = async (p: Paciente) => {
    registrarLeituraPaciente(p.id);
    setSel(p); setEditando(false); setSugestoes([]);
    setCarregandoHist(true);
    setHistorico(await listarTfdsDoPaciente(p.id));
    setCarregandoHist(false);
  };
  const recarregarHist = async (p: Paciente) => { setHistorico(await listarTfdsDoPaciente(p.id)); };

  const info = (rot: string, val: string | null | undefined) => (
    <div><div className="text-[11px] text-muted-foreground">{rot}</div><div className="text-sm">{val || "—"}</div></div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={props.onFechar}>
      <div className="mt-6 w-full max-w-3xl rounded-lg border border-border bg-card p-4 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Users className="size-4 text-primary" /> Pacientes do TFD</h2>
          <button type="button" onClick={props.onFechar} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        {!sel && (
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={termo} onChange={(e) => setTermo(e.target.value)} autoFocus placeholder="Buscar por nome, CNS ou CPF…" className={`${campo} pl-9`} />
              {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>
            <div className="mt-2 max-h-80 overflow-auto rounded-md border border-border">
              {sugestoes.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">Digite 3+ letras para buscar.</div>}
              {sugestoes.map((p) => {
                const incompleto = pacienteFaltando(p).length > 0;
                return (
                  <button key={p.id} type="button" onClick={() => abrir(p)} className="flex w-full items-center justify-between border-b border-border/50 px-3 py-2 text-left text-sm last:border-0 hover:bg-muted">
                    <span className="flex flex-col items-start">
                      <span className="font-medium">{p.nome}</span>
                      <span className="text-[11px] text-muted-foreground">{p.cns ? `CNS ${p.cns}` : p.cpf ? `CPF ${p.cpf}` : "sem documento"}</span>
                    </span>
                    {incompleto && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">incompleto</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {sel && !editando && (
          <div>
            <button type="button" onClick={() => setSel(null)} className="mb-2 text-xs text-muted-foreground hover:text-foreground">← voltar à busca</button>
            <div className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-base font-semibold text-foreground">{sel.nome}</div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setEditando(true)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                    <Pencil className="size-3" /> Editar cadastro
                  </button>
                  <button type="button" onClick={() => setExcluirOpen(true)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="size-3" /> Excluir
                  </button>
                </div>
              </div>
              {excluirOpen && (
                <ExcluirPacienteModal paciente={sel} onClose={() => setExcluirOpen(false)}
                  onExcluido={() => { setExcluirOpen(false); setSel(null); }} />
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {info("CNS", sel.cns)}
                {info("CPF", sel.cpf)}
                {info("Nascimento", sel.nascimento ? sel.nascimento.split("-").reverse().join("/") : null)}
                {info("Sexo", sel.sexo === "M" ? "Masculino" : sel.sexo === "F" ? "Feminino" : null)}
                {info("Telefone", sel.telefone)}
                {info("Município", sel.municipio_nome ? `${sel.municipio_nome}${sel.uf ? "/" + sel.uf : ""}` : null)}
                {info("Endereço", [sel.logradouro, sel.numero, sel.bairro].filter(Boolean).join(", "))}
                {info("CEP", sel.cep)}
              </div>
              {pacienteFaltando(sel).length > 0 && (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
                  Cadastro incompleto — falta: {pacienteFaltando(sel).map((f) => ROTULO_CAMPO[f] ?? f).join(", ")}.
                </div>
              )}
            </div>

            <div className="mt-3 text-xs font-semibold uppercase text-muted-foreground">Histórico de TFD</div>
            <div className="mt-1 overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left">Competência</th>
                    <th className="px-2 py-1 text-left">Papel</th>
                    <th className="px-2 py-1 text-left">Destino</th>
                    <th className="px-2 py-1 text-right">Viagens</th>
                    <th className="px-2 py-1 text-center">Status</th>
                    <th className="px-2 py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {carregandoHist && <tr><td colSpan={6} className="px-2 py-4 text-center text-muted-foreground"><Loader2 className="mx-auto size-4 animate-spin" /></td></tr>}
                  {!carregandoHist && historico.length === 0 && <tr><td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">Nenhum TFD registrado para este paciente.</td></tr>}
                  {!carregandoHist && historico.map((h) => (
                    <tr key={h.id + h.papel} className="border-t border-border">
                      <td className="px-2 py-1">{compLabel(h.competencia)}</td>
                      <td className="px-2 py-1">{h.papel === "paciente" ? "Paciente" : "Acompanhante"}</td>
                      <td className="px-2 py-1 text-muted-foreground">{h.destino_descricao || "—"}</td>
                      <td className="px-2 py-1 text-right">{h.qtd_com_pernoite + h.qtd_sem_pernoite} <span className="text-[11px] text-muted-foreground">({h.qtd_com_pernoite}c/{h.qtd_sem_pernoite}s)</span></td>
                      <td className="px-2 py-1 text-center"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_META[h.status].cor}`}>{STATUS_META[h.status].rotulo}</span></td>
                      <td className="px-2 py-1 text-right font-medium">{brl(h.total_rs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sel && editando && (
          <PacienteForm orgId={props.orgId} paciente={sel}
            onSalvo={(p) => { setSel(p); setEditando(false); recarregarHist(p); }}
            onCancela={() => setEditando(false)} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Novo destino (rota).
// ---------------------------------------------------------------------------
function NovoDestino(props: { orgId: string; onCriado: (d: TfdDestino) => void; onCancela: () => void }) {
  const [municipio, setMunicipio] = useState("");
  const [uf, setUf] = useState("");
  const [estab, setEstab] = useState("");
  const [km, setKm] = useState("0");
  const [salvando, setSalvando] = useState(false);

  // A descrição (rótulo do destino na lista) é composta automaticamente: Município — Estabelecimento.
  const descricao = [municipio.trim(), estab.trim()].filter(Boolean).join(" — ");

  const salvar = async () => {
    if (!municipio.trim()) { toast.error("Informe o município de destino."); return; }
    setSalvando(true);
    const res = await salvarDestino({
      organizacao_id: props.orgId, descricao, municipio_destino: municipio, uf_destino: uf,
      estabelecimento_destino: estab, distancia_km: Number(km) || 0,
    });
    setSalvando(false);
    if (!res.destino) { toast.error(res.erro || "Falha ao salvar o destino."); return; }
    toast.success("Destino cadastrado.");
    props.onCriado(res.destino);
  };

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-3">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Destino = a cidade para onde o paciente viaja. O <b>estabelecimento</b> é o hospital/clínica de
        referência lá (opcional). O nome do destino é montado como <i>Município — Estabelecimento</i>.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <div className={label}>Município de destino *</div>
          <ComboField value={municipio} onText={setMunicipio} opcoes={MUNICIPIOS_IBGE} minChars={3}
            placeholder="Ex.: Salvador (digite 3+ letras)…"
            onPick={(o) => {
              const [cidade, sigla] = o.label.split(" - ");
              setMunicipio((cidade || o.label).trim());
              if (sigla) setUf(sigla.trim().toUpperCase());
            }} />
        </div>
        <div>
          <div className={label}>UF</div>
          <ComboField value={uf} onText={(t) => setUf(t.toUpperCase().slice(0, 2))} opcoes={UFS} minChars={1}
            onPick={(o) => setUf(o.code)} />
        </div>
        <div>
          <div className={label}>Distância (km, só ida)</div>
          <input value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.]/g, ""))} className={campo} />
        </div>
        <div className="sm:col-span-4">
          <div className={label}>Estabelecimento de destino (hospital/clínica) — opcional</div>
          <input value={estab} onChange={(e) => setEstab(e.target.value)} placeholder="Ex.: Hospital Roberto Santos" className={campo} />
        </div>
        {descricao && (
          <div className="sm:col-span-4 text-[11px] text-muted-foreground">
            Ficará salvo como: <b>{descricao}</b>{uf ? ` (${uf})` : ""}
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={props.onCancela} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {salvando ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />} Salvar destino
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel de Destinos: listar, editar e excluir os destinos (rotas) da organização.
// ---------------------------------------------------------------------------
function DestinosPanel(props: { orgId: string; onFechar: () => void; onMudou: () => void }) {
  const [lista, setLista] = useState<TfdDestino[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [ed, setEd] = useState<{ descricao: string; municipio: string; uf: string; estab: string; km: string }>({ descricao: "", municipio: "", uf: "", estab: "", km: "0" });
  const [novo, setNovo] = useState(false);

  const recarregar = async () => { setCarregando(true); setLista(await listarDestinos(props.orgId)); setCarregando(false); };
  useEffect(() => { recarregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [props.orgId]);

  const abrirEdicao = (d: TfdDestino) => {
    setEditId(d.id);
    setEd({ descricao: d.descricao, municipio: d.municipio_destino ?? "", uf: d.uf_destino ?? "", estab: d.estabelecimento_destino ?? "", km: String(d.distancia_km) });
  };
  const salvarEdicao = async () => {
    if (!editId) return;
    const ok = await atualizarDestino(editId, {
      descricao: ed.descricao, municipio_destino: ed.municipio, uf_destino: ed.uf,
      estabelecimento_destino: ed.estab, distancia_km: Number(ed.km) || 0,
    });
    if (!ok) { toast.error("Falha ao salvar o destino."); return; }
    toast.success("Destino atualizado."); setEditId(null); await recarregar(); props.onMudou();
  };
  const remover = async (d: TfdDestino) => {
    if (!window.confirm(`Excluir o destino "${d.descricao}"?`)) return;
    if (await excluirDestino(d.id)) { toast.success("Destino excluído."); await recarregar(); props.onMudou(); }
    else toast.error("Falha ao excluir o destino.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={props.onFechar}>
      <div className="mt-6 w-full max-w-2xl rounded-lg border border-border bg-card p-4 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><MapPin className="size-4 text-primary" /> Destinos (rotas)</h2>
          <button type="button" onClick={props.onFechar} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <button type="button" onClick={() => setNovo((v) => !v)} className="mb-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Plus className="size-3" /> {novo ? "Fechar" : "Cadastrar novo destino"}
        </button>
        {novo && (
          <NovoDestino orgId={props.orgId} onCriado={async () => { setNovo(false); await recarregar(); props.onMudou(); }} onCancela={() => setNovo(false)} />
        )}

        <div className="mt-2 overflow-hidden rounded-md border border-border">
          {carregando && <div className="px-3 py-6 text-center text-muted-foreground"><Loader2 className="mx-auto size-5 animate-spin" /></div>}
          {!carregando && lista.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum destino cadastrado.</div>}
          {!carregando && lista.map((d) => (
            <div key={d.id} className="border-b border-border/50 last:border-0">
              {editId === d.id ? (
                <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-4">
                  <div className="sm:col-span-2"><div className={label}>Descrição</div><input value={ed.descricao} onChange={(e) => setEd({ ...ed, descricao: e.target.value })} className={campo} /></div>
                  <div><div className={label}>Município</div><input value={ed.municipio} onChange={(e) => setEd({ ...ed, municipio: e.target.value })} className={campo} /></div>
                  <div><div className={label}>UF</div><input value={ed.uf} onChange={(e) => setEd({ ...ed, uf: e.target.value.toUpperCase().slice(0, 2) })} className={campo} /></div>
                  <div className="sm:col-span-3"><div className={label}>Estabelecimento</div><input value={ed.estab} onChange={(e) => setEd({ ...ed, estab: e.target.value })} className={campo} /></div>
                  <div><div className={label}>Distância (km)</div><input value={ed.km} onChange={(e) => setEd({ ...ed, km: e.target.value.replace(/[^\d.]/g, "") })} className={campo} /></div>
                  <div className="flex items-end justify-end gap-2 sm:col-span-4">
                    <button type="button" onClick={() => setEditId(null)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
                    <button type="button" onClick={salvarEdicao} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Save className="size-3" /> Salvar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">{d.descricao}</div>
                    <div className="text-[11px] text-muted-foreground">{d.distancia_km} km{d.uf_destino ? ` · ${d.uf_destino}` : ""}</div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => abrirEdicao(d)} title="Editar" className="rounded border border-border p-1 hover:bg-muted"><Pencil className="size-3.5" /></button>
                    <button type="button" onClick={() => remover(d)} title="Excluir" className="rounded border border-border p-1 text-destructive hover:bg-destructive/10"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel de Relatórios: filtros por período/status + agrupamentos + CSV/impressão.
// ---------------------------------------------------------------------------
type AgrupamentoRel = "detalhado" | "competencia" | "paciente" | "profissional" | "destino" | "procedimento";
const AGRUPAMENTOS: { valor: AgrupamentoRel; rotulo: string }[] = [
  { valor: "detalhado", rotulo: "Detalhado (um por TFD)" },
  { valor: "procedimento", rotulo: "Por procedimento (produção)" },
  { valor: "competencia", rotulo: "Por competência (mês)" },
  { valor: "paciente", rotulo: "Por paciente" },
  { valor: "profissional", rotulo: "Por profissional (faturamento)" },
  { valor: "destino", rotulo: "Por destino" },
];
const ROTULO_PROC = new Map(CODIGOS_TFD.map((c) => [c.codigo, c.rotulo]));

function RelatoriosPanel(props: { cnes: string; nomeUnidade: string; competencia: string; onFechar: () => void }) {
  const [compDe, setCompDe] = useState(props.competencia);
  const [compAte, setCompAte] = useState(props.competencia);
  const [status, setStatus] = useState<"" | TfdStatus>("");
  const [agrup, setAgrup] = useState<AgrupamentoRel>("detalhado");
  const [rows, setRows] = useState<TfdRelatorioRow[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  const [cor, setCor] = useState<string | null>(null);
  useEffect(() => { carregarLogoOrg().then(setLogo); carregarCorOrg().then(setCor); }, []);

  const carregar = useCallback(async () => {
    if (!props.cnes) return;
    setCarregando(true);
    setRows(await carregarRelatorioTfd(props.cnes, compDe, compAte));
    setCarregando(false);
  }, [props.cnes, compDe, compAte]);
  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = useMemo(() => (status ? rows.filter((r) => r.status === status) : rows), [rows, status]);

  // Colunas + linhas conforme o agrupamento.
  const { colunas, dados, totalRS, totalViagens, totalProducao } = useMemo(() => {
    const viagensDe = (r: TfdRelatorioRow) => r.qtd_com_pernoite + r.qtd_sem_pernoite;
    const producaoDe = (r: TfdRelatorioRow) => r.linhas.reduce((s, l) => s + l.quantidade, 0);
    const somaRS = filtradas.reduce((s, r) => s + r.total_rs, 0);
    const somaViag = filtradas.reduce((s, r) => s + viagensDe(r), 0);
    const somaProd = filtradas.reduce((s, r) => s + producaoDe(r), 0);
    if (agrup === "detalhado") {
      return {
        colunas: ["Competência", "Paciente", "CNS", "Destino", "Profissional", "Viagens", "Produção", "Status", "Total"],
        dados: filtradas.map((r) => [compLabel(r.competencia), r.paciente_nome ?? "—", r.paciente_cns ?? "", r.destino_descricao ?? "—", r.prof_nome ?? "—", String(viagensDe(r)), String(producaoDe(r)), STATUS_META[r.status].rotulo, brl(r.total_rs)]),
        totalRS: somaRS, totalViagens: somaViag, totalProducao: somaProd,
      };
    }
    // Por procedimento: soma a QUANTIDADE de produção (procedimentos BPA-I gerados) por código.
    if (agrup === "procedimento") {
      const gp = new Map<string, { qtd: number; total: number }>();
      for (const r of filtradas) {
        for (const l of r.linhas) {
          if (!l.codigo) continue;
          const cur = gp.get(l.codigo) ?? { qtd: 0, total: 0 };
          cur.qtd += l.quantidade;
          cur.total += l.quantidade * l.valor_unitario;
          gp.set(l.codigo, cur);
        }
      }
      // Ordena na ordem canônica dos 6 procedimentos do TFD; ignora códigos sem produção.
      const ordem = [...ROTULO_PROC.keys()];
      const linhasProc = [...gp.entries()].sort((a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0]));
      return {
        colunas: ["Procedimento", "Código", "Quantidade", "Total"],
        dados: linhasProc.map(([cod, v]) => [ROTULO_PROC.get(cod) ?? cod, cod, String(v.qtd), brl(v.total)]),
        totalRS: somaRS, totalViagens: somaViag, totalProducao: somaProd,
      };
    }
    const chave = (r: TfdRelatorioRow) =>
      agrup === "competencia" ? compLabel(r.competencia)
        : agrup === "paciente" ? (r.paciente_nome ?? "—")
          : agrup === "profissional" ? (r.prof_nome ?? "— (sem profissional)")
            : (r.destino_descricao ?? "—");
    const g = new Map<string, { qtd: number; viagens: number; producao: number; total: number }>();
    for (const r of filtradas) {
      const k = chave(r);
      const cur = g.get(k) ?? { qtd: 0, viagens: 0, producao: 0, total: 0 };
      cur.qtd++; cur.viagens += viagensDe(r); cur.producao += producaoDe(r); cur.total += r.total_rs;
      g.set(k, cur);
    }
    const rotuloChave = agrup === "competencia" ? "Competência" : agrup === "paciente" ? "Paciente" : agrup === "profissional" ? "Profissional" : "Destino";
    return {
      colunas: [rotuloChave, "TFDs", "Viagens", "Produção", "Total"],
      dados: [...g.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, v]) => [k, String(v.qtd), String(v.viagens), String(v.producao), brl(v.total)]),
      totalRS: somaRS, totalViagens: somaViag, totalProducao: somaProd,
    };
  }, [filtradas, agrup]);

  const baixarCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const linhas = [colunas, ...dados].map((l) => l.map((c) => esc(String(c))).join(";"));
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tfd_${agrup}_${compDe}-${compAte}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const baixarPdf = () => {
    const periodo = compDe === compAte ? compLabel(compDe) : `${compLabel(compDe)} a ${compLabel(compAte)}`;
    const pdf = construirPdfTfd({
      logo, nomeUnidade: props.nomeUnidade, periodo,
      status: status ? STATUS_META[status].rotulo : "Todos",
      agrupamento: AGRUPAMENTOS.find((a) => a.valor === agrup)?.rotulo ?? agrup,
      colunas, dados, totalTfd: filtradas.length, totalViagens, totalProducao, totalRS: brl(totalRS), cor,
    });
    pdf.save(`tfd_${agrup}_${compDe}-${compAte}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={props.onFechar}>
      <div className="mt-6 w-full max-w-4xl rounded-lg border border-border bg-card p-4 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><FileBarChart className="size-4 text-primary" /> Relatórios de TFD — {props.nomeUnidade}</h2>
          <button type="button" onClick={props.onFechar} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div><div className={label}>Competência de</div><CompetenciaSelect value={compDe} onChange={setCompDe} /></div>
          <div><div className={label}>até</div><CompetenciaSelect value={compAte} onChange={setCompAte} /></div>
          <div><div className={label}>Status</div>
            <select value={status} onChange={(e) => setStatus(e.target.value as "" | TfdStatus)} className={campo}>
              <option value="">Todos</option><option value="agendada">Agendada</option><option value="realizada">Realizada</option><option value="faturada">Faturada</option><option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div className="sm:col-span-2"><div className={label}>Agrupar</div>
            <select value={agrup} onChange={(e) => setAgrup(e.target.value as AgrupamentoRel)} className={campo}>
              {AGRUPAMENTOS.map((a) => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {carregando ? "Carregando…" : `${filtradas.length} TFD · ${totalViagens} viagens · ${totalProducao} procedimento(s) · total `}
            {!carregando && <span className="font-semibold text-foreground">{brl(totalRS)}</span>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={baixarPdf} disabled={dados.length === 0} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"><FileText className="size-3" /> PDF (timbre)</button>
            <button type="button" onClick={baixarCsv} disabled={dados.length === 0} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"><Download className="size-3" /> CSV</button>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 text-[11px] uppercase text-muted-foreground">
              <tr>{colunas.map((c, i) => <th key={c} className={`px-2 py-1 ${i === 0 ? "text-left" : i === colunas.length - 1 ? "text-right" : "text-left"}`}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {!carregando && dados.length === 0 && <tr><td colSpan={colunas.length} className="px-2 py-6 text-center text-muted-foreground">Sem dados no período/filtro.</td></tr>}
              {dados.map((linha, i) => (
                <tr key={i} className="border-t border-border">
                  {linha.map((c, j) => <td key={j} className={`px-2 py-1 ${j === linha.length - 1 ? "text-right font-medium" : ""}`}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seletor de profissional responsável (autocomplete no cache do CNES).
// ---------------------------------------------------------------------------
function ProfPicker(props: {
  cnes: string; cns: string; nome: string; cbo: string;
  onMuda: (v: { cns: string; nome: string; cbo: string }) => void;
}) {
  const { cnes } = props;
  const [termo, setTermo] = useState(props.nome || props.cns);
  const [sug, setSug] = useState<{ cns: string; nome: string }[]>([]);
  const [aberto, setAberto] = useState(false);
  const [cboOpcoes, setCboOpcoes] = useState<{ codigo: string; descricao: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = termo.trim();
    if (q.length < 2 || !cnes) { setSug([]); return; }
    timer.current = setTimeout(async () => setSug(await buscarProfissionais(cnes, q)), 250);
  }, [termo, cnes]);

  const escolher = async (p: { cns: string; nome: string }) => {
    setTermo(p.nome);
    setAberto(false);
    setCboOpcoes([]);
    const cbos = await buscarCbosVinculo(p.cns, cnes);
    // 1 vínculo: auto-preenche. >1: oferece a escolha do CBO do momento. 0: deixa manual.
    props.onMuda({ cns: p.cns, nome: p.nome, cbo: cbos.length === 1 ? cbos[0].codigo : "" });
    if (cbos.length > 1) setCboOpcoes(cbos);
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div className="relative sm:col-span-2">
        <input value={termo} onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
          placeholder="Nome ou CNS do responsável…" className={campo} />
        {aberto && sug.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-popover shadow">
            {sug.map((p) => (
              <button key={p.cns} type="button" onClick={() => escolher(p)}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted">
                <span className="font-medium">{p.nome}</span>
                <span className="text-[11px] text-muted-foreground">CNS {p.cns}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <input value={props.cbo} onChange={(e) => props.onMuda({ cns: props.cns, nome: props.nome, cbo: digitos(e.target.value).slice(0, 6) })}
          placeholder="CBO" className={campo} />
      </div>
      {cboOpcoes.length > 1 && (
        <div className="overflow-hidden rounded-md border border-amber-300 bg-amber-50 sm:col-span-3">
          <div className="flex items-center justify-between px-3 py-1.5 text-xs font-medium text-amber-800">
            <span>Este profissional tem mais de um CBO aqui — escolha o do momento:</span>
            <button type="button" className="ml-2 shrink-0 text-amber-700 hover:underline"
              onClick={() => setCboOpcoes([])}>fechar</button>
          </div>
          {cboOpcoes.map((c) => (
            <button key={c.codigo} type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-amber-100"
              onClick={() => { props.onMuda({ cns: props.cns, nome: props.nome, cbo: c.codigo }); setCboOpcoes([]); }}>
              <span className="font-mono">{c.codigo}</span> — {c.descricao}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela de valores unitários (edição com vigência).
// ---------------------------------------------------------------------------
function TabelaValores(props: {
  orgId: string; cnes: string; competencia: string; podeEditar: boolean;
  onSalvo: () => void; userId: string | null;
}) {
  const [det, setDet] = useState<Record<string, { valor: number; fonte: "fpo" | "override" | null }>>({});
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState("");

  const recarregar = useCallback(async () => {
    setDet(await valoresTfdDetalhado(props.orgId, props.cnes, props.competencia));
  }, [props.orgId, props.cnes, props.competencia]);
  useEffect(() => { recarregar(); }, [recarregar]);

  const salvar = async (codigo: string) => {
    const v = Number((editando[codigo] ?? "").replace(",", "."));
    if (Number.isNaN(v)) { toast.error("Valor inválido."); return; }
    setSalvando(codigo);
    const ok = await definirValorVigente(props.orgId, codigo, props.competencia, v, props.userId);
    setSalvando("");
    if (!ok) { toast.error("Falha ao salvar (verifique a permissão)."); return; }
    setEditando((e) => { const n = { ...e }; delete n[codigo]; return n; });
    toast.success(`Override definido a partir de ${compLabel(props.competencia)}.`);
    await recarregar();
    props.onSalvo();
  };

  return (
    <div className="border-t border-border p-3">
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase text-muted-foreground">
          <tr><th className="py-1 pr-2 text-left">Código</th><th className="py-1 pr-2 text-left">Procedimento</th><th className="py-1 pr-2 text-center">Fonte</th><th className="py-1 text-right">Valor</th></tr>
        </thead>
        <tbody>
          {CODIGOS_TFD.map(({ codigo, rotulo }) => {
            const info = det[codigo] ?? { valor: 0, fonte: null };
            const emEd = editando[codigo] !== undefined;
            return (
              <tr key={codigo} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-2 font-mono text-[11px] text-muted-foreground">{codigo}</td>
                <td className="py-2 pr-2">{rotulo}</td>
                <td className="py-2 pr-2 text-center">
                  {info.fonte === "fpo" && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">FPO</span>}
                  {info.fonte === "override" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">override</span>}
                  {!info.fonte && <span className="text-[10px] text-muted-foreground">sem valor</span>}
                </td>
                <td className="py-2 text-right">
                  {props.podeEditar ? (
                    <div className="flex items-center justify-end gap-2">
                      <input
                        value={emEd ? editando[codigo] : String(info.valor)}
                        onChange={(e) => setEditando((s) => ({ ...s, [codigo]: e.target.value.replace(/[^\d.,]/g, "") }))}
                        className="w-24 rounded border border-border bg-background px-2 py-1 text-right text-sm outline-none focus:border-primary" />
                      {emEd && (
                        <button type="button" onClick={() => salvar(codigo)} disabled={salvando === codigo}
                          className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                          {salvando === codigo ? "…" : "Salvar"}
                        </button>
                      )}
                    </div>
                  ) : brl(info.valor)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Os valores vêm do <b>FPO</b> desta unidade (competência vigente). Editar aqui cria um <b>override</b> que
        prevalece a partir de {compLabel(props.competencia)} — use só se precisar diferir do FPO.
      </p>
    </div>
  );
}
