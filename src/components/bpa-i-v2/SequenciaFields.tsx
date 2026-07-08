import { useEffect } from "react";
import { DigitBoxes, TextField } from "@/components/DigitBoxes";
import { ComboField } from "@/components/bpa-i-v2/ComboField";
import { FieldClear } from "@/components/bpa-i-v2/FieldClear";
import { AtendimentoAntigoAviso } from "@/components/bpa-i-v2/AtendimentoAntigoAviso";
import { ProcedimentoField } from "@/components/bpa-i-v2/ProcedimentoField";
import { RACAS, RACA_INDIGENA } from "@/lib/bpa-i-v2/racas";
import { ETNIAS } from "@/lib/bpa-i-v2/etnias";
import { NACIONALIDADES } from "@/lib/bpa-i-v2/nacionalidades";
import { TIPOS_LOGRADOURO } from "@/lib/bpa-i-v2/tipos-logradouro";
import { MUNICIPIOS_IBGE } from "@/lib/bpa-i-v2/municipios-ibge";
import { CARATERES } from "@/lib/bpa-i-v2/carateres";
import { cnsInvalido, dataFuturaOuInvalida, atendimentoAntigo } from "@/lib/bpa-i-v2/validacao";
import { useValidacaoProcedimento } from "@/lib/bpa-i-v2/use-validacao-procedimento";
import * as L from "@/lib/bpai-v2-layout";
import type { SeqData } from "@/lib/bpai-v2-layout";

interface Box { left: number; width: number }

interface Props {
  si: number;
  seqTop: number;
  s: SeqData;
  hydrated: boolean;
  onUpdate: <K extends keyof SeqData>(field: K, value: SeqData[K]) => void;
  regBox: (key: string) => (els: HTMLInputElement[]) => void;
  focusBox: (key: string) => void;
  inputsOf: (...keys: string[]) => HTMLInputElement[];
  endOf: (arr: Box[]) => number;
  // Reporta ao componente pai a lista de motivos de erro desta sequência (undefined/[]
  // = tudo ok). O pai agrega as 3 sequências p/ bloquear Salvar/Gerar enquanto houver erro.
  onValidacaoChange?: (si: number, motivos: string[]) => void;
}

const CNS_MOTIVO = "CNS inválido (dígito verificador não confere).";
const DATA_INVALIDA_MOTIVO = "Data inválida ou no futuro.";

// Uma "sequência" (linha de paciente) do BPA-I v2 — extraído da rota p/ poder chamar
// useValidacaoProcedimento (hook) uma vez por sequência, sem violar as regras do React
// (não dá pra chamar hooks dentro do .map() do componente pai).
export function SequenciaFields({ si, seqTop, s, hydrated, onUpdate: u, regBox, focusBox, inputsOf, endOf, onValidacaoChange }: Props) {
  const R = L.REL;
  const cnsPacInvalido = hydrated && cnsInvalido(s.cnsPac.join(""));
  const dnInvalidaData = hydrated && dataFuturaOuInvalida(s.dataNasc);
  const daInvalidaData = hydrated && dataFuturaOuInvalida(s.dataAtend);
  const daAntiga = hydrated && atendimentoAntigo(s.dataAtend) && !s.dataAtendConfirmada;

  // Cruza procedimento × quantidade × idade × sexo × serviço/classe × CID contra o
  // SIGTAP oficial (uma única busca do procedimento, compartilhada entre as checagens).
  const val = useValidacaoProcedimento(s);
  const dnInvalida = dnInvalidaData || (hydrated && val.idadeInvalida);
  const daInvalida = daInvalidaData || (hydrated && val.idadeInvalida);
  const dnTitle = dnInvalidaData ? DATA_INVALIDA_MOTIVO : val.idadeMotivo;
  const daTitle = daInvalidaData ? DATA_INVALIDA_MOTIVO : val.idadeMotivo;

  const motivos = [
    cnsPacInvalido && CNS_MOTIVO,
    (dnInvalidaData || daInvalidaData) && DATA_INVALIDA_MOTIVO,
    ...val.motivos,
  ].filter((m): m is string => Boolean(m));

  useEffect(() => {
    onValidacaoChange?.(si, motivos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motivos.join("|")]);

  return (
    <div>
      {/* Paciente row 1: CNS + Nome */}
      <DigitBoxes id={`s${si}-cns`} top={seqTop + R.cnsPac} height={L.DIGIT_H} boxes={R.cnsPacBoxes}
        values={s.cnsPac} onChange={(v) => u("cnsPac", v)} invalid={cnsPacInvalido} title={CNS_MOTIVO} clearable compact />
      <TextField top={seqTop + R.cnsPac} left={R.nomePac.left} width={R.nomePac.width} height={L.DIGIT_H}
        value={s.nomePac} onChange={(v) => u("nomePac", v)} />

      {/* Row 2: Sexo / Data Nasc / Nacion / RaçaCor / Etnia / CEP / IBGE */}
      <TextField top={seqTop + R.row2} left={R.sexoM.left} width={R.sexoM.width} height={L.DIGIT_H} align="center"
        value={s.sexo === "M" ? "X" : ""} onChange={(v) => u("sexo", v ? "M" : "")} invalid={hydrated && s.sexo === "M" && val.sexoInvalido} title={val.sexoMotivo} />
      <TextField top={seqTop + R.row2} left={R.sexoF.left} width={R.sexoF.width} height={L.DIGIT_H} align="center"
        value={s.sexo === "F" ? "X" : ""} onChange={(v) => u("sexo", v ? "F" : "")} invalid={hydrated && s.sexo === "F" && val.sexoInvalido} title={val.sexoMotivo} />
      <DigitBoxes id={`s${si}-dnd`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascDia}
        values={s.dataNasc.slice(0, 2)} onChange={(v) => u("dataNasc", [...v, ...s.dataNasc.slice(2)])} registerRefs={regBox(`s${si}-dnd`)} onComplete={() => focusBox(`s${si}-dnm`)} invalid={dnInvalida} title={dnTitle} compact />
      <DigitBoxes id={`s${si}-dnm`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascMes}
        values={s.dataNasc.slice(2, 4)} onChange={(v) => u("dataNasc", [...s.dataNasc.slice(0, 2), ...v, ...s.dataNasc.slice(4)])} registerRefs={regBox(`s${si}-dnm`)} onComplete={() => focusBox(`s${si}-dna`)} invalid={dnInvalida} title={dnTitle} compact />
      <DigitBoxes id={`s${si}-dna`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascAno}
        values={s.dataNasc.slice(4, 8)} onChange={(v) => u("dataNasc", [...s.dataNasc.slice(0, 4), ...v])} registerRefs={regBox(`s${si}-dna`)} invalid={dnInvalida} title={dnTitle} compact />
      <FieldClear top={seqTop + R.row2} left={endOf(R.dataNascAno) + 0.5} height={L.DIGIT_H}
        getInputs={() => inputsOf(`s${si}-dnd`, `s${si}-dnm`, `s${si}-dna`)}
        onClear={() => u("dataNasc", Array(8).fill(""))} />
      <ComboField top={seqTop + R.row2} left={R.nacionalidade.left} width={R.nacionalidade.width} height={L.DIGIT_H}
        options={NACIONALIDADES} value={s.nacionalidade} onChange={(v) => u("nacionalidade", v)} />
      <ComboField top={seqTop + R.row2} left={R.racaCor.left} width={R.racaCor.width} height={L.DIGIT_H}
        options={RACAS} value={s.racaCor}
        onChange={(v) => {
          u("racaCor", v);
          // Etnia só vale para Indígena; em qualquer mudança de Raça/Cor, limpa.
          u("etnia", "");
        }} />
      <ComboField top={seqTop + R.row2} left={R.etnia.left} width={R.etnia.width} height={L.DIGIT_H}
        options={ETNIAS} value={s.etnia} onChange={(v) => u("etnia", v)}
        disabled={s.racaCor !== RACA_INDIGENA} />
      <DigitBoxes id={`s${si}-cep`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.cep}
        values={s.cep} onChange={(v) => u("cep", v)} clearable compact />
      <ComboField top={seqTop + R.row2} left={R.ibge[0].left}
        width={R.ibge[R.ibge.length - 1].left + R.ibge[R.ibge.length - 1].width - R.ibge[0].left}
        height={L.DIGIT_H} options={MUNICIPIOS_IBGE} display="code"
        value={s.ibge.join("")} onChange={(v) => u("ibge", v.split(""))} />

      {/* Row 3: Cod Logradouro / Endereço / Número / Complemento */}
      <ComboField top={seqTop + R.row3} left={R.codLog[0].left}
        width={R.codLog[R.codLog.length - 1].left + R.codLog[R.codLog.length - 1].width - R.codLog[0].left}
        height={L.DIGIT_H} options={TIPOS_LOGRADOURO}
        value={s.codLog.join("")} onChange={(v) => u("codLog", v.split(""))} />
      <TextField top={seqTop + R.row3} left={R.endereco.left} width={R.endereco.width} height={L.DIGIT_H}
        value={s.endereco} onChange={(v) => u("endereco", v)} />
      <DigitBoxes id={`s${si}-num`} top={seqTop + R.row3} height={L.DIGIT_H} boxes={R.numero}
        values={s.numero} onChange={(v) => u("numero", v)} numeric={false} clearable compact />
      <TextField top={seqTop + R.row3} left={R.complemento.left} width={R.complemento.width} height={L.DIGIT_H}
        value={s.complemento} onChange={(v) => u("complemento", v)} />

      {/* Row 4: Bairro / DDD / Telefone / Email */}
      <TextField top={seqTop + R.row4} left={R.bairro.left} width={R.bairro.width} height={L.DIGIT_H}
        value={s.bairro} onChange={(v) => u("bairro", v)} />
      <DigitBoxes id={`s${si}-ddd`} top={seqTop + R.row4} height={L.DIGIT_H} boxes={R.ddd}
        values={s.ddd} onChange={(v) => u("ddd", v)} registerRefs={regBox(`s${si}-ddd`)} onComplete={() => focusBox(`s${si}-tel`)} compact />
      <DigitBoxes id={`s${si}-tel`} top={seqTop + R.row4} height={L.DIGIT_H} boxes={R.telefone}
        values={s.telefone} onChange={(v) => u("telefone", v)} registerRefs={regBox(`s${si}-tel`)} compact />
      <FieldClear top={seqTop + R.row4} left={endOf(R.telefone) + 0.5} height={L.DIGIT_H}
        getInputs={() => inputsOf(`s${si}-ddd`, `s${si}-tel`)}
        onClear={() => { u("ddd", Array(2).fill("")); u("telefone", Array(8).fill("")); }} />
      <TextField top={seqTop + R.row4} left={R.email.left} width={R.email.width} height={L.DIGIT_H}
        value={s.email} onChange={(v) => u("email", v)} />

      {/* Procedimento row 1: Data atend / Cód proc / Qtde / CNPJ */}
      <DigitBoxes id={`s${si}-dad`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendDia}
        values={s.dataAtend.slice(0, 2)} onChange={(v) => u("dataAtend", [...v, ...s.dataAtend.slice(2)])} registerRefs={regBox(`s${si}-dad`)} onComplete={() => focusBox(`s${si}-dam`)} invalid={daInvalida} warn={daAntiga} title={daTitle} compact />
      <DigitBoxes id={`s${si}-dam`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendMes}
        values={s.dataAtend.slice(2, 4)} onChange={(v) => u("dataAtend", [...s.dataAtend.slice(0, 2), ...v, ...s.dataAtend.slice(4)])} registerRefs={regBox(`s${si}-dam`)} onComplete={() => focusBox(`s${si}-daa`)} invalid={daInvalida} warn={daAntiga} title={daTitle} compact />
      <DigitBoxes id={`s${si}-daa`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendAno}
        values={s.dataAtend.slice(4, 8)} onChange={(v) => u("dataAtend", [...s.dataAtend.slice(0, 4), ...v])} registerRefs={regBox(`s${si}-daa`)} invalid={daInvalida} warn={daAntiga} title={daTitle} compact />
      <FieldClear top={seqTop + R.procRow1} left={endOf(R.dataAtendAno) + 0.5} height={L.DIGIT_H}
        getInputs={() => inputsOf(`s${si}-dad`, `s${si}-dam`, `s${si}-daa`)}
        onClear={() => u("dataAtend", Array(8).fill(""))} />
      <AtendimentoAntigoAviso top={seqTop + R.procRow1} left={1.5} height={L.DIGIT_H}
        ativo={daAntiga} onConfirmar={() => u("dataAtendConfirmada", true)} />
      <ProcedimentoField id={`s${si}-cp`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.codProc}
        values={s.codProc} onChange={(v) => u("codProc", v)} clearable
        naoEncontrado={hydrated && val.procNaoEncontrado} nomeEncontrado={val.proc?.nome ?? null} />
      <DigitBoxes id={`s${si}-q`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.qtde}
        values={s.qtde} onChange={(v) => u("qtde", v)} invalid={hydrated && val.qtdeInvalida} title={val.qtdeMotivo} clearable compact separated />
      <DigitBoxes id={`s${si}-cnpj`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.cnpj}
        values={s.cnpj} onChange={(v) => u("cnpj", v)} clearable compact />

      {/* Procedimento row 2: Serviço / Class / CID / Caráter / Autorização */}
      <DigitBoxes id={`s${si}-srv`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.servico}
        values={s.servico} onChange={(v) => u("servico", v)} invalid={hydrated && val.servicoInvalido} title={val.servicoMotivo} compact />
      <DigitBoxes id={`s${si}-cls`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.classProc}
        values={s.classProc} onChange={(v) => u("classProc", v)} invalid={hydrated && val.servicoInvalido} title={val.servicoMotivo} compact />
      <DigitBoxes id={`s${si}-cid`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.cid}
        values={s.cid} onChange={(v) => u("cid", v)} numeric={false} invalid={hydrated && val.cidInvalido} title={val.cidMotivo} compact />
      <ComboField top={seqTop + R.procRow2} left={R.carater[0].left}
        width={R.carater[R.carater.length - 1].left + R.carater[R.carater.length - 1].width - R.carater[0].left}
        height={L.DIGIT_H} options={CARATERES} display="code"
        value={s.carater.join("")} onChange={(v) => u("carater", v.split(""))} />
      <DigitBoxes id={`s${si}-aut`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.autorizacao}
        values={s.autorizacao} onChange={(v) => u("autorizacao", v)} clearable compact />
    </div>
  );
}
