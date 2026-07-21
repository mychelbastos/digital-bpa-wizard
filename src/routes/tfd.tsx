import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ambulance, Plus, Search, X, Loader2, Save, UserPlus, MapPin, Receipt, ChevronDown, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import { carregarVinculosUsuario } from "@/lib/dashboard-producao";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { cnesComPermissao } from "@/lib/permissoes";
import { buscarProfissionais, buscarCbosVinculo } from "@/lib/bpa-i-v2/profissionais";
import {
  buscarPacientes, salvarPaciente, carregarPaciente, registrarLeituraPaciente, pacienteFaltando, type Paciente,
} from "@/lib/pacientes";
import {
  orgDoCnes, listarDestinos, salvarDestino, valoresVigentes, definirValorVigente,
  listarTfd, salvarTfd, atualizarStatusTfd, faturarTfd, previaTfd,
  type TfdDestino, type TfdRegistroView, type TfdStatus,
} from "@/lib/tfd/tfd";
import { COD_TFD } from "@/lib/tfd/gerar-bpa-tfd";
import { RACAS, RACA_INDIGENA } from "@/lib/bpa-i-v2/racas";
import { ETNIAS } from "@/lib/bpa-i-v2/etnias";
import { NACIONALIDADES, NACIONALIDADE_BRASILEIRO } from "@/lib/bpa-i-v2/nacionalidades";
import { TIPOS_LOGRADOURO } from "@/lib/bpa-i-v2/tipos-logradouro";
import { buscarInfoCep } from "@/lib/bpa-i-v2/cep";

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
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const digitos = (s: string) => (s || "").replace(/\D/g, "");

// Os 6 códigos TFD, na ordem de exibição, para a tela de valores.
const CODIGOS_TFD: { codigo: string; rotulo: string }[] = [
  { codigo: COD_TFD.DESLOC_PAC, rotulo: "Deslocamento — paciente (cada 50 km)" },
  { codigo: COD_TFD.ALIM_PERNOITE_PAC, rotulo: "Alimentação c/ pernoite — paciente" },
  { codigo: COD_TFD.ALIM_SEM_PERNOITE_PAC, rotulo: "Alimentação s/ pernoite — paciente" },
  { codigo: COD_TFD.DESLOC_ACOMP, rotulo: "Deslocamento — acompanhante (cada 50 km)" },
  { codigo: COD_TFD.ALIM_PERNOITE_ACOMP, rotulo: "Alimentação c/ pernoite — acompanhante" },
  { codigo: COD_TFD.ALIM_SEM_PERNOITE_ACOMP, rotulo: "Alimentação s/ pernoite — acompanhante" },
];

const STATUS_META: Record<TfdStatus, { rotulo: string; cor: string }> = {
  agendada: { rotulo: "Agendada", cor: "bg-amber-100 text-amber-800" },
  realizada: { rotulo: "Realizada", cor: "bg-blue-100 text-blue-800" },
  faturada: { rotulo: "Faturada", cor: "bg-emerald-100 text-emerald-800" },
  cancelada: { rotulo: "Cancelada", cor: "bg-muted text-muted-foreground line-through" },
};

const campo = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const label = "text-xs font-medium text-muted-foreground";

function TfdPage() {
  const user = useAuthUser();
  const search = Route.useSearch();
  const [cnesOpcoes, setCnesOpcoes] = useState<{ cnes: string; nome: string }[]>([]);
  const [geriveis, setGeriveis] = useState<Set<string>>(new Set());
  const [cnes, setCnes] = useState(search.cnes ?? "");
  const [competencia, setCompetencia] = useState(search.comp ?? competenciaAtual());
  const [orgId, setOrgId] = useState<string | null>(null);
  const [destinos, setDestinos] = useState<TfdDestino[]>([]);
  const [valores, setValores] = useState<Record<string, number>>({});
  const [registros, setRegistros] = useState<TfdRegistroView[]>([]);
  const [loading, setLoading] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [valoresAberto, setValoresAberto] = useState(false);

  const podeGerir = cnes ? geriveis.has(cnes) : false;
  const nomeUnidade = cnesOpcoes.find((o) => o.cnes === cnes)?.nome ?? cnes;

  // Unidades do usuário + em quais pode gerir TFD.
  useEffect(() => {
    (async () => {
      const [vincs, ger] = await Promise.all([carregarVinculosUsuario(), cnesComPermissao("gerir_tfd")]);
      const unicos = [...new Set(vincs.map((v) => v.cnes).filter(Boolean))];
      const nomes = await Promise.all(unicos.map(async (c) => ({ cnes: c, nome: (await buscarEstabelecimento(c)) || c })));
      setCnesOpcoes(nomes);
      setGeriveis(new Set(ger));
      if (unicos[0]) setCnes((atual) => atual || unicos[0]);
    })();
  }, []);

  // Resolve org do CNES + carrega catálogos/valores.
  useEffect(() => {
    if (!cnes) { setOrgId(null); return; }
    (async () => {
      const org = await orgDoCnes(cnes);
      setOrgId(org);
      if (org) {
        const [dest, vals] = await Promise.all([listarDestinos(org), valoresVigentes(org, competencia)]);
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

  const faturar = async (r: TfdRegistroView) => {
    if (!podeGerir) return;
    if (!r.paciente_cns) { toast.error("Paciente sem CNS — cadastre o CNS antes de faturar."); return; }
    const pac = await carregarPaciente(r.paciente_id, false);
    if (!pac) { toast.error("Não consegui carregar o paciente."); return; }
    const fichaId = await faturarTfd(r as unknown as Parameters<typeof faturarTfd>[0], pac, nomeUnidade, competenciaAtual());
    if (!fichaId) { toast.error("Falha ao gerar a ficha BPA-I."); return; }
    toast.success("Ficha BPA-I gerada e TFD marcado como faturado.");
    carregar();
  };

  const mudarStatus = async (r: TfdRegistroView, status: TfdStatus) => {
    if (!podeGerir) return;
    if (await atualizarStatusTfd(r.id, status)) { toast.success(`Status: ${STATUS_META[status].rotulo}.`); carregar(); }
    else toast.error("Não foi possível mudar o status.");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Cabeçalho */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold text-foreground">
            <Ambulance className="size-5 text-primary" /> TFD — Tratamento Fora de Domicílio
          </h1>
        </div>
        {podeGerir && (
          <button type="button" onClick={() => setFormAberto((a) => !a)}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> Novo TFD
          </button>
        )}
      </div>

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
          <input value={competencia} onChange={(e) => setCompetencia(digitos(e.target.value).slice(0, 6))}
            placeholder="AAAAMM" className={`${campo} w-32`} />
        </div>
        {!podeGerir && cnes && (
          <p className="text-xs text-amber-700">Você não tem permissão para gerir TFD nesta unidade (somente leitura).</p>
        )}
      </div>

      {/* Formulário de novo TFD */}
      {formAberto && podeGerir && orgId && (
        <FormTfd
          orgId={orgId} cnes={cnes} competencia={competencia} destinos={destinos} valores={valores}
          onFecha={() => setFormAberto(false)}
          onDestinosMudou={recarregarDestinos}
          onSalvo={() => { setFormAberto(false); carregar(); }}
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
                <td className="px-3 py-2 text-center">{r.tem_acompanhante ? "Sim" : "—"}</td>
                <td className="px-3 py-2 text-right font-medium">{brl(r.total_rs)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_META[r.status].cor}`}>
                    {STATUS_META[r.status].rotulo}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {podeGerir && (
                    <div className="flex justify-end gap-1">
                      {r.status === "agendada" && (
                        <button type="button" onClick={() => mudarStatus(r, "realizada")}
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">Realizada</button>
                      )}
                      {(r.status === "agendada" || r.status === "realizada") && (
                        <button type="button" onClick={() => faturar(r)}
                          className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                          <Receipt className="size-3" /> Faturar
                        </button>
                      )}
                      {r.status === "faturada" && r.ficha_id && (
                        <Link to="/minhas-fichas" className="flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                          <CheckCircle2 className="size-3" /> Ficha
                        </Link>
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
          <TabelaValores orgId={orgId} competencia={competencia} valores={valores} podeEditar={podeGerir}
            onSalvo={async () => setValores(await valoresVigentes(orgId, competencia))} userId={user?.id ?? null} />
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
  onFecha: () => void; onDestinosMudou: () => void; onSalvo: () => void;
}) {
  const { orgId, cnes, competencia, destinos, valores } = props;
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [destinoId, setDestinoId] = useState("");
  const [distanciaKm, setDistanciaKm] = useState("0");
  const [comP, setComP] = useState("0");
  const [semP, setSemP] = useState("0");
  const [temAcomp, setTemAcomp] = useState(false);
  const [acompNome, setAcompNome] = useState("");
  const [acompCns, setAcompCns] = useState("");
  const [profCns, setProfCns] = useState("");
  const [profNome, setProfNome] = useState("");
  const [profCbo, setProfCbo] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [novoDestino, setNovoDestino] = useState(false);
  // Override manual do valor unitário por código (senão usa o vigente da org).
  const [valorOverride, setValorOverride] = useState<Record<string, string>>({});

  const aoEscolherDestino = (id: string) => {
    setDestinoId(id);
    const d = destinos.find((x) => x.id === id);
    if (d) setDistanciaKm(String(d.distancia_km));
  };

  const entrada = {
    distanciaKm: Number(distanciaKm) || 0,
    qtdComPernoite: Number(comP) || 0,
    qtdSemPernoite: Number(semP) || 0,
    temAcompanhante: temAcomp,
  };
  const valorDe = (codigo: string) =>
    valorOverride[codigo] !== undefined ? Number(valorOverride[codigo].replace(",", ".")) || 0 : (valores[codigo] ?? 0);
  const linhas = previaTfd(entrada);
  const linhasComValor = linhas.map((l) => ({ codigo: l.codigo, quantidade: l.quantidade, para: l.para, valor_unitario: valorDe(l.codigo) }));
  const totalRS = linhasComValor.reduce((s, l) => s + l.quantidade * l.valor_unitario, 0);

  const salvar = async () => {
    if (!paciente) { toast.error("Selecione ou cadastre o paciente."); return; }
    if (temAcomp && !digitos(acompCns)) { toast.error("Informe o CNS do acompanhante (ou desmarque acompanhante)."); return; }
    setSalvando(true);
    const id = await salvarTfd(null, {
      organizacao_id: orgId, cnes, competencia, paciente_id: paciente.id,
      destino_id: destinoId || null, distancia_km: Number(distanciaKm) || 0,
      qtd_com_pernoite: Number(comP) || 0, qtd_sem_pernoite: Number(semP) || 0,
      tem_acompanhante: temAcomp, acompanhante_nome: acompNome, acompanhante_cns: acompCns,
      prof_cns: profCns, prof_nome: profNome, prof_cbo: profCbo, observacoes: obs, status: "agendada",
    }, linhasComValor);
    setSalvando(false);
    if (!id) { toast.error("Falha ao salvar o TFD."); return; }
    toast.success("TFD registrado.");
    props.onSalvo();
  };

  return (
    <div className="mb-4 rounded-lg border border-primary/30 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Novo TFD</h2>
        <button type="button" onClick={props.onFecha} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>

      {/* Paciente */}
      <PacientePicker orgId={orgId} paciente={paciente} onEscolhe={setPaciente} />

      {/* Destino + distância */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <div className={label}>Destino (rota)</div>
          <div className="flex gap-2">
            <select value={destinoId} onChange={(e) => aoEscolherDestino(e.target.value)} className={campo}>
              <option value="">— selecione —</option>
              {props.destinos.map((d) => <option key={d.id} value={d.id}>{d.descricao} · {d.distancia_km} km</option>)}
            </select>
            <button type="button" onClick={() => setNovoDestino((v) => !v)}
              className="shrink-0 rounded-md border border-border px-2 text-sm hover:bg-muted" title="Novo destino">
              <MapPin className="size-4" />
            </button>
          </div>
        </div>
        <div>
          <div className={label}>Distância (km, só ida)</div>
          <input value={distanciaKm} onChange={(e) => setDistanciaKm(e.target.value.replace(/[^\d.]/g, ""))} className={campo} />
        </div>
      </div>

      {novoDestino && (
        <NovoDestino orgId={orgId} onCriado={(d) => { props.onDestinosMudou(); setNovoDestino(false); aoEscolherDestino(d.id); }} onCancela={() => setNovoDestino(false)} />
      )}

      {/* Viagens */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className={label}>Viagens c/ pernoite</div>
          <input type="number" min={0} value={comP} onChange={(e) => setComP(e.target.value)} className={campo} />
        </div>
        <div>
          <div className={label}>Viagens s/ pernoite</div>
          <input type="number" min={0} value={semP} onChange={(e) => setSemP(e.target.value)} className={campo} />
        </div>
        <label className="col-span-2 flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={temAcomp} onChange={(e) => setTemAcomp(e.target.checked)} className="size-4" />
          Tem acompanhante
        </label>
      </div>

      {temAcomp && (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className={label}>Nome do acompanhante</div>
            <input value={acompNome} onChange={(e) => setAcompNome(e.target.value)} className={campo} />
          </div>
          <div>
            <div className={label}>CNS do acompanhante</div>
            <input value={acompCns} onChange={(e) => setAcompCns(digitos(e.target.value).slice(0, 15))} className={campo} />
          </div>
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
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Registrar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seletor / cadastro de paciente.
// ---------------------------------------------------------------------------
function PacientePicker(props: { orgId: string; paciente: Paciente | null; onEscolhe: (p: Paciente | null) => void }) {
  const { orgId, paciente } = props;
  const [termo, setTermo] = useState("");
  const [sugestoes, setSugestoes] = useState<Paciente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [completar, setCompletar] = useState<Paciente | null>(null); // selecionado c/ cadastro incompleto
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (paciente) return;
    if (timer.current) clearTimeout(timer.current);
    const q = termo.trim();
    if (q.length < 3) { setSugestoes([]); return; }
    setBuscando(true);
    timer.current = setTimeout(async () => {
      setSugestoes(await buscarPacientes(orgId, q, true)); // só pacientes do TFD
      setBuscando(false);
    }, 250);
  }, [termo, orgId, paciente]);

  // Seleciona: se o cadastro estiver incompleto, abre o form exigindo o preenchimento.
  const selecionar = (p: Paciente) => {
    registrarLeituraPaciente(p.id);
    if (pacienteFaltando(p).length > 0) { setCompletar(p); setSugestoes([]); }
    else props.onEscolhe(p);
  };

  if (completar) {
    return (
      <div>
        <div className="mb-1 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <UserPlus className="size-4 shrink-0" />
          Cadastro incompleto de <b>{completar.nome}</b>. Complete os dados obrigatórios para usar no TFD.
        </div>
        <PacienteForm orgId={orgId} paciente={completar}
          onSalvo={(p) => { setCompletar(null); props.onEscolhe(p); }}
          onCancela={() => setCompletar(null)} />
      </div>
    );
  }

  if (paciente) {
    return (
      <div className="flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2">
        <div>
          <div className="text-sm font-medium text-emerald-900">{paciente.nome}</div>
          <div className="text-[11px] text-emerald-700">
            {paciente.cns ? `CNS ${paciente.cns}` : paciente.cpf ? `CPF ${paciente.cpf}` : "sem documento"}
          </div>
        </div>
        <button type="button" onClick={() => { props.onEscolhe(null); setTermo(""); }}
          className="text-emerald-700 hover:text-emerald-900"><X className="size-4" /></button>
      </div>
    );
  }

  return (
    <div>
      <div className={label}>Paciente</div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Nome, CNS ou CPF…"
          className={`${campo} pl-9`} />
        {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {sugestoes.length > 0 && (
        <div className="mt-1 max-h-52 overflow-auto rounded-md border border-border bg-popover shadow">
          {sugestoes.map((p) => {
            const incompleto = pacienteFaltando(p).length > 0;
            return (
              <button key={p.id} type="button" onClick={() => selecionar(p)}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted">
                <span className="flex items-center gap-2 font-medium">
                  {p.nome}
                  {incompleto && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">incompleto</span>}
                </span>
                <span className="text-[11px] text-muted-foreground">{p.cns ? `CNS ${p.cns}` : p.cpf ? `CPF ${p.cpf}` : "sem documento"}{p.nascimento ? ` · ${p.nascimento.split("-").reverse().join("/")}` : ""}</span>
              </button>
            );
          })}
        </div>
      )}
      {termo.trim().length >= 3 && !buscando && (
        <button type="button" onClick={() => setCriando(true)}
          className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline">
          <UserPlus className="size-3" /> Cadastrar novo paciente
        </button>
      )}
      {criando && (
        <PacienteForm orgId={orgId} nomeInicial={termo} onSalvo={(p) => { setCriando(false); props.onEscolhe(p); }} onCancela={() => setCriando(false)} />
      )}
    </div>
  );
}

// Cadastro completo do paciente — mesmos campos que o BPA-I coleta (+ os extras que já
// temos: nome social, nome da mãe). Autofill de município/UF pelo CEP (ViaCEP). Aceita um
// `paciente` para EDITAR/COMPLETAR (pré-preenche e atualiza) ou `nomeInicial` para criar.
// Exige todos os campos obrigatórios antes de salvar (regra do TFD).
function PacienteForm(props: { orgId: string; paciente?: Paciente; nomeInicial?: string; onSalvo: (p: Paciente) => void; onCancela: () => void }) {
  const ini = props.paciente;
  const semear = props.nomeInicial ?? "";
  const soLetras = /\d/.test(semear) ? "" : semear;
  const soNum = semear.replace(/\D/g, "");
  const [nome, setNome] = useState(ini?.nome ?? soLetras);
  const [nomeSocial, setNomeSocial] = useState(ini?.nome_social ?? "");
  const [cns, setCns] = useState(ini?.cns ?? (soNum.length === 15 ? soNum : ""));
  const [cpf, setCpf] = useState(ini?.cpf ?? (soNum.length === 11 ? soNum : ""));
  const [sexo, setSexo] = useState<"" | "M" | "F">(ini?.sexo ?? "");
  const [nascimento, setNascimento] = useState(ini?.nascimento ?? "");
  const [telefone, setTelefone] = useState(ini?.telefone ?? "");
  const [nomeMae, setNomeMae] = useState(ini?.nome_mae ?? "");
  const [nacionalidade, setNacionalidade] = useState(ini?.nacionalidade ?? NACIONALIDADE_BRASILEIRO);
  const [racaCor, setRacaCor] = useState(ini?.raca_cor ?? "");
  const [etnia, setEtnia] = useState(ini?.etnia ?? "");
  const [situacaoRua, setSituacaoRua] = useState<"" | "S" | "N">((ini?.situacao_rua as "S" | "N") ?? "");
  const [email, setEmail] = useState(ini?.email ?? "");
  const [cep, setCep] = useState(ini?.cep ?? "");
  const [codLog, setCodLog] = useState(ini?.cod_logradouro ?? "");
  const [logradouro, setLogradouro] = useState(ini?.logradouro ?? "");
  const [numero, setNumero] = useState(ini?.numero ?? "");
  const [complemento, setComplemento] = useState(ini?.complemento ?? "");
  const [bairro, setBairro] = useState(ini?.bairro ?? "");
  const [municipioNome, setMunicipioNome] = useState(ini?.municipio_nome ?? "");
  const [municipioIbge, setMunicipioIbge] = useState(ini?.municipio_ibge ?? "");
  const [uf, setUf] = useState(ini?.uf ?? "");
  const [salvando, setSalvando] = useState(false);

  const aoMudarCep = async (v: string) => {
    const d = digitos(v).slice(0, 8);
    setCep(d);
    if (d.length === 8) {
      const info = await buscarInfoCep(d);
      if (info.ibge) setMunicipioIbge(info.ibge);
      if (info.cidadeUf) {
        const [cidade, sigla] = info.cidadeUf.split(" - ");
        if (cidade) setMunicipioNome(cidade.toUpperCase());
        if (sigla) setUf(sigla.toUpperCase());
      }
    }
  };

  const salvar = async () => {
    const candidato: Partial<Paciente> = {
      nome, cns: digitos(cns) || null, cpf: digitos(cpf) || null, sexo: sexo || null,
      nascimento: nascimento || null, nacionalidade, raca_cor: racaCor || null,
      cep: digitos(cep) || null, municipio_ibge: digitos(municipioIbge) || null,
      logradouro: logradouro || null, numero: digitos(numero) || null, bairro: bairro || null,
      uf: uf || null, telefone: digitos(telefone) || null,
    };
    const faltam = pacienteFaltando(candidato);
    if (faltam.length > 0) { toast.error("Preencha todos os campos obrigatórios do paciente antes de continuar."); return; }
    setSalvando(true);
    const p = await salvarPaciente({
      id: props.paciente?.id, tfd: true,
      organizacao_id: props.orgId, nome, nome_social: nomeSocial, cns, cpf, sexo: sexo || null,
      nascimento: nascimento || null, nome_mae: nomeMae, nacionalidade, raca_cor: racaCor || null,
      etnia: etnia || null, situacao_rua: situacaoRua || null, email, telefone, cep,
      cod_logradouro: codLog, logradouro, numero, complemento, bairro,
      municipio_nome: municipioNome, municipio_ibge: municipioIbge, uf,
    });
    setSalvando(false);
    if (!p) { toast.error("Falha ao salvar o paciente."); return; }
    toast.success(props.paciente ? "Cadastro do paciente atualizado." : "Paciente cadastrado.");
    props.onSalvo(p);
  };

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">Identificação</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <div className={label}>Nome</div>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Nome social</div>
          <input value={nomeSocial} onChange={(e) => setNomeSocial(e.target.value)} className={campo} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Nome da mãe</div>
          <input value={nomeMae} onChange={(e) => setNomeMae(e.target.value)} className={campo} />
        </div>
        <div>
          <div className={label}>CNS</div>
          <input value={cns} onChange={(e) => setCns(digitos(e.target.value).slice(0, 15))} className={campo} />
        </div>
        <div>
          <div className={label}>CPF</div>
          <input value={cpf} onChange={(e) => setCpf(digitos(e.target.value).slice(0, 11))} className={campo} />
        </div>
        <div>
          <div className={label}>Sexo</div>
          <select value={sexo} onChange={(e) => setSexo(e.target.value as "" | "M" | "F")} className={campo}>
            <option value="">—</option><option value="M">Masculino</option><option value="F">Feminino</option>
          </select>
        </div>
        <div>
          <div className={label}>Nascimento</div>
          <input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} className={campo} />
        </div>
        <div>
          <div className={label}>Nacionalidade</div>
          <select value={nacionalidade} onChange={(e) => setNacionalidade(e.target.value)} className={campo}>
            {NACIONALIDADES.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <div className={label}>Raça/Cor</div>
          <select value={racaCor} onChange={(e) => setRacaCor(e.target.value)} className={campo}>
            <option value="">—</option>
            {RACAS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </div>
        {racaCor === RACA_INDIGENA && (
          <div>
            <div className={label}>Etnia</div>
            <select value={etnia} onChange={(e) => setEtnia(e.target.value)} className={campo}>
              <option value="">—</option>
              {ETNIAS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <div className={label}>Situação de rua</div>
          <select value={situacaoRua} onChange={(e) => setSituacaoRua(e.target.value as "" | "S" | "N")} className={campo}>
            <option value="">—</option><option value="N">Não</option><option value="S">Sim</option>
          </select>
        </div>
      </div>

      <div className="mb-1 mt-3 text-[11px] font-semibold uppercase text-muted-foreground">Contato e endereço</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <div className={label}>E-mail</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Telefone (DDD + número)</div>
          <input value={telefone} onChange={(e) => setTelefone(digitos(e.target.value).slice(0, 11))} className={campo} />
        </div>
        <div>
          <div className={label}>CEP</div>
          <input value={cep} onChange={(e) => aoMudarCep(e.target.value)} className={campo} />
        </div>
        <div>
          <div className={label}>Tipo logradouro</div>
          <select value={codLog} onChange={(e) => setCodLog(e.target.value)} className={campo}>
            <option value="">—</option>
            {TIPOS_LOGRADOURO.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Logradouro</div>
          <input value={logradouro} onChange={(e) => setLogradouro(e.target.value)} className={campo} />
        </div>
        <div>
          <div className={label}>Número</div>
          <input value={numero} onChange={(e) => setNumero(digitos(e.target.value).slice(0, 6))} className={campo} />
        </div>
        <div>
          <div className={label}>Complemento</div>
          <input value={complemento} onChange={(e) => setComplemento(e.target.value)} className={campo} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Bairro</div>
          <input value={bairro} onChange={(e) => setBairro(e.target.value)} className={campo} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Município</div>
          <input value={municipioNome} onChange={(e) => setMunicipioNome(e.target.value)} className={campo} />
        </div>
        <div>
          <div className={label}>Cód. IBGE</div>
          <input value={municipioIbge} onChange={(e) => setMunicipioIbge(digitos(e.target.value).slice(0, 7))} className={campo} />
        </div>
        <div>
          <div className={label}>UF</div>
          <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} className={campo} />
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={props.onCancela} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {salvando ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />} Salvar paciente
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Novo destino (rota).
// ---------------------------------------------------------------------------
function NovoDestino(props: { orgId: string; onCriado: (d: TfdDestino) => void; onCancela: () => void }) {
  const [descricao, setDescricao] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [uf, setUf] = useState("");
  const [estab, setEstab] = useState("");
  const [km, setKm] = useState("0");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!descricao.trim()) { toast.error("Informe a descrição do destino."); return; }
    setSalvando(true);
    const d = await salvarDestino({
      organizacao_id: props.orgId, descricao, municipio_destino: municipio, uf_destino: uf,
      estabelecimento_destino: estab, distancia_km: Number(km) || 0,
    });
    setSalvando(false);
    if (!d) { toast.error("Falha ao salvar o destino."); return; }
    toast.success("Destino cadastrado.");
    props.onCriado(d);
  };

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <div className={label}>Descrição</div>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Salvador — Hosp. Roberto Santos" className={campo} />
        </div>
        <div>
          <div className={label}>Município</div>
          <input value={municipio} onChange={(e) => setMunicipio(e.target.value)} className={campo} />
        </div>
        <div>
          <div className={label}>UF</div>
          <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} className={campo} />
        </div>
        <div className="sm:col-span-3">
          <div className={label}>Estabelecimento (opcional)</div>
          <input value={estab} onChange={(e) => setEstab(e.target.value)} className={campo} />
        </div>
        <div>
          <div className={label}>Distância (km, só ida)</div>
          <input value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.]/g, ""))} className={campo} />
        </div>
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
    const cbos = await buscarCbosVinculo(p.cns, cnes);
    props.onMuda({ cns: p.cns, nome: p.nome, cbo: cbos[0]?.codigo ?? "" });
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela de valores unitários (edição com vigência).
// ---------------------------------------------------------------------------
function TabelaValores(props: {
  orgId: string; competencia: string; valores: Record<string, number>; podeEditar: boolean;
  onSalvo: () => void; userId: string | null;
}) {
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState("");

  const salvar = async (codigo: string) => {
    const v = Number((editando[codigo] ?? "").replace(",", "."));
    if (Number.isNaN(v)) { toast.error("Valor inválido."); return; }
    setSalvando(codigo);
    const ok = await definirValorVigente(props.orgId, codigo, props.competencia, v, props.userId);
    setSalvando("");
    if (!ok) { toast.error("Falha ao salvar (verifique a permissão)."); return; }
    setEditando((e) => { const n = { ...e }; delete n[codigo]; return n; });
    toast.success(`Valor definido a partir de ${compLabel(props.competencia)}.`);
    props.onSalvo();
  };

  return (
    <div className="border-t border-border p-3">
      <table className="w-full text-sm">
        <tbody>
          {CODIGOS_TFD.map(({ codigo, rotulo }) => {
            const atual = props.valores[codigo] ?? 0;
            const emEd = editando[codigo] !== undefined;
            return (
              <tr key={codigo} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-2 font-mono text-[11px] text-muted-foreground">{codigo}</td>
                <td className="py-2 pr-2">{rotulo}</td>
                <td className="py-2 text-right">
                  {props.podeEditar ? (
                    <div className="flex items-center justify-end gap-2">
                      <input
                        value={emEd ? editando[codigo] : String(atual)}
                        onChange={(e) => setEditando((s) => ({ ...s, [codigo]: e.target.value.replace(/[^\d.,]/g, "") }))}
                        className="w-24 rounded border border-border bg-background px-2 py-1 text-right text-sm outline-none focus:border-primary" />
                      {emEd && (
                        <button type="button" onClick={() => salvar(codigo)} disabled={salvando === codigo}
                          className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                          {salvando === codigo ? "…" : "Salvar"}
                        </button>
                      )}
                    </div>
                  ) : brl(atual)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        A edição define o valor vigente a partir de {compLabel(props.competencia)} (competências anteriores mantêm o valor).
      </p>
    </div>
  );
}
