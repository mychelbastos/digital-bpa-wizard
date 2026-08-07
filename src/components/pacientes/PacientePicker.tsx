// Busca/seleção e cadastro de paciente — cadastro central compartilhado (TFD + BPA-I).
// EXTRAÍDO de src/routes/tfd.tsx SEM mudança de lógica; os únicos acréscimos são os
// parâmetros que antes eram fixos: `apenasTfd` (filtro da busca), `marcarTfd` (marca o
// paciente como do TFD ao salvar) e `origem` (primeira aparição). Os DEFAULTS preservam o
// comportamento do TFD (apenasTfd/marcarTfd = true, origem = 'tfd').
import { useEffect, useRef, useState } from "react";
import { UserPlus, X, Search, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  buscarPacientes, salvarPaciente, carregarPaciente, registrarLeituraPaciente, pacienteFaltando, type Paciente,
} from "@/lib/pacientes";
import { buscarInfoCep } from "@/lib/bpa-i-v2/cep";
import { validarCns } from "@/lib/bpa-i-v2/validacao";
import { validarCpf } from "@/lib/bpa-i-v3/identificacao";
import { emailValido } from "@/lib/validacao-email";
import { telefoneValido, cepValido } from "@/lib/validacao-contato";
import { NACIONALIDADES, NACIONALIDADE_BRASILEIRO } from "@/lib/bpa-i-v2/nacionalidades";
import { RACAS, RACA_INDIGENA } from "@/lib/bpa-i-v2/racas";
import { ETNIAS } from "@/lib/bpa-i-v2/etnias";
import { TIPOS_LOGRADOURO } from "@/lib/bpa-i-v2/tipos-logradouro";
import { MUNICIPIOS_IBGE } from "@/lib/bpa-i-v2/municipios-ibge";
import { campo, label, digitos, ROTULO_CAMPO, UFS, ComboField, type EnderecoPadrao } from "./ui";

// Parâmetros de contexto (TFD vs BPA-I) — DEFAULTS = TFD.
interface CtxPaciente {
  apenasTfd?: boolean;   // busca só pacientes do TFD (TFD=true; BPA-I=false)
  marcarTfd?: boolean;   // salvar marca `tfd=true` (TFD=true; BPA-I=false)
  origem?: "bpa_i" | "tfd" | "manual"; // primeira aparição (TFD='tfd'; BPA-I='bpa_i')
}

export function PacientePicker(props: CtxPaciente & {
  orgId: string; paciente: Paciente | null; onEscolhe: (p: Paciente | null) => void;
  titulo?: string; permitirAcompanhante?: boolean; enderecoPadrao?: EnderecoPadrao;
  onPendente?: (v: boolean) => void;
}) {
  const { orgId, paciente } = props;
  const apenasTfd = props.apenasTfd ?? true;
  const titulo = props.titulo ?? "Paciente";
  const termoTipo = titulo.toLowerCase(); // "paciente" ou "acompanhante"
  const [termo, setTermo] = useState("");
  const [sugestoes, setSugestoes] = useState<Paciente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [completar, setCompletar] = useState<Paciente | null>(null); // selecionado c/ cadastro incompleto
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Avisa o pai se há texto digitado sem seleção (para bloquear "salvar" com acompanhante pendente).
  useEffect(() => {
    props.onPendente?.(!paciente && !completar && termo.trim().length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, paciente, completar]);

  useEffect(() => {
    if (paciente) return;
    if (timer.current) clearTimeout(timer.current);
    const q = termo.trim();
    if (q.length < 3) { setSugestoes([]); return; }
    setBuscando(true);
    timer.current = setTimeout(async () => {
      setSugestoes(await buscarPacientes(orgId, q, apenasTfd));
      setBuscando(false);
    }, 250);
  }, [termo, orgId, paciente, apenasTfd]);

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
          Cadastro incompleto de <b>{completar.nome}</b>. Complete os dados obrigatórios para usar.
        </div>
        <PacienteForm orgId={orgId} paciente={completar} permitirAcompanhante={props.permitirAcompanhante}
          enderecoPadrao={props.enderecoPadrao} titulo={titulo}
          apenasTfd={apenasTfd} marcarTfd={props.marcarTfd} origem={props.origem}
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
      <div className={label}>{titulo}</div>
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
          <UserPlus className="size-3" /> Cadastrar novo {termoTipo}
        </button>
      )}
      {criando && (
        <PacienteForm orgId={orgId} nomeInicial={termo} permitirAcompanhante={props.permitirAcompanhante}
          enderecoPadrao={props.enderecoPadrao} titulo={titulo}
          apenasTfd={apenasTfd} marcarTfd={props.marcarTfd} origem={props.origem}
          onSalvo={(p) => { setCriando(false); props.onEscolhe(p); }} onCancela={() => setCriando(false)} />
      )}
    </div>
  );
}

// Cadastro completo do paciente — mesmos campos que o BPA-I coleta (+ os extras que já
// temos: nome social, nome da mãe). Autofill de município/UF pelo CEP (ViaCEP). Aceita um
// `paciente` para EDITAR/COMPLETAR (pré-preenche e atualiza) ou `nomeInicial` para criar.
// Exige todos os campos obrigatórios antes de salvar.
export function PacienteForm(props: CtxPaciente & { orgId: string; paciente?: Paciente; nomeInicial?: string; permitirAcompanhante?: boolean; enderecoPadrao?: EnderecoPadrao; titulo?: string; onSalvo: (p: Paciente) => void; onCancela: () => void }) {
  const ini = props.paciente;
  const marcarTfd = props.marcarTfd ?? true;
  const permitirAcompanhante = props.permitirAcompanhante ?? true;
  const rotuloTipo = (props.titulo ?? "paciente").toLowerCase();
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
  const [prontuario, setProntuario] = useState(ini?.prontuario ?? "");
  const [dataAdmissao, setDataAdmissao] = useState(ini?.data_admissao ?? "");
  const [responsavelTipo, setResponsavelTipo] = useState<"" | "paciente" | "mae">(
    ini?.responsavel_tipo === "paciente" || ini?.responsavel_tipo === "mae" ? ini.responsavel_tipo : "",
  );
  const [nomeResponsavel, setNomeResponsavel] = useState(ini?.nome_responsavel ?? "");
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
  const [acompanhante, setAcompanhante] = useState<Paciente | null>(null);
  const [acompanhantePendente, setAcompanhantePendente] = useState(false);
  const [usarMesmoEndereco, setUsarMesmoEndereco] = useState(false);
  const [faltando, setFaltando] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const errCls = (key: string) => (faltando.includes(key) ? " !border-destructive" : "");

  // Crivo CNS/CPF (dígito verificador). Curto = ainda digitando; inválido = completo e reprovado.
  const cnsDig = digitos(cns), cpfDig = digitos(cpf);
  const cnsInvalido = cnsDig.length === 15 && !validarCns(cnsDig);
  const cnsCurto = cnsDig.length > 0 && cnsDig.length < 15;
  const cnsOk = cnsDig.length === 15 && validarCns(cnsDig);
  const cpfInvalido = cpfDig.length === 11 && !validarCpf(cpfDig);
  const cpfCurto = cpfDig.length > 0 && cpfDig.length < 11;
  const cpfOk = cpfDig.length === 11 && validarCpf(cpfDig);
  const emailInvalido = email.trim().length > 0 && !emailValido(email);
  const telInvalido = digitos(telefone).length > 0 && !telefoneValido(telefone);
  const cepInvalido = digitos(cep).length > 0 && !cepValido(cep);

  // Carrega o acompanhante habitual já vinculado a este paciente (edição).
  useEffect(() => {
    if (ini?.acompanhante_id) carregarPaciente(ini.acompanhante_id, false).then((p) => p && setAcompanhante(p));
  }, [ini?.acompanhante_id]);

  // Responsável = o próprio paciente ou a mãe: o nome é derivado automaticamente (e
  // acompanha edições em Nome / Nome da mãe). "Outro" deixa o campo livre para digitar.
  useEffect(() => {
    if (responsavelTipo === "paciente") setNomeResponsavel(nome);
    else if (responsavelTipo === "mae") setNomeResponsavel(nomeMae);
  }, [responsavelTipo, nome, nomeMae]);

  // "Usar o mesmo endereço": copia o endereço-modelo (ex.: do paciente) para os campos.
  const ep = props.enderecoPadrao;
  const aplicarMesmoEndereco = (marcar: boolean) => {
    setUsarMesmoEndereco(marcar);
    if (marcar && ep) {
      setCep(ep.cep ?? ""); setCodLog(ep.cod_logradouro ?? ""); setLogradouro(ep.logradouro ?? "");
      setNumero(ep.numero ?? ""); setComplemento(ep.complemento ?? ""); setBairro(ep.bairro ?? "");
      setMunicipioNome(ep.municipio_nome ?? ""); setMunicipioIbge(ep.municipio_ibge ?? ""); setUf(ep.uf ?? "");
    }
  };

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
      logradouro: logradouro || null, numero: numero.trim() || null, bairro: bairro || null,
      uf: uf || null, telefone: digitos(telefone) || null,
    };
    // Crivo: CNS/CPF informado tem de estar completo e passar no dígito verificador.
    if (cnsDig.length > 0 && !cnsOk) { toast.error("CNS inválido (verifique os 15 dígitos)."); return; }
    if (cpfDig.length > 0 && !cpfOk) { toast.error("CPF inválido (verifique os 11 dígitos)."); return; }
    const faltam = pacienteFaltando(candidato);
    setFaltando(faltam);
    if (faltam.length > 0) {
      const rotulos = faltam.map((f) => ROTULO_CAMPO[f] ?? f).join(", ");
      toast.error(`Campos obrigatórios em falta: ${rotulos}.`);
      return;
    }
    // Acompanhante digitado mas não cadastrado: não deixa salvar sem cadastrá-lo (ou limpar).
    if (permitirAcompanhante && acompanhantePendente && !acompanhante) {
      toast.error("Cadastre o acompanhante digitado (ou limpe o campo) antes de salvar.");
      return;
    }
    setSalvando(true);
    const res = await salvarPaciente({
      id: props.paciente?.id, tfd: marcarTfd, origem: props.origem, acompanhante_id: acompanhante?.id ?? null,
      organizacao_id: props.orgId, nome, nome_social: nomeSocial, cns, cpf, sexo: sexo || null,
      nascimento: nascimento || null, nome_mae: nomeMae, nome_responsavel: nomeResponsavel, responsavel_tipo: responsavelTipo || null,
      data_admissao: dataAdmissao || null, prontuario, nacionalidade, raca_cor: racaCor || null,
      etnia: etnia || null, situacao_rua: situacaoRua || null, email, telefone, cep,
      cod_logradouro: codLog, logradouro, numero, complemento, bairro,
      municipio_nome: municipioNome, municipio_ibge: municipioIbge, uf,
    });
    setSalvando(false);
    if (!res.paciente) { toast.error(res.erro || `Falha ao salvar o ${rotuloTipo}.`); return; }
    toast.success(props.paciente ? "Cadastro atualizado." : `${rotuloTipo[0].toUpperCase()}${rotuloTipo.slice(1)} cadastrado.`);
    props.onSalvo(res.paciente);
  };

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">Identificação <span className="font-normal normal-case">(campos com * são obrigatórios)</span></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <div className={label}>Nome *</div>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo + errCls("nome")} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Nome social</div>
          <input value={nomeSocial} onChange={(e) => setNomeSocial(e.target.value)} className={campo} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Nome da mãe</div>
          <input value={nomeMae} onChange={(e) => setNomeMae(e.target.value)} className={campo} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Responsável é</div>
          <select value={responsavelTipo} onChange={(e) => setResponsavelTipo(e.target.value as "" | "paciente" | "mae")} className={campo} data-nocaps>
            <option value="">— (outro / digitar)</option>
            <option value="paciente">Próprio paciente</option>
            <option value="mae">Mãe</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Nome do responsável</div>
          <input value={nomeResponsavel} onChange={(e) => setNomeResponsavel(e.target.value)}
            readOnly={responsavelTipo === "paciente" || responsavelTipo === "mae"}
            className={campo + ((responsavelTipo === "paciente" || responsavelTipo === "mae") ? " bg-muted/60 text-muted-foreground cursor-not-allowed" : "")} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Nº do prontuário (CAPS)</div>
          <input value={prontuario} onChange={(e) => setProntuario(e.target.value.replace(/[^\d/]/g, ""))} data-nocaps inputMode="numeric" className={campo} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Data de admissão (CAPS)</div>
          <input type="date" value={dataAdmissao} onChange={(e) => setDataAdmissao(e.target.value)} data-nocaps className={campo} />
        </div>
        <div>
          <div className={label}>CNS</div>
          <input value={cns} onChange={(e) => setCns(digitos(e.target.value).slice(0, 15))} data-nocaps inputMode="numeric"
            className={campo + errCls("documento (CNS/CPF)") + (cnsInvalido ? " !border-destructive" : cnsOk ? " !border-emerald-500" : "")} />
          {cnsInvalido && <div className="mt-0.5 text-[11px] text-destructive">CNS inválido</div>}
          {cnsCurto && <div className="mt-0.5 text-[11px] text-muted-foreground">{cnsDig.length}/15 dígitos</div>}
          {cnsOk && <div className="mt-0.5 text-[11px] text-emerald-600">CNS válido ✓</div>}
        </div>
        <div>
          <div className={label}>CPF</div>
          <input value={cpf} onChange={(e) => setCpf(digitos(e.target.value).slice(0, 11))} data-nocaps inputMode="numeric"
            className={campo + errCls("documento (CNS/CPF)") + (cpfInvalido ? " !border-destructive" : cpfOk ? " !border-emerald-500" : "")} />
          {cpfInvalido && <div className="mt-0.5 text-[11px] text-destructive">CPF inválido</div>}
          {cpfCurto && <div className="mt-0.5 text-[11px] text-muted-foreground">{cpfDig.length}/11 dígitos</div>}
          {cpfOk && <div className="mt-0.5 text-[11px] text-emerald-600">CPF válido ✓</div>}
        </div>
        <div>
          <div className={label}>Sexo *</div>
          <select value={sexo} onChange={(e) => setSexo(e.target.value as "" | "M" | "F")} className={campo + errCls("sexo")}>
            <option value="">—</option><option value="M">Masculino</option><option value="F">Feminino</option>
          </select>
        </div>
        <div>
          <div className={label}>Nascimento *</div>
          <input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} className={campo + errCls("nascimento")} />
        </div>
        <div>
          <div className={label}>Nacionalidade *</div>
          <select value={nacionalidade} onChange={(e) => setNacionalidade(e.target.value)} className={campo + errCls("nacionalidade")}>
            {NACIONALIDADES.map((o) => <option key={o.code} value={o.code}>{o.code} — {o.label}</option>)}
          </select>
        </div>
        <div>
          <div className={label}>Raça/Cor *</div>
          <select value={racaCor} onChange={(e) => setRacaCor(e.target.value)} className={campo + errCls("raca_cor")}>
            <option value="">—</option>
            {RACAS.map((o) => <option key={o.code} value={o.code}>{o.code} — {o.label}</option>)}
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

      <div className="mb-1 mt-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase text-muted-foreground">Contato e endereço</span>
        {ep && (
          <label className="flex items-center gap-2 text-xs font-medium text-primary">
            <input type="checkbox" checked={usarMesmoEndereco} onChange={(e) => aplicarMesmoEndereco(e.target.checked)} className="size-4" />
            USAR O MESMO ENDEREÇO
          </label>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <div className={label}>E-mail</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className={campo + (emailInvalido ? " !border-destructive" : "")} data-nocaps />
          {emailInvalido && <div className="mt-0.5 text-[11px] text-destructive">E-mail inválido</div>}
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Telefone (DDD + número)</div>
          <input value={telefone} onChange={(e) => setTelefone(digitos(e.target.value).slice(0, 11))}
            className={campo + (telInvalido ? " !border-destructive" : "")} inputMode="numeric" data-nocaps />
          {telInvalido && <div className="mt-0.5 text-[11px] text-destructive">Telefone inválido</div>}
        </div>
        <div>
          <div className={label}>CEP *</div>
          <input value={cep} onChange={(e) => aoMudarCep(e.target.value)}
            className={campo + errCls("cep") + (cepInvalido ? " !border-destructive" : "")} inputMode="numeric" data-nocaps />
          {cepInvalido && <div className="mt-0.5 text-[11px] text-destructive">CEP deve ter 8 dígitos</div>}
        </div>
        <div>
          <div className={label}>Tipo logradouro</div>
          <select value={codLog} onChange={(e) => setCodLog(e.target.value)} className={campo}>
            <option value="">—</option>
            {TIPOS_LOGRADOURO.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Logradouro *</div>
          <input value={logradouro} onChange={(e) => setLogradouro(e.target.value)} className={campo + errCls("logradouro")} />
        </div>
        <div>
          <div className={label}>Número * <span className="font-normal normal-case text-muted-foreground">(SN se sem número)</span></div>
          <input value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase().slice(0, 10))} className={campo + errCls("numero")} />
        </div>
        <div>
          <div className={label}>Complemento</div>
          <input value={complemento} onChange={(e) => setComplemento(e.target.value)} className={campo} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Bairro *</div>
          <input value={bairro} onChange={(e) => setBairro(e.target.value)} className={campo + errCls("bairro")} />
        </div>
        <div className="sm:col-span-2">
          <div className={label}>Município</div>
          <ComboField value={municipioNome} onText={setMunicipioNome} opcoes={MUNICIPIOS_IBGE} minChars={3}
            placeholder="digite 3+ letras…"
            onPick={(o) => {
              const [cidade, sigla] = o.label.split(" - ");
              setMunicipioNome((cidade || o.label).trim());
              setMunicipioIbge(o.code);
              if (sigla) setUf(sigla.trim().toUpperCase());
            }} />
        </div>
        <div>
          <div className={label}>Cód. IBGE *</div>
          <input value={municipioIbge} onChange={(e) => setMunicipioIbge(digitos(e.target.value).slice(0, 7))} className={campo + errCls("municipio_ibge")} />
        </div>
        <div>
          <div className={label}>UF *</div>
          <ComboField value={uf} onText={(t) => setUf(t.toUpperCase().slice(0, 2))} opcoes={UFS} minChars={1}
            onPick={(o) => setUf(o.code)} className={campo + errCls("uf")} />
        </div>
      </div>

      {permitirAcompanhante && (
        <>
          <div className="mb-1 mt-3 text-[11px] font-semibold uppercase text-muted-foreground">Acompanhante (opcional)</div>
          <PacientePicker orgId={props.orgId} paciente={acompanhante} onEscolhe={setAcompanhante} titulo="Acompanhante"
            permitirAcompanhante={false} onPendente={setAcompanhantePendente}
            apenasTfd={props.apenasTfd} marcarTfd={marcarTfd} origem={props.origem}
            enderecoPadrao={{
              cep, cod_logradouro: codLog, logradouro, numero, complemento, bairro,
              municipio_nome: municipioNome, municipio_ibge: municipioIbge, uf,
            }} />
        </>
      )}

      {faltando.length > 0 && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          Faltam: {faltando.map((f) => ROTULO_CAMPO[f] ?? f).join(", ")}.
        </div>
      )}

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
