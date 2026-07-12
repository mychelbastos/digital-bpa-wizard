import { useEffect, useState } from "react";
import { DigitBoxes } from "@/components/DigitBoxes";
import { ProcedimentoField } from "@/components/bpa-i-v2/ProcedimentoField";
import { CboField } from "@/components/bpa-i-v3/CboField";
import { buscarProcedimentoSigtap } from "@/lib/bpa-i-v2/procedimentos-sigtap";
import { procBoxes, cboBoxes, idadeBoxes, qtdBoxes, type RowData } from "@/lib/bpac-layout";

interface Props {
  i: number;
  top: number;
  height: number;
  row: RowData;
  onUpdate: (field: keyof RowData, vals: string[]) => void;
}

// Uma linha do BPA-C com as automações do BPA-I: Procedimento validado no SIGTAP
// (nome no balão + borda quando não existe) e CBO com nome no balão. Idade e
// Quantidade seguem como campos simples. Extraído p/ chamar o hook de busca do
// procedimento 1x por linha (não dá pra chamar hook dentro de .map no componente pai).
export function LinhaBpaC({ i, top, height, row, onUpdate }: Props) {
  const proc = row.procedimento.join("");
  const completo = proc.length === procBoxes.length;
  const [nome, setNome] = useState<string | null>(null);
  useEffect(() => {
    if (!completo) {
      setNome(null);
      return;
    }
    let cancel = false;
    buscarProcedimentoSigtap(proc).then((p) => { if (!cancel) setNome(p?.nome ?? null); });
    return () => { cancel = true; };
  }, [proc, completo]);
  const naoEncontrado = completo && nome === null;

  return (
    <div>
      <ProcedimentoField id={`p-${i}`} top={top} height={height} boxes={procBoxes}
        values={row.procedimento} onChange={(v) => onUpdate("procedimento", v)}
        naoEncontrado={naoEncontrado} nomeEncontrado={nome} />
      <CboField id={`c-${i}`} top={top} height={height} boxes={cboBoxes}
        values={row.cbo} onChange={(v) => onUpdate("cbo", v)} />
      <DigitBoxes id={`i-${i}`} top={top} height={height} boxes={idadeBoxes}
        values={row.idade} onChange={(v) => onUpdate("idade", v)} />
      <DigitBoxes id={`q-${i}`} top={top} height={height} boxes={qtdBoxes}
        values={row.quantidade} onChange={(v) => onUpdate("quantidade", v)} />
    </div>
  );
}
