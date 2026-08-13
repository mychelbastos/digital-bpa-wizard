import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { UserRound, X, Plus, Trash2, Search, FolderOpen, FileDown, Pencil } from "lucide-react";
import { PacientePicker, PacienteForm } from "@/components/pacientes/PacientePicker";
import { carregarPaciente, type Paciente } from "@/lib/pacientes";
import { orgDoCnes } from "@/lib/tfd/tfd";
import { buscarEstabelecimento, buscarEstabelecimentosPorNome, type EstabelecimentoSug } from "@/lib/bpa-i-v2/estabelecimentos";
import { buscarProcedimentosPorNome } from "@/lib/bpa-i-v2/procedimentos-sigtap";
import { buscarProfissionais, buscarCbosVinculo, sincronizarProfissionais, type ProfissionalCache, type CboVinculo } from "@/lib/bpa-i-v2/profissionais";
import { salvarFicha, carregarFicha } from "@/lib/bpa-i-v2/fichas";
import { montarTituloFicha } from "@/lib/bpa-i-v2/titulo-ficha";
import { SalvarFichaModal } from "@/components/bpa-i-v2/SalvarFichaModal";
import { ConfirmModal } from "@/components/bpa-i-v2/ConfirmModal";
import { MinhasFichas } from "@/components/bpa-i-v2/MinhasFichas";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import {
  emptyRaasState, emptyAcao, totalAcoes, ufDeMunicipio,
  RAAS_ORIGEM_PACIENTE, RAAS_DESTINO_PACIENTE, RAAS_TIPO_DROGA, RAAS_LOCAL_REALIZACAO,
  RAAS_ORIGEM_INFO, RAAS_SIM_NAO, RAAS_NACIONALIDADES, situacaoParaNacionalidadeRaas,
  type RaasState, type RaasAcao, type ComboOption,
} from "@/lib/raas/raas-layout";
import { RACAS } from "@/lib/bpa-i-v2/racas";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";

export const Route = createFileRoute("/raas")({
  head: () => ({
    meta: [
      { title: "RAAS — Registro das Ações Ambulatoriais de Saúde (Atenção Psicossocial)" },
      { name: "description", content: "RAAS Psicossocial (CAPS): folha do paciente e ações do período." },
    ],
  }),
  component: RaasPage,
});

const STORAGE_KEY = "raas-state-v1";
const FICHA_ID_KEY = "raas-ficha-id";
const FICHA_TITULO_KEY = "raas-ficha-titulo";

// "AAAAMM" -> valor do <input type="month"> ("AAAA-MM") e -> rótulo "MM/AAAA".
const compParaInput = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(0, 4)}-${c.slice(4, 6)}` : "");
const fmtComp = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : c);

// Mês (AAAAMM) da data de execução de uma ação preenchida (procedimento + data válida).
const mesDaAcao = (a: { procedimento: string; dataExec: string }) =>
  a.procedimento && /^\d{4}-\d{2}-\d{2}$/.test(a.dataExec) ? a.dataExec.slice(0, 7).replace("-", "") : null;

function loadState(): RaasState {
  if (typeof window === "undefined") return emptyRaasState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyRaasState();
    const parsed = JSON.parse(raw) as Partial<RaasState>;
    const base = { ...emptyRaasState(), ...parsed };
    // Blinda contra fichas antigas sem ações e garante ao menos uma linha.
    if (!Array.isArray(base.acoes) || base.acoes.length === 0) base.acoes = [emptyAcao()];
    base.acoes = base.acoes.map((a) => ({ ...emptyAcao(), ...a }));
    return base;
  } catch {
    return emptyRaasState();
  }
}

// ---------- helpers de UI ----------
function Secao({ titulo, children, cols = 2 }: { titulo: string; children: React.ReactNode; cols?: number }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
      <div className={`grid grid-cols-1 gap-3 ${cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>{children}</div>
    </section>
  );
}

function Campo({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${span ? "md:col-span-2" : ""}`}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const lockedCls = "bg-muted/60 text-muted-foreground cursor-not-allowed";

function Txt(props: React.InputHTMLAttributes<HTMLInputElement> & { uppercase?: boolean }) {
  const { uppercase, className, style, ...rest } = props;
  const locked = rest.readOnly || rest.disabled;
  return (
    <input
      {...rest}
      className={`${inputCls} ${locked ? lockedCls : ""} ${className ?? ""}`}
      style={uppercase ? { textTransform: "uppercase", ...style } : style}
    />
  );
}

function Sel({ value, onChange, options, vazio = "—", disabled }: {
  value: string; onChange: (v: string) => void; options: ComboOption[]; vazio?: string; disabled?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`${inputCls} ${disabled ? lockedCls : ""}`}>
      <option value="">{vazio}</option>
      {options.map((o) => (
        <option key={o.code} value={o.code}>{o.code} — {o.label}</option>
      ))}
    </select>
  );
}

function Modal({ titulo, onClose, children, wide }: { titulo: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`my-8 w-full ${wide ? "max-w-3xl" : "max-w-2xl"} rounded-2xl border border-border bg-card shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-bold text-foreground">{titulo}</h2>
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Autocomplete de estabelecimento por nome (ou CNES). Escreve nome + CNES no estado.
function EstabInput({ nome, onChangeNome, onPick }: {
  nome: string; onChangeNome: (v: string) => void; onPick: (e: EstabelecimentoSug) => void;
}) {
  const [sug, setSug] = useState<EstabelecimentoSug[]>([]);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (nome.trim().length < 2) { setSug([]); return; }
      setSug(await buscarEstabelecimentosPorNome(nome.trim()));
    }, 250);
    return () => clearTimeout(t);
  }, [nome]);
  return (
    <div className="relative">
      <Txt uppercase value={nome} onChange={(e) => { onChangeNome(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder="Nome do estabelecimento" className="w-full" />
      {aberto && sug.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {sug.map((s) => (
            <button key={s.cnes} type="button" onMouseDown={(e) => { e.preventDefault(); onPick(s); setAberto(false); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
              <span className="truncate">{s.nome}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{s.cnes}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Autocomplete SIGTAP para o procedimento da ação (linha 16).
function ProcedimentoInput({ codigo, nome, onPick }: {
  codigo: string; nome: string; onPick: (codigo: string, nome: string) => void;
}) {
  const [termo, setTermo] = useState("");
  const [sug, setSug] = useState<{ codigo: string; nome: string }[]>([]);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (termo.trim().length < 3) { setSug([]); return; }
      setSug(await buscarProcedimentosPorNome(termo.trim()));
    }, 300);
    return () => clearTimeout(t);
  }, [termo]);
  const rotulo = codigo ? `${codigo}${nome ? ` — ${nome}` : ""}` : "";
  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={aberto ? termo : rotulo}
          onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
          onFocus={() => { setTermo(""); setAberto(true); }}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          placeholder="Código ou nome do procedimento"
          className={`${inputCls} w-full`}
        />
      </div>
      {aberto && sug.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {sug.map((p) => (
            <button key={p.codigo} type="button" onMouseDown={(e) => { e.preventDefault(); onPick(p.codigo, p.nome); setAberto(false); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
              <span className="font-mono text-xs text-muted-foreground">{p.codigo}</span> — {p.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Autocomplete do profissional EXECUTANTE da ação (linha 16): busca por nome no cache local
// do estabelecimento (CNES). Ao escolher, preenche CNS + nome e busca o(s) CBO(s) do vínculo
// naquele estabelecimento — auto-preenche quando há só um; oferece a escolha quando o
// profissional tem mais de um vínculo (CBO) ali. 0 vínculos: deixa o CBO p/ digitação manual.
function ProfExecutanteInput({ cnes, nome, onPatch }: {
  cnes: string;
  nome: string;
  onPatch: (patch: Partial<RaasAcao>) => void;
}) {
  const [termo, setTermo] = useState("");
  const [sug, setSug] = useState<ProfissionalCache[]>([]);
  const [aberto, setAberto] = useState(false);
  const [cboOpcoes, setCboOpcoes] = useState<CboVinculo[]>([]);
  const semCnes = cnes.length !== 7;

  useEffect(() => {
    if (semCnes) { setSug([]); return; }
    const t = setTimeout(async () => {
      if (termo.trim().length < 2) { setSug([]); return; }
      setSug(await buscarProfissionais(cnes, termo.trim()));
    }, 250);
    return () => clearTimeout(t);
  }, [termo, cnes, semCnes]);

  const escolher = (p: ProfissionalCache) => {
    setAberto(false);
    setSug([]);
    setCboOpcoes([]);
    onPatch({ cnsExecutante: p.cns, cnsExecutanteNome: p.nome });
    buscarCbosVinculo(p.cns, cnes).then((cbos) => {
      if (cbos.length === 1) onPatch({ cbo: cbos[0].codigo });
      else if (cbos.length > 1) setCboOpcoes(cbos); // deixa a pessoa escolher o vínculo do momento
    });
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={aberto ? termo : nome}
          onChange={(e) => { setTermo(e.target.value.toUpperCase()); setAberto(true); }}
          onFocus={() => { setTermo(""); setAberto(true); }}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          placeholder={semCnes ? "Informe o CNES do estabelecimento acima" : "Nome do profissional"}
          disabled={semCnes}
          className={`${inputCls} w-full ${semCnes ? lockedCls : ""}`}
        />
      </div>
      {aberto && sug.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {sug.map((p) => (
            <button key={p.cns} type="button" onMouseDown={(e) => { e.preventDefault(); escolher(p); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
              <div className="font-medium leading-tight">{p.nome}</div>
              <div className="font-mono text-xs text-muted-foreground">CNS {p.cns}</div>
            </button>
          ))}
        </div>
      )}
      {cboOpcoes.length > 1 && (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-amber-300 bg-amber-50">
          <div className="flex items-center justify-between px-3 py-1.5 text-xs font-medium text-amber-800">
            <span>Este profissional tem mais de um CBO aqui — escolha o do momento:</span>
            <button type="button" className="ml-2 shrink-0 text-amber-700 hover:underline"
              onMouseDown={(e) => { e.preventDefault(); setCboOpcoes([]); }}>fechar</button>
          </div>
          {cboOpcoes.map((c) => (
            <button key={c.codigo} type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-amber-100"
              onMouseDown={(e) => { e.preventDefault(); onPatch({ cbo: c.codigo }); setCboOpcoes([]); }}>
              <span className="font-mono">{c.codigo}</span> — {c.descricao}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RaasPage() {
  const [state, setState] = useState<RaasState>(emptyRaasState);
  const [hydrated, setHydrated] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const user = useAuthUser();

  const fichaIdRef = useRef<string | null>(null);
  const fichaTituloRef = useRef<string | null>(null);
  const [fichaTitulo, setFichaTitulo] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editPaciente, setEditPaciente] = useState<Paciente | null>(null);
  const [salvarOpen, setSalvarOpen] = useState(false);
  const [salvarComoNovo, setSalvarComoNovo] = useState(false);
  const [novaFichaOpen, setNovaFichaOpen] = useState(false);
  const [fichasOpen, setFichasOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const set = <K extends keyof RaasState>(key: K, value: RaasState[K]) => setState((p) => ({ ...p, [key]: value }));

  // Hidratação: ?ficha=<id> carrega da nuvem; senão, rascunho local.
  useEffect(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const fichaParam = params?.get("ficha") ?? null;
    if (fichaParam) {
      carregarFichaSalva(fichaParam);
    } else {
      setState(loadState());
      try {
        fichaIdRef.current = localStorage.getItem(FICHA_ID_KEY);
        fichaTituloRef.current = localStorage.getItem(FICHA_TITULO_KEY);
        setFichaTitulo(fichaTituloRef.current);
      } catch { /* noop */ }
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave local.
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
  }, [state, hydrated]);

  // CNES (7) -> nome do estabelecimento + organização (habilita o cadastro de pacientes).
  const cnesEstab = state.cnes.replace(/\D/g, "");
  const estabAutoCnesRef = useRef("");
  useEffect(() => {
    if (!hydrated) return;
    if (cnesEstab.length !== 7) { setOrgId(null); return; }
    let cancel = false;
    orgDoCnes(cnesEstab).then((o) => { if (!cancel) setOrgId(o); });
    void sincronizarProfissionais(cnesEstab); // popula o cache p/ o autocomplete de executante
    buscarEstabelecimento(cnesEstab).then((nome) => {
      if (cancel || !nome) return;
      estabAutoCnesRef.current = cnesEstab;
      setState((p) => ({ ...p, estabelecimentoNome: nome }));
    });
    return () => { cancel = true; };
  }, [cnesEstab, hydrated]);

  // ----- persistência de ficha -----
  const persistFicha = (id: string, titulo: string) => {
    fichaIdRef.current = id;
    fichaTituloRef.current = titulo;
    setFichaTitulo(titulo);
    try {
      localStorage.setItem(FICHA_ID_KEY, id);
      localStorage.setItem(FICHA_TITULO_KEY, titulo);
    } catch { /* noop */ }
  };
  const limparFichaPersistida = () => {
    fichaIdRef.current = null;
    fichaTituloRef.current = null;
    setFichaTitulo(null);
    try {
      localStorage.removeItem(FICHA_ID_KEY);
      localStorage.removeItem(FICHA_TITULO_KEY);
    } catch { /* noop */ }
  };

  const carregarFichaSalva = async (id: string, titulo?: string) => {
    const ficha = await carregarFicha(id);
    if (!ficha) { toast.error("Ficha não encontrada."); return; }
    const dados = ficha.dados as Partial<RaasState>;
    const base = { ...emptyRaasState(), ...dados };
    if (!Array.isArray(base.acoes) || base.acoes.length === 0) base.acoes = [emptyAcao()];
    base.acoes = base.acoes.map((a) => ({ ...emptyAcao(), ...a }));
    setState(base);
    persistFicha(id, titulo ?? ficha.titulo ?? "Ficha RAAS");
  };

  // Documento do paciente para o rótulo (CNS ou CPF).
  const docPaciente = () => {
    const cns = state.cnsPaciente.replace(/\D/g, "");
    if (cns.length === 15) return cns;
    const cpf = state.cpfPaciente.replace(/\D/g, "");
    return cpf.length === 11 ? cpf : "";
  };

  const nomeSugerido = (): string => {
    if (salvarComoNovo && fichaTituloRef.current) return `${fichaTituloRef.current} (cópia)`;
    if (fichaTituloRef.current) return fichaTituloRef.current;
    const auto = montarTituloFicha({
      cnes: cnesEstab,
      profNome: state.nomePaciente,
      competencia: /^\d{6}$/.test(state.competencia) ? state.competencia : null,
    });
    return `RAAS ${auto || state.nomePaciente || cnesEstab || "ficha"}`.trim();
  };

  const metaFicha = () => ({
    tipo: "RAAS" as const,
    cnes: cnesEstab,
    profissionalCns: docPaciente() || null,
    profissionalNome: state.nomePaciente || null,
  });

  const gravar = async (titulo: string, comoNovo: boolean) => {
    const comp = /^\d{6}$/.test(state.competencia) ? state.competencia : "";
    const idAlvo = comoNovo ? null : fichaIdRef.current;
    const id = await salvarFicha(idAlvo, titulo, comp, state, metaFicha());
    if (!id) { toast.error("Não foi possível salvar. Verifique sua conexão e tente novamente."); return; }
    persistFicha(id, titulo);
    setSalvarOpen(false);
    setSalvarComoNovo(false);
    toast.success(idAlvo ? "Alterações salvas na nuvem." : `Ficha “${titulo}” salva na nuvem.`);
  };

  const salvarClique = async () => {
    if (!fichaIdRef.current) { setSalvarComoNovo(false); setSalvarOpen(true); return; }
    setSalvando(true);
    await gravar(fichaTituloRef.current!, false);
    setSalvando(false);
  };

  const novaFicha = () => { setState(emptyRaasState()); limparFichaPersistida(); };

  // ----- paciente: autofill a partir do cadastro compartilhado -----
  const aoEscolherPaciente = (p: Paciente | null) => {
    setPickerOpen(false);
    if (!p) return;
    setState((prev) => ({
      ...prev,
      pacienteId: p.id,
      cnsPaciente: p.cns ?? "",
      cpfPaciente: p.cpf ?? "",
      nomePaciente: p.nome ?? "",
      prontuario: p.prontuario ?? "",
      validadeInicio: p.data_admissao ?? "",
      nomeMae: p.nome_mae ?? "",
      nomeResponsavel: p.nome_responsavel ?? "",
      dataNascimento: p.nascimento ?? "",
      sexo: p.sexo ?? "",
      nacionalidade: situacaoParaNacionalidadeRaas(p.nacionalidade),
      raca: p.raca_cor ?? "",
      etnia: p.etnia ?? "",
      logradouro: p.logradouro ?? "",
      numero: p.numero ?? "",
      complemento: p.complemento ?? "",
      bairro: p.bairro ?? "",
      cep: p.cep ?? "",
      municipioIbge: p.municipio_ibge ?? "",
      codLogradouro: p.cod_logradouro ?? "",
      telefone: p.telefone ?? "",
      email: p.email ?? "",
      coduf: p.municipio_ibge ? ufDeMunicipio(p.municipio_ibge) : prev.coduf,
    }));
    toast.success(`Paciente ${p.nome} preenchido.`);
  };

  // Abre o cadastro do paciente vinculado para correção. Ao salvar, reidrata a ficha.
  const abrirEdicaoPaciente = async () => {
    if (!state.pacienteId) return;
    const p = await carregarPaciente(state.pacienteId);
    if (p) setEditPaciente(p);
    else toast.error("Não foi possível carregar o paciente para edição.");
  };

  // ----- ações (linha 16) -----
  const updateAcao = (i: number, patch: Partial<RaasAcao>) => {
    setState((prev) => {
      const next = [...prev.acoes];
      next[i] = { ...next[i], ...patch };
      return { ...prev, acoes: next };
    });
  };
  const addAcao = () => setState((prev) => ({ ...prev, acoes: [...prev.acoes, emptyAcao()] }));
  const removeAcao = (i: number) =>
    setState((prev) => {
      const next = prev.acoes.filter((_, idx) => idx !== i);
      return { ...prev, acoes: next.length ? next : [emptyAcao()] };
    });

  // ----- validação leve (não bloqueia salvar; só orienta) -----
  const faltando: string[] = [];
  if (cnesEstab.length !== 7) faltando.push("CNES do estabelecimento (7 dígitos)");
  if (!/^\d{6}$/.test(state.competencia)) faltando.push("Competência");
  if (!state.validadeInicio) faltando.push("Data de admissão");
  if (!docPaciente()) faltando.push("CNS ou CPF do paciente");
  if (!state.nomePaciente.trim()) faltando.push("Nome do paciente");
  if (!state.origemPaciente) faltando.push("Origem do paciente");
  if (!state.destinoPaciente) faltando.push("Destino do paciente");
  // "Motivo de saída/permanência" (ras_motsaida) NÃO entra nas pendências: no fluxo oficial
  // do RAAS-PSICO quem define saída/permanência é o "Destino do Paciente". O campo do layout
  // é derivado/legado — vamos confirmar o preenchimento com um .AAS real antes de gerar.
  if (totalAcoes(state.acoes) === 0) faltando.push("Ao menos uma ação com procedimento");

  const total = totalAcoes(state.acoes);

  // Paciente vinculado ao cadastro: os campos que vieram do cadastro ficam travados na
  // ficha (edição só via "Editar paciente"). Campos que NÃO vêm do cadastro (prontuário,
  // nacionalidade RAAS 3-díg, responsável, celular, dados clínicos) seguem editáveis.
  const pt = Boolean(state.pacienteId);

  // Competência do RAAS = mês de produção = mês em que as ações foram executadas (ras_dtexec).
  // Derivamos do conjunto de ações preenchidas com data. Se houver ações em meses diferentes,
  // usamos o mês predominante (empate = mais recente) e avisamos para o digitador acertar.
  const freqMeses = new Map<string, number>();
  for (const a of state.acoes) {
    const m = mesDaAcao(a);
    if (m) freqMeses.set(m, (freqMeses.get(m) ?? 0) + 1);
  }
  const mesesAcoes = [...freqMeses.entries()];
  const competenciaDerivada = mesesAcoes.length
    ? [...mesesAcoes].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? 1 : -1))[0][0]
    : "";
  const competenciaAmbigua = mesesAcoes.length > 1;

  // Mantém a competência do estado em sincronia com o mês das ações (só quando há datas).
  useEffect(() => {
    if (competenciaDerivada && competenciaDerivada !== state.competencia) {
      setState((prev) => ({ ...prev, competencia: competenciaDerivada }));
    }
  }, [competenciaDerivada, state.competencia]);

  return (
    <div className="min-h-screen bg-muted/40 pb-20">
      <ConfirmModal open={novaFichaOpen} title="Nova ficha" confirmLabel="Começar nova ficha" onCancel={() => setNovaFichaOpen(false)} onConfirm={() => { setNovaFichaOpen(false); novaFicha(); }}>
        Começar uma nova ficha RAAS em branco? Alterações não salvas serão perdidas.
      </ConfirmModal>
      <SalvarFichaModal
        open={salvarOpen}
        defaultNome={nomeSugerido()}
        atualizando={!salvarComoNovo && Boolean(fichaIdRef.current)}
        comoNovo={salvarComoNovo}
        onSalvar={(titulo) => gravar(titulo, salvarComoNovo)}
        onClose={() => { setSalvarOpen(false); setSalvarComoNovo(false); }}
      />
      <MinhasFichas
        open={fichasOpen}
        fichaAtualId={fichaIdRef.current}
        tipo="RAAS"
        onClose={() => setFichasOpen(false)}
        onCarregar={carregarFichaSalva}
        onNova={novaFicha}
        onRenomeada={persistFicha}
      />

      {/* Cabeçalho fixo */}
      <header className="sticky top-[52px] z-30 border-b bg-background/95 backdrop-blur md:top-0">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
            <h1 className="max-w-[46vw] truncate text-base font-semibold" title={fichaTitulo ?? undefined}>
              {fichaTitulo || "Nova ficha RAAS"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-bold tracking-wide text-violet-700">RAAS</span>
            {/* Abre a folha oficial (overlay) numa nova aba: preenchida com o que está na tela
                (rascunho local, sempre atualizado) para conferir/calibrar posições e gerar o PDF. */}
            <a href="/raas-folha" target="_blank" rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
              <FileDown className="size-3.5" /> Folha oficial (PDF)
            </a>
            <button onClick={() => setFichasOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
              <FolderOpen className="size-3.5" /> Minhas fichas
            </button>
            {user && (
              <>
                <button onClick={salvarClique} disabled={salvando}
                  className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60">
                  {salvando ? "Salvando…" : `💾 Salvar${fichaTituloRef.current ? "" : " ficha"}`}
                </button>
                {fichaIdRef.current && (
                  <button onClick={() => { setSalvarComoNovo(true); setSalvarOpen(true); }}
                    className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
                    Salvar como…
                  </button>
                )}
                <button onClick={() => setNovaFichaOpen(true)} className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
                  ➕ Nova ficha
                </button>
              </>
            )}
          </div>
        </div>
        {faltando.length > 0 && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            <div className="mx-auto max-w-[1100px]">
              <span className="font-semibold">Pendências para o RAAS ficar completo:</span>{" "}
              {faltando.join(" · ")}. <span className="opacity-80">(Você ainda pode salvar como rascunho.)</span>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto mt-4 max-w-[1100px] space-y-4 px-4">
        {/* 1. Identificação do estabelecimento de saúde */}
        <Secao titulo="Identificação do estabelecimento de saúde" cols={3}>
          <Campo label="Nome do estabelecimento de saúde" span>
            <EstabInput nome={state.estabelecimentoNome}
              onChangeNome={(v) => set("estabelecimentoNome", v)}
              onPick={(e) => setState((p) => ({ ...p, estabelecimentoNome: e.nome, cnes: e.cnes }))} />
          </Campo>
          <Campo label="CNES (7 dígitos)">
            <Txt inputMode="numeric" maxLength={7} value={state.cnes}
              onChange={(e) => set("cnes", e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="0000000" />
          </Campo>
        </Secao>

        {/* 2. Identificação do usuário do SUS (identificação + endereço) */}
        <Secao titulo="Identificação do usuário do SUS" cols={3}>
          <div className="md:col-span-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={!orgId} onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <UserRound className="size-4" /> Buscar paciente
            </button>
            {state.pacienteId && (
              <button type="button" onClick={abrirEdicaoPaciente}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                <Pencil className="size-4" /> Editar paciente
              </button>
            )}
            {!orgId && <span className="text-xs text-muted-foreground">Preencha o CNES (7 dígitos) para habilitar a busca de pacientes.</span>}
            {state.pacienteId && <span className="text-xs text-emerald-700">Paciente vinculado — os dados abaixo estão travados; use <strong>Editar paciente</strong> para corrigir no cadastro.</span>}
          </div>
          <Campo label="Nº do prontuário (CAPS)">
            <Txt readOnly={pt} value={state.prontuario} onChange={(e) => set("prontuario", e.target.value.replace(/[^\d/]/g, ""))} />
          </Campo>
          <Campo label="Nome do paciente" span>
            <Txt uppercase readOnly={pt} value={state.nomePaciente} onChange={(e) => set("nomePaciente", e.target.value)} />
          </Campo>
          <Campo label="Cartão Nacional de Saúde (CNS)">
            <Txt inputMode="numeric" maxLength={15} readOnly={pt} value={state.cnsPaciente}
              onChange={(e) => set("cnsPaciente", e.target.value.replace(/\D/g, "").slice(0, 15))} />
          </Campo>
          <Campo label="CPF do paciente">
            <Txt inputMode="numeric" maxLength={11} readOnly={pt} value={state.cpfPaciente}
              onChange={(e) => set("cpfPaciente", e.target.value.replace(/\D/g, "").slice(0, 11))} />
          </Campo>
          <Campo label="Sexo">
            <Sel value={state.sexo} onChange={(v) => set("sexo", v)} options={[{ code: "M", label: "Masculino" }, { code: "F", label: "Feminino" }]} disabled={pt} />
          </Campo>
          <Campo label="Data de nascimento">
            <Txt type="date" readOnly={pt} value={state.dataNascimento} onChange={(e) => set("dataNascimento", e.target.value)} />
          </Campo>
          <Campo label="Nacionalidade">
            <Sel value={state.nacionalidade} onChange={(v) => set("nacionalidade", v)} options={RAAS_NACIONALIDADES} disabled={pt && state.nacionalidade !== ""} />
          </Campo>
          <Campo label="Raça/Cor">
            <Sel value={state.raca} onChange={(v) => set("raca", v)} options={RACAS} disabled={pt} />
          </Campo>
          <Campo label="Etnia indígena (se raça = indígena)">
            <Txt inputMode="numeric" maxLength={4} value={state.etnia}
              onChange={(e) => set("etnia", e.target.value.replace(/\D/g, "").slice(0, 4))} disabled={pt || state.raca !== "05"} />
          </Campo>
          <Campo label="Nome da mãe" span>
            <Txt uppercase readOnly={pt} value={state.nomeMae} onChange={(e) => set("nomeMae", e.target.value)} />
          </Campo>
          <Campo label="Nome do responsável" span>
            <Txt uppercase readOnly={pt} value={state.nomeResponsavel} onChange={(e) => set("nomeResponsavel", e.target.value)} />
          </Campo>
          <Campo label="Cód. IBGE município (7 díg.)">
            <Txt inputMode="numeric" maxLength={7} readOnly={pt} value={state.municipioIbge}
              onChange={(e) => setState((p) => { const m = e.target.value.replace(/\D/g, "").slice(0, 7); return { ...p, municipioIbge: m, coduf: m ? ufDeMunicipio(m) : p.coduf }; })} />
          </Campo>
          <Campo label="UF (IBGE 2 díg.)">
            <Txt inputMode="numeric" maxLength={2} readOnly={pt} value={state.coduf}
              onChange={(e) => set("coduf", e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </Campo>
          <Campo label="CEP de residência">
            <Txt inputMode="numeric" maxLength={8} readOnly={pt} value={state.cep}
              onChange={(e) => set("cep", e.target.value.replace(/\D/g, "").slice(0, 8))} />
          </Campo>
          <Campo label="Endereço (logradouro)" span>
            <Txt uppercase readOnly={pt} value={state.logradouro} onChange={(e) => set("logradouro", e.target.value)} />
          </Campo>
          <Campo label="Número">
            <Txt readOnly={pt} value={state.numero} onChange={(e) => set("numero", e.target.value.slice(0, 5))} />
          </Campo>
          <Campo label="Complemento">
            <Txt uppercase readOnly={pt} value={state.complemento} onChange={(e) => set("complemento", e.target.value.slice(0, 10))} />
          </Campo>
          <Campo label="Bairro">
            <Txt uppercase readOnly={pt} value={state.bairro} onChange={(e) => set("bairro", e.target.value.slice(0, 30))} />
          </Campo>
          <Campo label="Telefone celular">
            <Txt inputMode="numeric" maxLength={11} value={state.celular}
              onChange={(e) => set("celular", e.target.value.replace(/\D/g, "").slice(0, 11))} />
          </Campo>
          <Campo label="Telefone de contato">
            <Txt inputMode="numeric" maxLength={11} readOnly={pt} value={state.telefone}
              onChange={(e) => set("telefone", e.target.value.replace(/\D/g, "").slice(0, 11))} />
          </Campo>
          <Campo label="E-mail">
            <Txt type="email" readOnly={pt} value={state.email} onChange={(e) => set("email", e.target.value)} />
          </Campo>
        </Secao>

        {/* 3. Dados do atendimento */}
        <Secao titulo="Dados do atendimento" cols={3}>
          <Campo label="Data de admissão">
            <Txt type="date" readOnly={pt && state.validadeInicio !== ""} value={state.validadeInicio} onChange={(e) => set("validadeInicio", e.target.value)} />
          </Campo>
          <Campo label="Mês de atendimento (competência)">
            <Txt type="month" readOnly value={compParaInput(state.competencia)} />
            <span className="mt-0.5 text-[11px] normal-case text-muted-foreground">
              Definida pelo mês das ações realizadas (data de execução).
            </span>
            {competenciaAmbigua && (
              <span className="mt-0.5 text-[11px] normal-case text-amber-700">
                Há ações em meses diferentes ({mesesAcoes.map(([m]) => fmtComp(m)).join(", ")}). Usando {fmtComp(state.competencia)} — ajuste as datas para o mesmo mês.
              </span>
            )}
          </Campo>
          <Campo label="Nº da autorização">
            <Txt maxLength={13} value={state.autorizacao} onChange={(e) => set("autorizacao", e.target.value.replace(/\D/g, "").slice(0, 13))} />
          </Campo>
          <Campo label="Usuário de álcool e/ou outras drogas?">
            <Sel value={state.usuarioDroga} onChange={(v) => set("usuarioDroga", v)} options={RAAS_SIM_NAO} vazio="—" />
          </Campo>
          <Campo label="Tipos de droga (se usuário)">
            <div className="flex flex-wrap gap-3 py-2">
              {RAAS_TIPO_DROGA.map((d) => {
                const marcada = state.tiposDroga.includes(d.code);
                return (
                  <label key={d.code} className={`flex items-center gap-1.5 text-sm ${state.usuarioDroga !== "S" ? "opacity-40" : ""}`}>
                    <input type="checkbox" checked={marcada} disabled={state.usuarioDroga !== "S"}
                      onChange={(e) => setState((p) => ({
                        ...p,
                        tiposDroga: e.target.checked ? [...p.tiposDroga, d.code] : p.tiposDroga.filter((x) => x !== d.code),
                      }))} />
                    {d.label}
                  </label>
                );
              })}
            </div>
          </Campo>
          <Campo label="Origem do paciente">
            <Sel value={state.origemPaciente} onChange={(v) => set("origemPaciente", v)} options={RAAS_ORIGEM_PACIENTE} />
          </Campo>
          <Campo label="CID10 principal">
            <Txt uppercase maxLength={4} value={state.cidPrincipal}
              onChange={(e) => set("cidPrincipal", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} />
          </Campo>
          <Campo label="CID10 causas associadas">
            <Txt uppercase maxLength={4} value={state.cidCausas}
              onChange={(e) => set("cidCausas", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} />
          </Campo>
          <Campo label="CID secundário 1">
            <Txt uppercase maxLength={4} value={state.cidSec1}
              onChange={(e) => set("cidSec1", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} />
          </Campo>
          <Campo label="CID secundário 2">
            <Txt uppercase maxLength={4} value={state.cidSec2}
              onChange={(e) => set("cidSec2", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} />
          </Campo>
          <Campo label="CID secundário 3">
            <Txt uppercase maxLength={4} value={state.cidSec3}
              onChange={(e) => set("cidSec3", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} />
          </Campo>
          <Campo label="Caráter do atendimento">
            <Sel value={state.carater} onChange={(v) => set("carater", v)} options={CARATERES} />
          </Campo>
          <Campo label="Existe cobertura de ESF?">
            <Sel value={state.coberturaEsf} onChange={(v) => set("coberturaEsf", v)} options={RAAS_SIM_NAO} vazio="—" />
          </Campo>
          <Campo label="CNES da ESF (se cobertura = Sim)">
            <Txt inputMode="numeric" maxLength={7} value={state.cnesEsf}
              onChange={(e) => set("cnesEsf", e.target.value.replace(/\D/g, "").slice(0, 7))} disabled={state.coberturaEsf !== "S"} />
          </Campo>
          <Campo label="Encaminhamento (destino do paciente)">
            <Sel value={state.destinoPaciente} onChange={(v) => set("destinoPaciente", v)} options={RAAS_DESTINO_PACIENTE} />
          </Campo>
          <Campo label="Data de conclusão (óbito/alta)">
            <Txt type="date" value={state.dataObitoAlta} onChange={(e) => set("dataObitoAlta", e.target.value)} />
          </Campo>
          <Campo label="Motivo saída/perm. (vem do Destino)">
            <Txt inputMode="numeric" maxLength={2} value={state.motivoSaida}
              onChange={(e) => set("motivoSaida", e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="derivado do Destino" />
          </Campo>
          <Campo label="Origem das informações">
            <Sel value={state.origemInfo} onChange={(v) => set("origemInfo", v)} options={RAAS_ORIGEM_INFO} vazio="—" />
          </Campo>
          <Campo label="Situação de rua?">
            <Sel value={state.situacaoRua} onChange={(v) => set("situacaoRua", v)} options={RAAS_SIM_NAO} vazio="—" />
          </Campo>
        </Secao>

        {/* Ações (linha 16) */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Ações realizadas <span className="text-primary">({total})</span>
            </h2>
            <button type="button" onClick={addAcao} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">
              <Plus className="size-3.5" /> Adicionar ação
            </button>
          </div>
          <div className="space-y-3">
            {state.acoes.map((a, i) => (
              <div key={i} className="rounded-lg border border-border bg-background/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ação {i + 1}</span>
                  <button type="button" onClick={() => removeAcao(i)} className="rounded-md p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700" aria-label="Remover ação">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="md:col-span-3">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Procedimento (SIGTAP)</span>
                    <ProcedimentoInput codigo={a.procedimento} nome={a.procedimentoNome}
                      onPick={(codigo, nome) => updateAcao(i, { procedimento: codigo, procedimentoNome: nome })} />
                  </div>
                  <div className="md:col-span-3">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Profissional executante</span>
                    <ProfExecutanteInput cnes={cnesEstab} nome={a.cnsExecutanteNome}
                      onPatch={(patch) => updateAcao(i, patch)} />
                  </div>
                  <Campo label="CBO executante">
                    <Txt inputMode="numeric" maxLength={6} value={a.cbo}
                      onChange={(e) => updateAcao(i, { cbo: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
                  </Campo>
                  <Campo label="CNS executante">
                    <Txt inputMode="numeric" maxLength={15} value={a.cnsExecutante}
                      onChange={(e) => updateAcao(i, { cnsExecutante: e.target.value.replace(/\D/g, "").slice(0, 15), cnsExecutanteNome: "" })} />
                  </Campo>
                  <Campo label="Data da execução">
                    <Txt type="date" value={a.dataExec} onChange={(e) => updateAcao(i, { dataExec: e.target.value })} />
                  </Campo>
                  <Campo label="Serviço (3 díg.)">
                    <Txt inputMode="numeric" maxLength={3} value={a.servico}
                      onChange={(e) => updateAcao(i, { servico: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
                  </Campo>
                  <Campo label="Classificação (3 díg.)">
                    <Txt inputMode="numeric" maxLength={3} value={a.classificacao}
                      onChange={(e) => updateAcao(i, { classificacao: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
                  </Campo>
                  <Campo label="Quantidade">
                    <Txt inputMode="numeric" maxLength={6} value={a.quantidade}
                      onChange={(e) => updateAcao(i, { quantidade: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
                  </Campo>
                  <Campo label="Local de realização">
                    <Sel value={a.localRealizacao} onChange={(v) => updateAcao(i, { localRealizacao: v })} options={RAAS_LOCAL_REALIZACAO} vazio="—" />
                  </Campo>
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="pb-4 text-center text-xs text-muted-foreground">
          RAAS Psicossocial (CAPS). Salvo automaticamente neste navegador; use “Salvar ficha” para guardar na nuvem.
        </p>
      </main>

      {pickerOpen && orgId && (
        <Modal titulo="Paciente do RAAS" onClose={() => setPickerOpen(false)} wide>
          <PacientePicker orgId={orgId} paciente={null} apenasTfd={false} marcarTfd={false} origem="bpa_i"
            onEscolhe={aoEscolherPaciente} />
        </Modal>
      )}

      {editPaciente && orgId && (
        <Modal titulo="Editar paciente" onClose={() => setEditPaciente(null)} wide>
          <PacienteForm orgId={orgId} paciente={editPaciente} permitirAcompanhante={false}
            apenasTfd={false} marcarTfd={false}
            onSalvo={(p) => { setEditPaciente(null); aoEscolherPaciente(p); }}
            onCancela={() => setEditPaciente(null)} />
        </Modal>
      )}
    </div>
  );
}
