import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FormularioOverlay } from "@/components/FormularioOverlay";
import { CAMPOS, CHECKS, raasStateParaOverlay } from "@/lib/raas/raas-form-layout";
import { emptyRaasState, type RaasState } from "@/lib/raas/raas-layout";
import { carregarFicha } from "@/lib/bpa-i-v2/fichas";
import raas1 from "@/assets/raas-1.png";
import raas2 from "@/assets/raas-2.png";

export const Route = createFileRoute("/raas-folha")({
  head: () => ({ meta: [{ title: "RAAS — Folha oficial (PDF)" }] }),
  component: RaasFolhaPage,
});

const STORAGE_KEY = "raas-folha"; // chave do FormularioOverlay (valores + posições -rects)
const DRAFT_KEY = "raas-state-v1"; // rascunho da tela de digitação

// Reconstrói o RaasState a partir de um objeto salvo (ficha ou rascunho).
function comEmpty(dados: Partial<RaasState> | null | undefined): RaasState {
  const base = { ...emptyRaasState(), ...(dados ?? {}) };
  if (!Array.isArray(base.acoes) || base.acoes.length === 0) base.acoes = emptyRaasState().acoes;
  return base;
}

function RaasFolhaPage() {
  const [pronto, setPronto] = useState(false);

  // Semeia os valores do overlay ANTES de montar o FormularioOverlay (ele lê o localStorage
  // no mount). Fonte: ?ficha=<id> (versão salva) ou o rascunho local da tela de digitação.
  useEffect(() => {
    let cancel = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const fichaId = params.get("ficha");
      let state: RaasState;
      if (fichaId) {
        const ficha = await carregarFicha(fichaId);
        state = comEmpty(ficha?.dados as Partial<RaasState> | undefined);
      } else {
        let draft: Partial<RaasState> | null = null;
        try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { /* noop */ }
        state = comEmpty(draft);
      }
      if (cancel) return;
      const overlay = raasStateParaOverlay(state);
      // Preserva as posições calibradas (-rects); só regrava os valores (txt/chk).
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overlay)); } catch { /* noop */ }
      setPronto(true);
    })();
    return () => { cancel = true; };
  }, []);

  if (!pronto) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <FormularioOverlay
      titulo="RAAS — Folha oficial (Atenção Psicossocial)"
      storageKey={STORAGE_KEY}
      campos={CAMPOS}
      checks={CHECKS}
      paginas={[
        { bg: raas1, aspect: "1654 / 2339" },
        { bg: raas2, aspect: "1654 / 2339" },
      ]}
      calibravel
    />
  );
}
