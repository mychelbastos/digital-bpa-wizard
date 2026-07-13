import { useEffect } from "react";
import { DigitBoxes } from "@/components/DigitBoxes";
import { ProcedimentoField } from "@/components/bpa-i-v2/ProcedimentoField";
import { CboField } from "@/components/bpa-i-v3/CboField";
import { useValidacaoLinhaBpaC } from "@/lib/bpa-c-v2/use-validacao-linha";
import { procBoxes, cboBoxes, idadeBoxes, qtdBoxes, type RowData } from "@/lib/bpac-layout";

interface Props {
  i: number;
  top: number;
  height: number;
  row: RowData;
  // Competência do boletim (AAAAMM) — usada como competência da linha no crivo SIGTAP.
  competencia: string | null;
  onUpdate: (field: keyof RowData, vals: string[]) => void;
  // Reporta ao pai os motivos de erro desta linha (crivo SIGTAP) — o pai agrega p/
  // acender o resumo e bloquear a geração enquanto houver campo em vermelho.
  onValidacao?: (i: number, motivos: string[]) => void;
}

// Uma linha do BPA-C com o crivo do SIGTAP: Procedimento (existe + nome no balão),
// Idade (faixa etária), Quantidade (máximo) e CBO (compatível com o procedimento).
// Extraído p/ chamar o hook de validação 1x por linha.
export function LinhaBpaC({ i, top, height, row, competencia, onUpdate, onValidacao }: Props) {
  const v = useValidacaoLinhaBpaC(row, competencia);
  useEffect(() => {
    onValidacao?.(i, v.motivos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.motivos.join("|")]);

  return (
    <div>
      <ProcedimentoField id={`p-${i}`} top={top} height={height} boxes={procBoxes}
        values={row.procedimento} onChange={(vv) => onUpdate("procedimento", vv)}
        naoEncontrado={v.naoEncontrado} nomeEncontrado={v.procNome} />
      <CboField id={`c-${i}`} top={top} height={height} boxes={cboBoxes}
        values={row.cbo} onChange={(vv) => onUpdate("cbo", vv)}
        invalid={v.cboInvalido} title={v.cboMotivo} />
      <DigitBoxes id={`i-${i}`} top={top} height={height} boxes={idadeBoxes}
        values={row.idade} onChange={(vv) => onUpdate("idade", vv)}
        invalid={v.idadeInvalida} title={v.idadeMotivo} />
      <DigitBoxes id={`q-${i}`} top={top} height={height} boxes={qtdBoxes}
        values={row.quantidade} onChange={(vv) => onUpdate("quantidade", vv)}
        invalid={v.qtdeInvalida} title={v.qtdeMotivo} />
    </div>
  );
}
