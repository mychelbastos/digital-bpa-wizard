// Modal de exclusão de paciente (soft-delete) com motivo obrigatório e a regra:
// óbito → qualquer um com permissão exclui; qualquer outro motivo → só o master (super-admin).
// A regra é reforçada no banco (RPC excluir_paciente); aqui só orientamos o usuário e evitamos
// tentativas fadadas ao erro. Compartilhado entre APAC e TFD.
import { useEffect, useState } from "react";
import { Trash2, Loader2, X, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { excluirPaciente, type Paciente } from "@/lib/pacientes";
import { souSuperAdmin } from "@/lib/permissoes";
import { MOTIVOS_EXCLUSAO, montarMotivo } from "@/lib/pacientes-exclusao";

export function ExcluirPacienteModal({ paciente, onExcluido, onClose }: {
  paciente: Paciente;
  onExcluido: () => void;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0); // índice do motivo selecionado
  const [detalhe, setDetalhe] = useState("");
  const [busy, setBusy] = useState(false);
  const [master, setMaster] = useState<boolean | null>(null); // null = verificando

  useEffect(() => { souSuperAdmin().then(setMaster); }, []);

  const motivo = MOTIVOS_EXCLUSAO[idx];
  const bloqueado = motivo.soMaster && master === false; // só master, e não sou master
  const podeConfirmar = !busy && master !== null && !bloqueado;

  const confirmar = async () => {
    setBusy(true);
    const ok = await excluirPaciente(paciente.id, montarMotivo(motivo, detalhe));
    setBusy(false);
    if (!ok) { toast.error("Não foi possível excluir (verifique o motivo e sua permissão)."); return; }
    toast.success("Paciente excluído (registrado no log).");
    onExcluido();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-destructive"><Trash2 className="size-4" /> Excluir paciente</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <p className="mb-3 text-sm text-foreground">
          Excluir <strong>{paciente.nome}</strong> da base? A exclusão é reversível pelo suporte e fica registrada no log de auditoria.
        </p>

        <label className="mb-1 block text-xs font-medium text-muted-foreground">Motivo da exclusão (obrigatório)</label>
        <select value={idx} onChange={(e) => setIdx(Number(e.target.value))}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
          {MOTIVOS_EXCLUSAO.map((m, i) => <option key={m.token} value={i}>{m.label}{m.soMaster ? " (só master)" : ""}</option>)}
        </select>

        <input value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Detalhe (opcional)"
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />

        {bloqueado && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>Somente o <strong>master</strong> (super-admin) pode excluir por este motivo. Em caso de <strong>óbito</strong>, você pode excluir normalmente.</span>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={!podeConfirmar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Confirmar exclusão
          </button>
        </div>
      </div>
    </div>
  );
}
