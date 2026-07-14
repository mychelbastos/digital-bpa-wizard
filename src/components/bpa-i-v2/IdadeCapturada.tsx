import { idadeAnos } from "@/lib/bpa-i-v2/bpa-magnetico";
import * as L from "@/lib/bpai-v2-layout";
import type { SeqData } from "@/lib/bpai-v2-layout";

interface Props {
  seqTop: number;
  s: SeqData;
  onChange: (idade: string[]) => void;
}

// Idade (anos) — NÃO existe no formulário de papel do BPA-I (só a Data de Nascimento). No
// arquivo magnético, porém, a idade é um campo próprio (reg. 03, offsets 86-88) e pode
// divergir do cálculo. Por isso ela é CAPTURADA só na tela (ignorada no PDF, que replica o
// papel): pré-preenchida com o cálculo (anos completos na data de atendimento) e EDITÁVEL.
// O valor confirmado aqui é o que sai no .txt — a geração nunca o sobrescreve com o cálculo.
// Fica logo abaixo da Data de Nascimento, de onde a idade deriva.
export function IdadeCapturada({ seqTop, s, onChange }: Props) {
  const R = L.REL;
  const calc = idadeAnos(s.dataNasc, s.dataAtend);
  const temDatas =
    s.dataNasc.join("").replace(/\D/g, "").length === 8 &&
    s.dataAtend.join("").replace(/\D/g, "").length === 8;
  const capt = (s.idade ?? []).join("").replace(/\D/g, "");
  const valor = capt || (temDatas ? String(calc) : "");
  const manual = capt !== "" && capt !== String(calc);
  // Só aparece quando há idade a mostrar (não polui sequência vazia).
  if (!valor) return null;

  const set = (txt: string) => {
    const d = txt.replace(/\D/g, "").slice(0, 3);
    onChange(d ? d.split("") : []);
  };

  return (
    <div
      data-html2canvas-ignore="true"
      className="absolute z-[55] flex items-center gap-1"
      style={{ top: `calc(${seqTop + R.row2}% + 2.05%)`, left: `${R.dataNascDia[0].left}%` }}
      title={
        manual
          ? `Idade DIGITADA (${capt}) — difere do cálculo (${calc}). Vai fiel ao arquivo magnético.`
          : "Idade (anos) calculada na data de atendimento. Editável — o valor confirmado é o que vai ao arquivo (nunca recalculado na geração)."
      }
    >
      <span className="select-none text-[8px] font-semibold uppercase leading-none text-slate-400">idade</span>
      <input
        value={valor}
        onChange={(e) => set(e.target.value)}
        inputMode="numeric"
        aria-label="Idade em anos (captura para o arquivo magnético)"
        className={`h-[15px] w-[27px] rounded border px-1 text-center text-[10px] leading-none tabular-nums outline-none focus:ring-1 focus:ring-primary/50 ${
          manual ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-300 bg-white/90 text-slate-600"
        }`}
      />
      {manual && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onChange([]); }}
          title="Voltar ao valor calculado"
          className="text-[10px] leading-none text-amber-600 hover:text-amber-800"
        >
          ↺
        </button>
      )}
    </div>
  );
}
