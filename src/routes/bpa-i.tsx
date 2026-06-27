import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";
import bpaiBg from "@/assets/bpa-i.png.asset.json";
import { DigitBoxes, TextField } from "@/components/DigitBoxes";
import * as L from "@/lib/bpai-layout";
import { emptySeq, type SeqData } from "@/lib/bpai-layout";

export const Route = createFileRoute("/bpa-i")({
  head: () => ({
    meta: [
      { title: "BPA-I Digital — Boletim de Produção Ambulatorial Individualizado" },
      { name: "description", content: "Preencha digitalmente o formulário BPA-I do Ministério da Saúde com layout pixel-perfect e exportação em PDF." },
    ],
  }),
  component: BpaI,
});

const STORAGE_KEY = "bpa-i-state-v1";

interface State {
  nomeEstab: string;
  cnes: string[];
  profCns: string[];
  profNome: string;
  profCbo: string[];
  profMes: string[];
  profAno: string[];
  profEquipe: string;
  profFolha: string[];
  seqs: SeqData[];
  respCarimbo: string;
  respRubrica: string;
  respData: string;
  gestCarimbo: string;
  gestRubrica: string;
  gestData: string;
}

const initialState = (): State => ({
  nomeEstab: "",
  cnes: Array(7).fill(""),
  profCns: Array(15).fill(""),
  profNome: "",
  profCbo: Array(6).fill(""),
  profMes: Array(2).fill(""),
  profAno: Array(4).fill(""),
  profEquipe: "",
  profFolha: Array(3).fill(""),
  seqs: [emptySeq(), emptySeq(), emptySeq()],
  respCarimbo: "",
  respRubrica: "",
  respData: "",
  gestCarimbo: "",
  gestRubrica: "",
  gestData: "",
});

function loadState(): State {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    return { ...initialState(), ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    return initialState();
  }
}

function BpaI() {
  const [state, setState] = useState<State>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [printing, setPrinting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setState(loadState()); setHydrated(true); }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
  }, [state, hydrated]);

  const set = <K extends keyof State>(k: K, v: State[K]) => setState((p) => ({ ...p, [k]: v }));
  const updateSeq = <K extends keyof SeqData>(i: number, field: K, value: SeqData[K]) => {
    setState((p) => {
      const seqs = [...p.seqs];
      seqs[i] = { ...seqs[i], [field]: value };
      return { ...p, seqs };
    });
  };

  const clearSeqs = () => {
    if (!confirm("Zerar todas as 3 sequências (pacientes + procedimentos)?")) return;
    setState((p) => ({ ...p, seqs: [emptySeq(), emptySeq(), emptySeq()] }));
  };
  const clearAll = () => {
    if (!confirm("Zerar TODAS as informações do formulário?")) return;
    setState(initialState());
  };

  const exportPdf = async () => {
    if (!sheetRef.current) return;
    setPrinting(true);
    await new Promise((r) => setTimeout(r, 80));
    try {
      const canvas = await html2canvas(sheetRef.current, { scale: 2, backgroundColor: "#fff", useCORS: true });
      const img = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      pdf.addImage(img, "JPEG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
      pdf.save("BPA-I.pdf");
    } catch (err) {
      console.error("PDF export failed", err);
      alert("Falha ao gerar PDF. Veja o console.");
    } finally { setPrinting(false); }
  };

  return (
    <div className="min-h-screen bg-muted/40 pb-16">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Início</Link>
            <h1 className="text-base font-semibold">BPA-I — Boletim Individualizado</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={clearSeqs} className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
              Zerar sequências
            </button>
            <button onClick={clearAll} className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10">
              Zerar tudo
            </button>
            <button onClick={exportPdf} disabled={printing} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {printing ? "Gerando..." : "Gerar PDF"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-4 max-w-[1100px] px-4">
        <div ref={sheetRef} className={`form-sheet ${printing ? "form-sheet--print" : ""}`} style={{ aspectRatio: "1653 / 2339" }}>
          <img src={bpaiBg.url} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />

          {/* Header */}
          <TextField {...L.NOME_ESTAB} value={state.nomeEstab} onChange={(v) => set("nomeEstab", v)} />
          <DigitBoxes id="cnes" top={L.CNES_TOP} height={L.HEADER_DIGIT_H} boxes={L.CNES_BOXES} values={state.cnes} onChange={(v) => set("cnes", v)} compact />

          {/* Profissional */}
          <DigitBoxes id="pcns" top={L.PROF_CNS_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_CNS_BOXES} values={state.profCns} onChange={(v) => set("profCns", v)} compact />
          <TextField {...L.PROF_NOME} value={state.profNome} onChange={(v) => set("profNome", v)} />
          <DigitBoxes id="pcbo" top={L.PROF_ROW2_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_CBO_BOXES} values={state.profCbo} onChange={(v) => set("profCbo", v)} compact />
          <DigitBoxes id="pmes" top={L.PROF_ROW2_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_MES_BOXES} values={state.profMes} onChange={(v) => set("profMes", v)} compact />
          <DigitBoxes id="pano" top={L.PROF_ROW2_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_ANO_BOXES} values={state.profAno} onChange={(v) => set("profAno", v)} compact />
          <TextField {...L.PROF_EQUIPE} value={state.profEquipe} onChange={(v) => set("profEquipe", v)} />
          <DigitBoxes id="pfolha" top={L.PROF_ROW2_TOP} height={L.HEADER_DIGIT_H} boxes={L.PROF_FOLHA_BOXES} values={state.profFolha} onChange={(v) => set("profFolha", v)} compact />

          {/* 3 Sequências */}
          {L.SEQ_TOPS.map((seqTop, si) => {
            const s = state.seqs[si];
            const R = L.REL;
            const u = <K extends keyof SeqData>(f: K, v: SeqData[K]) => updateSeq(si, f, v);
            return (
              <div key={si}>
                {/* Paciente row 1: CNS + Nome */}
                <DigitBoxes id={`s${si}-cns`} top={seqTop + R.cnsPac} height={L.DIGIT_H} boxes={R.cnsPacBoxes}
                  values={s.cnsPac} onChange={(v) => u("cnsPac", v)} compact />
                <TextField top={seqTop + R.cnsPac} left={R.nomePac.left} width={R.nomePac.width} height={L.DIGIT_H}
                  value={s.nomePac} onChange={(v) => u("nomePac", v)} />

                {/* Row 2: Sexo / Data Nasc / Nacion / RaçaCor / Etnia / CEP / IBGE */}
                <TextField top={seqTop + R.row2} left={R.sexoM.left} width={R.sexoM.width} height={L.DIGIT_H}
                  value={s.sexo === "M" ? "X" : ""} onChange={(v) => u("sexo", v ? "M" : "")} />
                <TextField top={seqTop + R.row2} left={R.sexoF.left} width={R.sexoF.width} height={L.DIGIT_H}
                  value={s.sexo === "F" ? "X" : ""} onChange={(v) => u("sexo", v ? "F" : "")} />
                <DigitBoxes id={`s${si}-dnd`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascDia}
                  values={s.dataNasc.slice(0, 2)} onChange={(v) => u("dataNasc", [...v, ...s.dataNasc.slice(2)])} compact />
                <DigitBoxes id={`s${si}-dnm`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascMes}
                  values={s.dataNasc.slice(2, 4)} onChange={(v) => u("dataNasc", [...s.dataNasc.slice(0, 2), ...v, ...s.dataNasc.slice(4)])} compact />
                <DigitBoxes id={`s${si}-dna`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.dataNascAno}
                  values={s.dataNasc.slice(4, 8)} onChange={(v) => u("dataNasc", [...s.dataNasc.slice(0, 4), ...v])} compact />
                <DigitBoxes id={`s${si}-nac`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.nacionalidade}
                  values={s.nacionalidade} onChange={(v) => u("nacionalidade", v)} compact />
                <DigitBoxes id={`s${si}-raca`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.racaCor}
                  values={s.racaCor} onChange={(v) => u("racaCor", v)} compact />
                <DigitBoxes id={`s${si}-etn`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.etnia}
                  values={s.etnia} onChange={(v) => u("etnia", v)} compact />
                <DigitBoxes id={`s${si}-cep`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.cep}
                  values={s.cep} onChange={(v) => u("cep", v)} compact />
                <DigitBoxes id={`s${si}-ibge`} top={seqTop + R.row2} height={L.DIGIT_H} boxes={R.ibge}
                  values={s.ibge} onChange={(v) => u("ibge", v)} compact />

                {/* Row 3: Cod Logradouro / Endereço / Número / Complemento */}
                <DigitBoxes id={`s${si}-cl`} top={seqTop + R.row3} height={L.DIGIT_H} boxes={R.codLog}
                  values={s.codLog} onChange={(v) => u("codLog", v)} compact />
                <TextField top={seqTop + R.row3} left={R.endereco.left} width={R.endereco.width} height={L.DIGIT_H}
                  value={s.endereco} onChange={(v) => u("endereco", v)} />
                <TextField top={seqTop + R.row3} left={R.numero.left} width={R.numero.width} height={L.DIGIT_H}
                  value={s.numero} onChange={(v) => u("numero", v)} />
                <TextField top={seqTop + R.row3} left={R.complemento.left} width={R.complemento.width} height={L.DIGIT_H}
                  value={s.complemento} onChange={(v) => u("complemento", v)} />

                {/* Row 4: Bairro / DDD / Telefone / Email */}
                <TextField top={seqTop + R.row4} left={R.bairro.left} width={R.bairro.width} height={L.DIGIT_H}
                  value={s.bairro} onChange={(v) => u("bairro", v)} />
                <DigitBoxes id={`s${si}-ddd`} top={seqTop + R.row4} height={L.DIGIT_H} boxes={R.ddd}
                  values={s.ddd} onChange={(v) => u("ddd", v)} compact />
                <DigitBoxes id={`s${si}-tel`} top={seqTop + R.row4} height={L.DIGIT_H} boxes={R.telefone}
                  values={s.telefone} onChange={(v) => u("telefone", v)} compact />
                <TextField top={seqTop + R.row4} left={R.email.left} width={R.email.width} height={L.DIGIT_H}
                  value={s.email} onChange={(v) => u("email", v)} />

                {/* Procedimento row 1: Data atend / Cód proc / Qtde / CNPJ */}
                <DigitBoxes id={`s${si}-dad`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendDia}
                  values={s.dataAtend.slice(0, 2)} onChange={(v) => u("dataAtend", [...v, ...s.dataAtend.slice(2)])} compact />
                <DigitBoxes id={`s${si}-dam`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendMes}
                  values={s.dataAtend.slice(2, 4)} onChange={(v) => u("dataAtend", [...s.dataAtend.slice(0, 2), ...v, ...s.dataAtend.slice(4)])} compact />
                <DigitBoxes id={`s${si}-daa`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.dataAtendAno}
                  values={s.dataAtend.slice(4, 8)} onChange={(v) => u("dataAtend", [...s.dataAtend.slice(0, 4), ...v])} compact />
                <DigitBoxes id={`s${si}-cp`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.codProc}
                  values={s.codProc} onChange={(v) => u("codProc", v)} compact />
                <DigitBoxes id={`s${si}-q`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.qtde}
                  values={s.qtde} onChange={(v) => u("qtde", v)} compact />
                <DigitBoxes id={`s${si}-cnpj`} top={seqTop + R.procRow1} height={L.DIGIT_H} boxes={R.cnpj}
                  values={s.cnpj} onChange={(v) => u("cnpj", v)} compact />

                {/* Procedimento row 2: Serviço / Class / CID / Caráter / Autorização */}
                <DigitBoxes id={`s${si}-srv`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.servico}
                  values={s.servico} onChange={(v) => u("servico", v)} compact />
                <DigitBoxes id={`s${si}-cls`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.classProc}
                  values={s.classProc} onChange={(v) => u("classProc", v)} compact />
                <DigitBoxes id={`s${si}-cid`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.cid}
                  values={s.cid} onChange={(v) => u("cid", v)} numeric={false} compact />
                <DigitBoxes id={`s${si}-car`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.carater}
                  values={s.carater} onChange={(v) => u("carater", v)} compact />
                <DigitBoxes id={`s${si}-aut`} top={seqTop + R.procRow2} height={L.DIGIT_H} boxes={R.autorizacao}
                  values={s.autorizacao} onChange={(v) => u("autorizacao", v)} compact />
              </div>
            );
          })}

          {/* Footer — responsável + gestor */}
          <TextField {...L.RESP_CARIMBO} value={state.respCarimbo} onChange={(v) => set("respCarimbo", v)} />
          <TextField {...L.RESP_RUBRICA} value={state.respRubrica} onChange={(v) => set("respRubrica", v)} />
          <TextField {...L.RESP_DATA} value={state.respData} onChange={(v) => set("respData", v)} />
          <TextField {...L.GEST_CARIMBO} value={state.gestCarimbo} onChange={(v) => set("gestCarimbo", v)} />
          <TextField {...L.GEST_RUBRICA} value={state.gestRubrica} onChange={(v) => set("gestRubrica", v)} />
          <TextField {...L.GEST_DATA} value={state.gestData} onChange={(v) => set("gestData", v)} />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Dados salvos automaticamente neste navegador. Posições do BPA-I são uma primeira aproximação — me diga quais campos precisam de ajuste.
        </p>
      </main>
    </div>
  );
}
