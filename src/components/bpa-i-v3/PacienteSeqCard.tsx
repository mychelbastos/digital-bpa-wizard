// Um cartão do TRILHO de pacientes (à direita da folha), por sequência do BPA-I.
// - Sem vínculo: botão que abre a busca/cadastro (PacientePicker) num modal; ao escolher,
//   avisa o pai p/ autofill + travar a identidade na folha. (Também dá p/ digitar direto na
//   folha — o save-hook reconcilia.)
// - Com vínculo: mostra o paciente + EDITAR PACIENTE (modal) + Remover da seq + o botão
//   "Utilizar o mesmo procedimento da última vez?" (quando há atendimento anterior).
import { useEffect, useState } from "react";
import { UserRound, Pencil, X, Repeat, ArrowLeftRight } from "lucide-react";
import { PacientePicker, PacienteForm } from "@/components/pacientes/PacientePicker";
import { carregarPaciente, type Paciente } from "@/lib/pacientes";
import { ultimoAtendimentoBpai, type UltimoProcedimento } from "@/lib/bpa-i-v3/paciente-seq";
import type { SeqData } from "@/lib/bpai-v2-layout";

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-bold text-foreground">{titulo}</h2>
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Documento exibível a partir da seq: 15 díg = CNS, 11 díg = CPF, senão cauda cpfPac.
function docDaSeq(s: SeqData): string {
  const idd = s.cnsPac.join("").replace(/\D/g, "");
  if (idd.length === 15) return `CNS ${idd}`;
  if (idd.length === 11) return `CPF ${idd}`;
  const cpf = (s.cpfPac ?? []).join("").replace(/\D/g, "");
  return cpf.length === 11 ? `CPF ${cpf}` : "sem documento";
}

export function PacienteSeqCard(props: {
  si: number;
  seq: SeqData;
  orgId: string | null;
  profCnsDig: string;
  profCboDig: string;
  travado?: boolean; // ficha congelada — sem ações
  semCabecalho?: boolean; // esconde o "Sequência N" (quando embutido em outro cartão, ex.: V4)
  onVincular: (p: Paciente) => void;
  onDesvincular: () => void;
  onReidratar: (p: Paciente) => void;
  onUsarUltimoProc: (f: UltimoProcedimento) => void;
}) {
  const { si, seq, orgId } = props;
  const vinculado = Boolean(seq.pacienteId);
  const [buscando, setBuscando] = useState(false);   // modal de busca/cadastro
  const [editando, setEditando] = useState<Paciente | null>(null); // modal de edição (paciente carregado)
  const [ultimo, setUltimo] = useState<UltimoProcedimento | null>(null);

  // Busca o último atendimento do paciente pelo mesmo profissional (p/ mostrar o botão).
  useEffect(() => {
    setUltimo(null);
    if (!vinculado || !seq.pacienteId || props.profCnsDig.length !== 15 || props.profCboDig.length < 6) return;
    let cancel = false;
    ultimoAtendimentoBpai(seq.pacienteId, props.profCnsDig, props.profCboDig).then((u) => { if (!cancel) setUltimo(u); });
    return () => { cancel = true; };
  }, [vinculado, seq.pacienteId, props.profCnsDig, props.profCboDig]);

  const abrirEdicao = async () => {
    if (!seq.pacienteId) return;
    const p = await carregarPaciente(seq.pacienteId);
    if (p) setEditando(p);
  };

  return (
    <div className={props.semCabecalho ? "" : "rounded-xl border border-border bg-card p-3 shadow-sm"}>
      {!props.semCabecalho && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <UserRound className="size-3.5" /> Sequência {si + 1}
        </div>
      )}

      {vinculado ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5">
            <div className="truncate text-sm font-semibold text-emerald-900">{seq.nomePac || "Paciente"}</div>
            <div className="text-[11px] text-emerald-700">{docDaSeq(seq)}</div>
          </div>
          {!props.travado && (
            ultimo ? (
              <button type="button" onClick={() => onUsarUltimoProcSafe(ultimo, props.onUsarUltimoProc)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-2 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100">
                <Repeat className="size-3.5" /> Utilizar o mesmo procedimento da última vez
              </button>
            ) : (props.profCnsDig.length !== 15 || props.profCboDig.length < 6) ? (
              // Sem CNS/CBO do profissional não dá para buscar o último atendimento — em vez de
              // sumir com a ação (o que parece "botão que desapareceu"), explica o que falta.
              <div className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground">
                <Repeat className="size-3.5 opacity-60" /> Preencha CNS e CBO do profissional para trazer o último procedimento.
              </div>
            ) : null
          )}
          {!props.travado && (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <button type="button" onClick={abrirEdicao}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                  <Pencil className="size-3.5" /> Editar paciente
                </button>
                <button type="button" onClick={() => setBuscando(true)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                  <ArrowLeftRight className="size-3.5" /> Trocar paciente
                </button>
              </div>
              <button type="button" onClick={props.onDesvincular}
                className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-rose-50 hover:text-rose-600">
                <X className="size-3" /> Remover da sequência
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <button type="button" disabled={!orgId || props.travado} onClick={() => setBuscando(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <UserRound className="size-3.5" /> Buscar / cadastrar paciente
          </button>
          <p className="text-[10px] leading-tight text-muted-foreground">
            {orgId ? "ou digite a identificação direto na folha." : "Preencha o CNES para habilitar a busca."}
          </p>
        </div>
      )}

      {buscando && orgId && (
        <Modal titulo={`Paciente — Sequência ${si + 1}`} onClose={() => setBuscando(false)}>
          <PacientePicker orgId={orgId} paciente={null} apenasTfd={false} marcarTfd={false} origem="bpa_i"
            onEscolhe={(p) => { if (p) { props.onVincular(p); setBuscando(false); } }} />
        </Modal>
      )}

      {editando && orgId && (
        <Modal titulo="Editar paciente" onClose={() => setEditando(null)}>
          <PacienteForm orgId={orgId} paciente={editando} permitirAcompanhante={false}
            apenasTfd={false} marcarTfd={false}
            onSalvo={(p) => { setEditando(null); props.onReidratar(p); }}
            onCancela={() => setEditando(null)} />
        </Modal>
      )}
    </div>
  );
}

// Chama o handler do pai só quando há de fato um procedimento (evita limpar à toa).
function onUsarUltimoProcSafe(u: UltimoProcedimento, cb: (f: UltimoProcedimento) => void) {
  if (u && u.procedimento) cb(u);
}
