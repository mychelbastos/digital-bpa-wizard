import { useEffect, useRef, useState } from "react";
import { ClipboardCopy, Search, X } from "lucide-react";
import { buscarPacientes, registrarLeituraPaciente, type Paciente } from "@/lib/pacientes";
import { DigitBoxes, TextField } from "@/components/DigitBoxes";
import { ComboField } from "@/components/bpa-i-v2/ComboField";
import { FieldClear } from "@/components/bpa-i-v2/FieldClear";
import { AtendimentoAntigoAviso } from "@/components/bpa-i-v2/AtendimentoAntigoAviso";
import { ProcedimentoField } from "@/components/bpa-i-v2/ProcedimentoField";
import { buscarServClassDoProcedimento, type ServClassOpcao } from "@/lib/bpa-i-v2/procedimentos-sigtap";
import { RACAS, RACA_INDIGENA } from "@/lib/bpa-i-v2/racas";
import { ETNIAS } from "@/lib/bpa-i-v2/etnias";
import { NACIONALIDADES } from "@/lib/bpa-i-v2/nacionalidades";
import { TIPOS_LOGRADOURO } from "@/lib/bpa-i-v2/tipos-logradouro";
import { MUNICIPIOS_IBGE } from "@/lib/bpa-i-v2/municipios-ibge";
import { buscarInfoCep } from "@/lib/bpa-i-v2/cep";
import { buscarNomeServicoClasse, buscarNomeCid } from "@/lib/bpa-i-v2/nomes-sigtap";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";
import { dataFuturaOuInvalida, atendimentoAntigo, atendimentoForaDaCompetencia } from "@/lib/bpa-i-v2/validacao";
import { seqPreenchida } from "@/lib/bpa-i-v2/bpa-magnetico";
import { useValidacaoProcedimento } from "@/lib/bpa-i-v2/use-validacao-procedimento";
import { NomeAoFocarPopover } from "@/components/bpa-i-v2/NomeAoFocarPopover";
import { identificarPaciente, validarCpf } from "@/lib/bpa-i-v3/identificacao";
import { useExigenciasSigtap } from "@/lib/bpa-i-v3/exigencias-sigtap";
import { motivosObrigatoriosSeq, identificacaoIncompleta, parcialIncompleto } from "@/lib/bpa-i-v3/obrigatorios";
import * as L from "@/lib/bpai-v2-layout";
import type { SeqData } from "@/lib/bpai-v2-layout";

interface Box { left: number; width: number }

interface Props {
  si: number;
  seqTop: number;
  s: SeqData;
  // Competência do cabeçalho (mês+ano), p/ avisar quando a data de atendimento cair
  // fora dela (o BPA Magnético critica).
  profMes: string[];
  profAno: string[];
  hydrated: boolean;
  onUpdate: <K extends keyof SeqData>(field: K, value: SeqData[K]) => void;
  regBox: (key: string) => (els: HTMLInputElement[]) => void;
  focusBox: (key: string) => void;
  inputsOf: (...keys: string[]) => HTMLInputElement[];
  endOf: (arr: Box[]) => number;
  // Reporta ao componente pai a lista de motivos de erro desta sequência (undefined/[]
  // = tudo ok). O pai agrega as 3 sequências p/ bloquear Salvar/Gerar enquanto houver erro.
  onValidacaoChange?: (si: number, motivos: string[]) => void;
  // Quando fornecido (seq. 2/3 com paciente preenchido na anterior), mostra um botão para
  // copiar a IDENTIFICAÇÃO DO PACIENTE da sequência de cima (mesmo paciente, vários
  // procedimentos). Não copia dados do procedimento/atendimento.
  onRepetirPaciente?: () => void;
  // Identidade vinculada a um paciente do cadastro (pacienteId setado) → campos de
  // IDENTIFICAÇÃO ficam somente-leitura (edição só pelo "EDITAR PACIENTE" no trilho). Os
  // campos de PROCEDIMENTO/atendimento seguem editáveis.
  identidadeTravada?: boolean;
  // Busca inline direto na folha: ao digitar CPF/CNS ou o Nome, sugere pacientes do cadastro
  // (escopo da org). Escolher um vincula (autofill + trava a identidade).
  orgId?: string | null;
  onVincularPaciente?: (p: Paciente) => void;
}

// v3: identificação do paciente aceita CPF (11 díg.) OU CNS (15 díg.) no mesmo campo.
const IDENT_MOTIVO = "Identificação do paciente inválida — confira o CPF (11 díg.) ou o CNS (15 díg.).";
const DATA_INVALIDA_MOTIVO = "Data inválida ou no futuro.";
const CARATER_MOTIVO = "Caráter de atendimento é obrigatório.";
const DATA_COMPETENCIA_AVISO = "Data de atendimento fora do mês da competência — o BPA Magnético costuma criticar. Confirme a data ou a competência.";

// Uma "sequência" (linha de paciente) do BPA-I v2 — extraído da rota p/ poder chamar
// useValidacaoProcedimento (hook) uma vez por sequência, sem violar as regras do React
// (não dá pra chamar hooks dentro do .map() do componente pai).
export function SequenciaFields({ si, seqTop, s, profMes, profAno, hydrated, onUpdate: u, regBox, focusBox, inputsOf, endOf, onValidacaoChange, onRepetirPaciente, identidadeTravada = false, orgId, onVincularPaciente }: Props) {
  const R = L.REL;

  // ---- Busca inline de paciente (na própria folha: campo CPF/CNS ou Nome) ----
  // Termo: prioriza CPF/CNS (numérico) e cai para o Nome. 3+ chars. Some quando a seq está
  // vinculada (identidade travada) ou sem org. Dispensável (X) — não reabre no mesmo termo.
  const cnsDigitos = s.cnsPac.join("").replace(/\D/g, "");
  const termoBusca = cnsDigitos.length >= 3 ? cnsDigitos : (s.nomePac.trim().length >= 3 ? s.nomePac.trim() : "");
  const [sugestoesPac, setSugestoesPac] = useState<Paciente[]>([]);
  const dispensadoRef = useRef("");
  const podeBuscar = Boolean(orgId && onVincularPaciente) && !identidadeTravada;
  useEffect(() => {
    if (!podeBuscar || !termoBusca || dispensadoRef.current === termoBusca) { setSugestoesPac([]); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      const res = await buscarPacientes(orgId as string, termoBusca, false);
      if (!cancel) setSugestoesPac(res);
    }, 300);
    return () => { cancel = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termoBusca, podeBuscar]);
  const escolherPaciente = (p: Paciente) => {
    registrarLeituraPaciente(p.id);
    setSugestoesPac([]);
    dispensadoRef.current = "";
    onVincularPaciente?.(p);
  };
  const fmtDoc = (p: Paciente) => (p.cns ? `CNS ${p.cns}` : p.cpf ? `CPF ${p.cpf}` : "sem documento");
  // Identificação do paciente ainda vazia? (mostra o botão "repetir paciente" só aí, p/
  // não poluir; some assim que começa a digitar/copiar).
  const pacienteVazio = !s.cnsPac.some(Boolean) && !s.nomePac.trim() && !(s.cpfPac?.some(Boolean));
  const focarNome = () => setTimeout(() => document.getElementById(`s${si}-nome`)?.focus(), 0);
  // Ao completar um CPF válido (11 díg.), alinha os números à DIREITA (folgas à esquerda,
  // terminando na borda como o CNS) e pula direto para o Nome — sem obrigar Tab nas
  // 4 células vazias. Comprimentos diferentes seguem o fluxo normal (esq→dir).
  const onChangeIdent = (v: string[]) => {
    const digits = v.join("").replace(/\D/g, "");
    if (digits.length === 11 && validarCpf(digits)) {
      u("cnsPac", [...Array(R.cnsPacBoxes.length - 11).fill(""), ...digits.split("")]);
      focarNome();
    } else {
      u("cnsPac", v);
    }
  };
  // Campo inteligente CPF/CNS: detecta o tipo pelo comprimento e valida o dígito.
  const ident = identificarPaciente(s.cnsPac);
  const identInvalida = hydrated && ident.invalido;
  const dnInvalidaData = hydrated && dataFuturaOuInvalida(s.dataNasc);
  const daInvalidaData = hydrated && dataFuturaOuInvalida(s.dataAtend);
  const daAntiga = hydrated && atendimentoAntigo(s.dataAtend) && !s.dataAtendConfirmada;
  const daForaCompetencia = hydrated && atendimentoForaDaCompetencia(s.dataAtend, profMes, profAno);
  // Caráter é obrigatório em toda sequência que tem procedimento (vira linha no arquivo).
  const caraterFaltando = hydrated && seqPreenchida(s) && s.carater.join("").trim().length === 0;

  // Cruza procedimento × quantidade × idade × sexo × serviço/classe × CID contra o
  // SIGTAP oficial (uma única busca do procedimento, compartilhada entre as checagens).
  const val = useValidacaoProcedimento(s);
  // v3: Serviço/Classe e CID são obrigatórios quando o SIGTAP os exige p/ o procedimento.
  const exig = useExigenciasSigtap(s.codProc.join(""));
  // Regras de obrigatoriedade só valem quando a sequência vai virar linha (tem procedimento).
  const seqAtiva = hydrated && seqPreenchida(s);
  const obrigatorios = seqAtiva ? motivosObrigatoriosSeq(s, exig) : [];
  // Identificação vazia/incompleta acende a borda do campo (além de bloquear).
  const identBloqueio = seqAtiva && identificacaoIncompleta(s.cnsPac);
  // Campos de tamanho fixo começados mas incompletos (faltando caracteres): acendem
  // vermelho e bloqueiam mesmo sem procedimento — feedback imediato (ex.: data 20/03/202).
  const identParcial = hydrated && s.cnsPac.join("").replace(/\D/g, "").length > 0 && identificacaoIncompleta(s.cnsPac);
  const dnIncompleta = hydrated && parcialIncompleto(s.dataNasc, 8);
  const daIncompleta = hydrated && parcialIncompleto(s.dataAtend, 8);
  const cepIncompleto = hydrated && parcialIncompleto(s.cep, 8);
  const ibgeIncompleto = hydrated && parcialIncompleto(s.ibge, 7);
  const dnInvalida = dnInvalidaData || (hydrated && val.idadeInvalida) || dnIncompleta;
  const daInvalida = daInvalidaData || (hydrated && val.idadeInvalida) || daIncompleta;
  const dnTitle = dnIncompleta ? "Data de nascimento incompleta — faltam dígitos." : dnInvalidaData ? DATA_INVALIDA_MOTIVO : val.idadeMotivo;
  const daTitle = daIncompleta ? "Data do atendimento incompleta — faltam dígitos." : daInvalidaData ? DATA_INVALIDA_MOTIVO : (daForaCompetencia ? DATA_COMPETENCIA_AVISO : val.idadeMotivo);
  const daWarn = daAntiga || daForaCompetencia;

  // Cruza CEP × Cód. IBGE Município: busca o município real do CEP (ViaCEP, com
  // fallback por nome via BrasilAPI), compara com o município selecionado no campo ao
  // lado, e guarda o nome pro popover informativo (mesmo quando bate certinho).
  const cep = s.cep.join("");
  const ibge = s.ibge.join("");
  const [cepCidadeUf, setCepCidadeUf] = useState<string | null>(null);
  const [cepMotivo, setCepMotivo] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (cep.length !== 8) { setCepCidadeUf(null); setCepMotivo(undefined); return; }
    let cancel = false;
    buscarInfoCep(cep).then(({ ibge: ibgeCep, cidadeUf }) => {
      if (cancel) return;
      setCepCidadeUf(cidadeUf);
      if (!ibgeCep || ibge.length !== 7 || ibgeCep === ibge) { setCepMotivo(undefined); return; }
      const nomeCep = MUNICIPIOS_IBGE.find((m) => m.code === ibgeCep)?.label ?? ibgeCep;
      const nomeSel = MUNICIPIOS_IBGE.find((m) => m.code === ibge)?.label ?? ibge;
      setCepMotivo(`CEP pertence a ${nomeCep}, mas o município selecionado é ${nomeSel}.`);
    });
    return () => { cancel = true; };
  }, [cep, ibge]);
  const cepIbgeDivergente = hydrated && Boolean(cepMotivo);

  // Nome do Serviço + Classificação (popover informativo, mesma tabela do SIGTAP).
  const servico = s.servico.join("");
  const classProc = s.classProc.join("");
  const [nomeServicoClasse, setNomeServicoClasse] = useState<string | null>(null);
  useEffect(() => {
    if (servico.length !== 3 || classProc.length !== 3) { setNomeServicoClasse(null); return; }
    let cancel = false;
    buscarNomeServicoClasse(servico, classProc).then((nome) => { if (!cancel) setNomeServicoClasse(nome); });
    return () => { cancel = true; };
  }, [servico, classProc]);

  // Auto-preenche Serviço/Classificação a partir do procedimento (SIGTAP): uma combinação →
  // preenche; várias → seletor. Respeita ficha carregada (não sobrescreve serviço já salvo).
  const codProc = s.codProc.join("");
  const [servClassOpcoes, setServClassOpcoes] = useState<ServClassOpcao[]>([]);
  const servClassProcRef = useRef("");
  useEffect(() => {
    if (codProc.length !== 10) { setServClassOpcoes([]); return; }
    const anterior = servClassProcRef.current;
    if (anterior === codProc) return;
    const eraTroca = anterior.length === 10; // já havia OUTRO procedimento completo antes
    servClassProcRef.current = codProc;
    setServClassOpcoes([]);
    const comp = `${profAno.join("")}${profMes.join("")}`;
    buscarServClassDoProcedimento(codProc, /^\d{6}$/.test(comp) ? comp : null).then((combos) => {
      if (servClassProcRef.current !== codProc) return;
      const vazio = !s.servico.some(Boolean) && !s.classProc.some(Boolean);
      if (!vazio && !eraTroca) return; // respeita serviço já preenchido (ficha carregada)
      if (combos.length === 1) { u("servico", combos[0].servico.split("")); u("classProc", combos[0].classificacao.split("")); }
      else if (combos.length > 1) setServClassOpcoes(combos);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codProc]);

  // Nome/descrição do CID — só existe se o código estiver na tabela CID-10 (SIGTAP) importada.
  // Quando o código digitado (>=3) NÃO consta na tabela, marca cidNaoEncontrado = aviso
  // (não bloqueia): pega diagnóstico digitado errado antes de gerar o .txt.
  const cidTxt = s.cid.join("").trim();
  const [nomeCid, setNomeCid] = useState<string | null>(null);
  const [cidNaoEncontrado, setCidNaoEncontrado] = useState(false);
  useEffect(() => {
    if (cidTxt.length < 3) { setNomeCid(null); setCidNaoEncontrado(false); return; }
    let cancel = false;
    buscarNomeCid(cidTxt).then((nome) => {
      if (cancel) return;
      setNomeCid(nome);
      setCidNaoEncontrado(nome === null); // consultou e não achou na CID-10
    });
    return () => { cancel = true; };
  }, [cidTxt]);

  // Nome abreviado do Caráter de Atendimento selecionado, mostrado ao lado do código.
  const caraterNome = CARATERES.find((c) => c.code === s.carater.join(""))?.curto;

  const motivos = [...new Set([
    identInvalida && IDENT_MOTIVO,
    identParcial && "Identificação do paciente incompleta — CPF tem 11 e CNS tem 15 dígitos.",
    (dnInvalidaData || daInvalidaData) && DATA_INVALIDA_MOTIVO,
    dnIncompleta && "Data de nascimento incompleta (faltam dígitos).",
    daIncompleta && "Data do atendimento incompleta (faltam dígitos).",
    cepIncompleto && "CEP incompleto (8 dígitos).",
    ibgeIncompleto && "Cód. IBGE do município incompleto (7 dígitos).",
    caraterFaltando && CARATER_MOTIVO,
    cepMotivo,
    ...val.motivos,
    ...obrigatorios,
  ].filter((m): m is string => Boolean(m)))];

  useEffect(() => {
    onValidacaoChange?.(si, motivos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motivos.join("|")]);

  return (
    <div>
      {/* Paciente row 1: CPF/CNS (inteligente) + Nome */}
      <DigitBoxes id={`s${si}-cns`} top={seqTop + R.cnsPac} height={L.DIGIT_H} boxes={R.cnsPacBoxes}
        values={s.cnsPac} onChange={onChangeIdent} onComplete={focarNome} invalid={identInvalida || identBloqueio || identParcial} title={identInvalida ? IDENT_MOTIVO : "Identificação do paciente é obrigatória e completa (CPF 11 ou CNS 15 dígitos)."} dimEmpty={ident.tipo === "CPF" && ident.valido} clearable={!identidadeTravada} readOnly={identidadeTravada} compact />
      {/* Botão "repetir paciente" (só na tela; ignorado no PDF): copia a identificação do
          paciente da sequência de cima. Aparece na SEQ 2/3 enquanto a identificação está
          vazia; some ao começar a preencher (dá lugar ao selo CPF/CNS). */}
      {onRepetirPaciente && pacienteVazio && (
        <button
          type="button"
          tabIndex={-1}
          data-html2canvas-ignore="true"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRepetirPaciente}
          title="Copiar a identificação do paciente da sequência de cima (mesmo paciente)"
          className="absolute z-[60] inline-flex items-center gap-1 rounded bg-sky-600 px-1.5 py-px text-[9px] font-semibold leading-none text-white shadow-sm transition-colors hover:bg-sky-700"
          style={{ top: `calc(${seqTop + R.cnsPac}% - 1.7%)`, left: `${R.cnsPacBoxes[0].left}%` }}
        >
          <ClipboardCopy style={{ width: 10, height: 10 }} /> Repetir paciente
        </button>
      )}
      {/* Selo do tipo detectado (só na tela; ignorado no PDF): CPF aos 11 díg., CNS aos 15. */}
      {ident.tipo && (
        <div
          data-html2canvas-ignore="true"
          className={`absolute z-[60] flex items-center rounded px-1 py-px text-[9px] font-semibold leading-none ${
            ident.invalido
              ? "bg-rose-100 text-rose-700"
              : ident.valido
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
          }`}
          style={{ top: `calc(${seqTop + R.cnsPac}% - 1.55%)`, left: `${R.cnsPacBoxes[0].left}%` }}
          title={ident.completo ? (ident.valido ? `${ident.tipo} válido` : IDENT_MOTIVO) : `Digitando ${ident.tipo}…`}
        >
          {ident.completo ? (ident.valido ? "✓ " : "✗ ") : ""}{ident.tipo}
        </div>
      )}
      <TextField id={`s${si}-nome`} top={seqTop + R.cnsPac} left={R.nomePac.left} width={R.nomePac.width} height={L.DIGIT_H}
        value={s.nomePac} onChange={(v) => u("nomePac", v)} uppercase readOnly={identidadeTravada} />
      {/* Sugestões da busca inline de paciente (some no PDF). Ancorado logo abaixo da linha
          CPF/CNS + Nome; escolher vincula (autofill + trava a identidade). */}
      {sugestoesPac.length > 0 && (
        <div
          data-html2canvas-ignore="true"
          className="absolute z-[75] max-h-44 overflow-auto rounded-md border border-border bg-popover text-left shadow-lg"
          style={{
            top: `${seqTop + R.cnsPac + L.DIGIT_H + 0.3}%`,
            left: `${R.cnsPacBoxes[0].left}%`,
            width: `${R.nomePac.left + R.nomePac.width - R.cnsPacBoxes[0].left}%`,
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Search style={{ width: 11, height: 11 }} /> Pacientes encontrados</span>
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { dispensadoRef.current = termoBusca; setSugestoesPac([]); }}
              className="inline-flex items-center gap-0.5 rounded px-1 text-muted-foreground hover:text-foreground"><X style={{ width: 11, height: 11 }} /> dispensar</button>
          </div>
          {sugestoesPac.map((p) => (
            <button key={p.id} type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolherPaciente(p)}
              className="flex w-full flex-col items-start px-2 py-1.5 text-left hover:bg-muted">
              <span className="text-[12px] font-medium text-foreground">{p.nome}</span>
              <span className="text-[10px] text-muted-foreground">{fmtDoc(p)}{p.nascimento ? ` · ${p.nascimento.split("-").reverse().join("/")}` : ""}</span>
            </button>
          ))}
        </div>
      )}

      {/* Row 2: Sexo / Data Nasc / Nacion / RaçaCor / Etnia / CEP / IBGE */}
      <TextField top={seqTop + R.row2} left={R.sexoM.left} width={R.sexoM.width} height={L.DIGIT_H} align="center"
        value={s.sexo === "M" ? "X" : ""} onChange={(v) => u("sexo", v ? "M" : "")} invalid={hydrated && s.sexo === "M" && val.sexoInvalido} title={val.sexoMotivo} readOnly={identidadeTravada} />
      <TextField top={seqTop + R.row2} left={R.sexoF.left} width={R.sexoF.width} height={L.DIGIT_H} align="center"
        value={s.sexo === "F" ? "X" : ""} onChange={(v) => u("sexo", v ? "F" : "")} invalid={hydrated && s.sexo === "F" && val.sexoInvalido} title={val.sexoMotivo} readOnly={identidadeTravada} />
      <DigitBoxes id={`s${si}-dnd`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascDia}
        values={s.dataNasc.slice(0, 2)} onChange={(v) => u("dataNasc", [...v, ...s.dataNasc.slice(2)])} registerRefs={regBox(`s${si}-dnd`)} onComplete={() => focusBox(`s${si}-dnm`)} invalid={dnInvalida} title={dnTitle} readOnly={identidadeTravada} compact />
      <DigitBoxes id={`s${si}-dnm`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascMes}
        values={s.dataNasc.slice(2, 4)} onChange={(v) => u("dataNasc", [...s.dataNasc.slice(0, 2), ...v, ...s.dataNasc.slice(4)])} registerRefs={regBox(`s${si}-dnm`)} onComplete={() => focusBox(`s${si}-dna`)} invalid={dnInvalida} title={dnTitle} readOnly={identidadeTravada} compact />
      <DigitBoxes id={`s${si}-dna`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascAno}
        values={s.dataNasc.slice(4, 8)} onChange={(v) => u("dataNasc", [...s.dataNasc.slice(0, 4), ...v])} registerRefs={regBox(`s${si}-dna`)} invalid={dnInvalida} title={dnTitle} readOnly={identidadeTravada} compact />
      {!identidadeTravada && (
        <FieldClear top={seqTop + R.row2} left={endOf(R.dataNascAno) + 0.5} height={L.DIGIT_H}
          getInputs={() => inputsOf(`s${si}-dnd`, `s${si}-dnm`, `s${si}-dna`)}
          onClear={() => u("dataNasc", Array(8).fill(""))} />
      )}
      {/* Idade NÃO tem campo no papel do BPA-I nem input na tela: é derivada na geração
          (anos completos na data de atendimento). SeqData.idade existe só como override
          opcional do modelo (usado pelo harness de regressão), nunca capturado aqui. */}
      <ComboField top={seqTop + R.row2} left={R.nacionalidade.left} width={R.nacionalidade.width} height={L.DIGIT_H}
        options={NACIONALIDADES} value={s.nacionalidade} onChange={(v) => u("nacionalidade", v)} disabled={identidadeTravada} uppercase center />
      <ComboField top={seqTop + R.row2} left={R.racaCor.left} width={R.racaCor.width} height={L.DIGIT_H}
        options={RACAS} value={s.racaCor}
        onChange={(v) => {
          u("racaCor", v);
          // Etnia só vale para Indígena; em qualquer mudança de Raça/Cor, limpa.
          u("etnia", "");
        }} disabled={identidadeTravada} uppercase center />
      <ComboField top={seqTop + R.row2} left={R.etnia.left} width={R.etnia.width} height={L.DIGIT_H}
        options={ETNIAS} value={s.etnia} onChange={(v) => u("etnia", v)}
        disabled={identidadeTravada || s.racaCor !== RACA_INDIGENA} uppercase />
      <DigitBoxes id={`s${si}-cep`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.cep}
        values={s.cep} onChange={(v) => u("cep", v)} registerRefs={regBox(`s${si}-cep`)} invalid={cepIbgeDivergente || cepIncompleto} title={cepIncompleto ? "CEP incompleto (8 dígitos)." : cepMotivo} clearable={!identidadeTravada} readOnly={identidadeTravada} compact />
      <NomeAoFocarPopover top={seqTop + R.row2} left={R.cep[0].left} height={L.DIGIT_H}
        getInputs={() => inputsOf(`s${si}-cep`)} texto={cepMotivo ?? cepCidadeUf} />
      <ComboField top={seqTop + R.row2} left={R.ibge[0].left}
        width={R.ibge[R.ibge.length - 1].left + R.ibge[R.ibge.length - 1].width - R.ibge[0].left}
        height={L.DIGIT_H} options={MUNICIPIOS_IBGE} display="code" mostrarTodosAoFocar={false}
        value={s.ibge.join("")} onChange={(v) => u("ibge", v.split(""))} disabled={identidadeTravada} invalid={cepIbgeDivergente || ibgeIncompleto} title={ibgeIncompleto ? "Cód. IBGE incompleto (7 dígitos)." : cepMotivo} />

      {/* Row 3: Cod Logradouro / Endereço / Número / Complemento */}
      <ComboField top={seqTop + R.row3} left={R.codLog[0].left}
        width={R.codLog[R.codLog.length - 1].left + R.codLog[R.codLog.length - 1].width - R.codLog[0].left}
        height={L.DIGIT_H} options={TIPOS_LOGRADOURO}
        value={s.codLog.join("")} onChange={(v) => u("codLog", v.split(""))} disabled={identidadeTravada} uppercase />
      <TextField top={seqTop + R.row3} left={R.endereco.left} width={R.endereco.width} height={L.DIGIT_H}
        value={s.endereco} onChange={(v) => u("endereco", v)} uppercase readOnly={identidadeTravada} />
      <DigitBoxes id={`s${si}-num`} top={seqTop + R.row3} height={L.DIGIT_H} boxes={R.numero}
        values={s.numero} onChange={(v) => u("numero", v)} numeric={false} rightAlign clearable={!identidadeTravada} readOnly={identidadeTravada} compact />
      <TextField top={seqTop + R.row3} left={R.complemento.left} width={R.complemento.width} height={L.DIGIT_H}
        value={s.complemento} onChange={(v) => u("complemento", v)} uppercase readOnly={identidadeTravada} />

      {/* Row 4: Bairro / DDD / Telefone / Email */}
      <TextField top={seqTop + R.row4} left={R.bairro.left} width={R.bairro.width} height={L.DIGIT_H}
        value={s.bairro} onChange={(v) => u("bairro", v)} uppercase readOnly={identidadeTravada} />
      <DigitBoxes id={`s${si}-ddd`} top={seqTop + R.row4} height={L.DIGIT_H} boxes={R.ddd}
        values={s.ddd} onChange={(v) => u("ddd", v)} registerRefs={regBox(`s${si}-ddd`)} onComplete={() => focusBox(`s${si}-tel`)} readOnly={identidadeTravada} compact />
      <DigitBoxes id={`s${si}-tel`} top={seqTop + R.row4} height={L.DIGIT_H} boxes={R.telefone}
        values={s.telefone} onChange={(v) => u("telefone", v)} registerRefs={regBox(`s${si}-tel`)} readOnly={identidadeTravada} compact />
      {!identidadeTravada && (
        <FieldClear top={seqTop + R.row4} left={endOf(R.telefone) + 0.5} height={L.DIGIT_H}
          getInputs={() => inputsOf(`s${si}-ddd`, `s${si}-tel`)}
          onClear={() => { u("ddd", Array(2).fill("")); u("telefone", Array(8).fill("")); }} />
      )}
      <TextField top={seqTop + R.row4} left={R.email.left} width={R.email.width} height={L.DIGIT_H}
        value={s.email} onChange={(v) => u("email", v)} readOnly={identidadeTravada} />

      {/* Procedimento row 1: Data atend / Cód proc / Qtde / CNPJ */}
      <DigitBoxes id={`s${si}-dad`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendDia}
        values={s.dataAtend.slice(0, 2)} onChange={(v) => u("dataAtend", [...v, ...s.dataAtend.slice(2)])} registerRefs={regBox(`s${si}-dad`)} onComplete={() => focusBox(`s${si}-dam`)} invalid={daInvalida} warn={daWarn} title={daTitle} compact />
      <DigitBoxes id={`s${si}-dam`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendMes}
        values={s.dataAtend.slice(2, 4)} onChange={(v) => u("dataAtend", [...s.dataAtend.slice(0, 2), ...v, ...s.dataAtend.slice(4)])} registerRefs={regBox(`s${si}-dam`)} onComplete={() => focusBox(`s${si}-daa`)} invalid={daInvalida} warn={daWarn} title={daTitle} compact />
      <DigitBoxes id={`s${si}-daa`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendAno}
        values={s.dataAtend.slice(4, 8)} onChange={(v) => u("dataAtend", [...s.dataAtend.slice(0, 4), ...v])} registerRefs={regBox(`s${si}-daa`)} invalid={daInvalida} warn={daWarn} title={daTitle} compact />
      <FieldClear top={seqTop + R.procRow1} left={endOf(R.dataAtendAno) + 0.5} height={L.DIGIT_H}
        getInputs={() => inputsOf(`s${si}-dad`, `s${si}-dam`, `s${si}-daa`)}
        onClear={() => u("dataAtend", Array(8).fill(""))} />
      <AtendimentoAntigoAviso top={seqTop + R.procRow1} left={1.5} height={L.DIGIT_H}
        ativo={daAntiga} onConfirmar={() => u("dataAtendConfirmada", true)} />
      <ProcedimentoField id={`s${si}-cp`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.codProc}
        values={s.codProc} onChange={(v) => u("codProc", v)} clearable
        naoEncontrado={hydrated && val.procNaoEncontrado} nomeEncontrado={val.proc?.nome ?? null} />
      <DigitBoxes id={`s${si}-q`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.qtde}
        values={s.qtde} onChange={(v) => u("qtde", v)} rightAlign invalid={hydrated && val.qtdeInvalida} title={val.qtdeMotivo} clearable compact separated />
      <DigitBoxes id={`s${si}-cnpj`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.cnpj}
        values={s.cnpj} onChange={(v) => u("cnpj", v)} clearable compact />

      {/* Procedimento row 2: Serviço / Class / CID / Caráter / Autorização */}
      <DigitBoxes id={`s${si}-srv`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.servico}
        values={s.servico} onChange={(v) => u("servico", v)} registerRefs={regBox(`s${si}-srv`)} invalid={hydrated && val.servicoInvalido} title={val.servicoMotivo} compact />
      <DigitBoxes id={`s${si}-cls`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.classProc}
        values={s.classProc} onChange={(v) => u("classProc", v)} registerRefs={regBox(`s${si}-cls`)} invalid={hydrated && val.servicoInvalido} title={val.servicoMotivo} compact />
      <NomeAoFocarPopover top={seqTop + R.procRow2} left={R.servico[0].left} height={L.DIGIT_H}
        getInputs={() => inputsOf(`s${si}-srv`, `s${si}-cls`)} texto={val.servicoMotivo ?? nomeServicoClasse} />
      {servClassOpcoes.length > 1 && (
        <select
          className="absolute z-[60] rounded border border-amber-400 bg-white px-1 py-0.5 text-[10px] text-amber-900 shadow"
          style={{ top: `calc(${seqTop + R.procRow2 + L.DIGIT_H}% + 1px)`, left: `${R.servico[0].left}%`, minWidth: "240px", maxWidth: "48%" }}
          value={servClassOpcoes.findIndex((o) => o.servico === servico && o.classificacao === classProc)}
          onChange={(e) => { const o = servClassOpcoes[Number(e.target.value)]; if (o) { u("servico", o.servico.split("")); u("classProc", o.classificacao.split("")); } }}
          title="Este procedimento tem mais de um Serviço/Classificação — escolha o da unidade"
        >
          <option value={-1}>Serviço/Classificação — escolha…</option>
          {servClassOpcoes.map((o, k) => <option key={k} value={k}>{o.label}</option>)}
        </select>
      )}
      <DigitBoxes id={`s${si}-cid`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.cid}
        values={s.cid} onChange={(v) => u("cid", v)} numeric={false} uppercase registerRefs={regBox(`s${si}-cid`)}
        invalid={hydrated && val.cidInvalido}
        warn={hydrated && cidNaoEncontrado && !val.cidInvalido}
        title={val.cidMotivo ?? (cidNaoEncontrado ? `CID ${cidTxt} não consta na tabela CID-10 — confira o diagnóstico.` : undefined)} compact />
      <NomeAoFocarPopover top={seqTop + R.procRow2} left={R.cid[0].left} height={L.DIGIT_H}
        getInputs={() => inputsOf(`s${si}-cid`)}
        texto={val.cidMotivo ?? (cidNaoEncontrado ? `⚠ CID ${cidTxt} não consta na tabela CID-10 — confira o diagnóstico.` : nomeCid)} />
      <ComboField top={seqTop + R.procRow2} left={R.carater[0].left}
        width={R.carater[R.carater.length - 1].left + R.carater[R.carater.length - 1].width - R.carater[0].left}
        height={L.DIGIT_H} options={CARATERES} display="code"
        value={s.carater.join("")} onChange={(v) => u("carater", v.split(""))}
        invalid={caraterFaltando} title={CARATER_MOTIVO} uppercase />
      {caraterNome && (
        <div
          data-html2canvas-ignore="true"
          className="absolute flex items-center overflow-hidden whitespace-nowrap text-[10px] font-medium text-muted-foreground"
          style={{
            top: `${seqTop + R.procRow2}%`,
            left: `${R.carater[R.carater.length - 1].left + R.carater[R.carater.length - 1].width + 1}%`,
            width: `${R.autorizacao[0].left - (R.carater[R.carater.length - 1].left + R.carater[R.carater.length - 1].width) - 1.5}%`,
            height: `${L.DIGIT_H}%`,
          }}
        >
          {caraterNome.toUpperCase()}
        </div>
      )}
      <DigitBoxes id={`s${si}-aut`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.autorizacao}
        values={s.autorizacao} onChange={(v) => u("autorizacao", v)} clearable compact />
    </div>
  );
}
