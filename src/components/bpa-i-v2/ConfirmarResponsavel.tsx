import { useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import type { AuthUser } from "@/lib/bpa-i-v2/auth";
import {
  validarResponsavelNoCnes,
  registrarConfirmacao,
  formatarConfirmadoEm,
  type Confirmacao,
} from "@/lib/bpa-i-v2/confirmacao";

interface Props {
  pos: { top: number; left: number; width: number; height: number };
  user: AuthUser | null;
  cnesEstab: string;
  confirmacao: Confirmacao | null;
  onConfirmado: (c: Confirmacao) => void;
  getSnapshot: () => unknown;
}

// Campo "RESPONSÁVEL (Estabelecimento)" da Formalização: confirmação eletrônica.
// - Confirmado  -> nome em fonte cursiva + "Confirmado eletronicamente em ..." (vai pro PDF).
// - Logado/não  -> botão "Confirmar como Responsável" (NÃO vai pro PDF).
export function ConfirmarResponsavel({ pos, user, cnesEstab, confirmacao, onConfirmado, getSnapshot }: Props) {
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(false);
  const style = { top: `${pos.top}%`, left: `${pos.left}%`, width: `${pos.width}%`, height: `${pos.height}%` };

  const gravar = async (validado: boolean) => {
    if (!user) return;
    setBusy(true);
    const { em } = await registrarConfirmacao({ user, cnes: cnesEstab, validado, snapshot: getSnapshot() });
    setBusy(false);
    onConfirmado({ nome: user.nome, cns: user.cns, em, validado });
  };

  const onConfirmarClick = async () => {
    if (!user) return;
    setBusy(true);
    const ok = await validarResponsavelNoCnes(user.cns, cnesEstab);
    setBusy(false);
    if (ok) gravar(true);
    else setWarn(true);
  };

  // Já confirmado -> "assinatura" eletrônica (entra no PDF)
  if (confirmacao) {
    return (
      <div className="absolute flex flex-col items-start justify-center overflow-hidden pl-[2%] text-left leading-none" style={style}>
        <span style={{ fontFamily: "'Caveat', cursive" }} className="whitespace-nowrap text-[clamp(9px,1.3cqw,17px)] leading-[1] text-[#16335f]">
          {confirmacao.nome}
        </span>
        <span className="whitespace-nowrap text-[clamp(5px,0.65cqw,8px)] leading-[1.1] text-neutral-500">
          Confirmado eletronicamente em {formatarConfirmadoEm(confirmacao.em)}
          {!confirmacao.validado ? " · sem validação CNES" : ""}
        </span>
      </div>
    );
  }

  // Ainda não confirmado -> controles (fora do PDF)
  return (
    <div data-html2canvas-ignore="true" className="absolute flex items-center justify-center" style={style}>
      {user ? (
        <button
          type="button"
          onClick={onConfirmarClick}
          disabled={busy}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Validando..." : "Confirmar como Responsável"}
        </button>
      ) : (
        <span className="rounded-md bg-neutral-100 px-2 py-1 text-center text-[11px] text-neutral-500">
          Entre para confirmar como Responsável
        </span>
      )}
      <ConfirmModal
        open={warn}
        title="Cadastro não confirmado no CNES"
        confirmLabel="Confirmar mesmo assim"
        cancelLabel="Cancelar"
        onCancel={() => setWarn(false)}
        onConfirm={() => { setWarn(false); gravar(false); }}
      >
        Não encontramos seu cadastro ativo neste estabelecimento (CNES {cnesEstab || "—"}) na base do CNES.
        Isso pode ocorrer por instabilidade da consulta ou por estarmos em ambiente de Homologação. Deseja confirmar mesmo assim?
      </ConfirmModal>
    </div>
  );
}
