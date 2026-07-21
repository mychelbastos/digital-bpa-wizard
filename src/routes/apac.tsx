import { createFileRoute } from "@tanstack/react-router";
import { FormularioOverlay } from "@/components/FormularioOverlay";
import { CAMPOS, CHECKS } from "@/lib/apac-layout";
import apac1 from "@/assets/apac-1.png";
import apac2 from "@/assets/apac-2.png";

export const Route = createFileRoute("/apac")({
  head: () => ({ meta: [{ title: "APAC — Laudo de Solicitação / Autorização" }] }),
  component: ApacPage,
});

function ApacPage() {
  return (
    <FormularioOverlay
      titulo="APAC — Laudo de Solicitação / Autorização"
      storageKey="apac"
      campos={CAMPOS}
      checks={CHECKS}
      paginas={[
        { bg: apac1, aspect: "1653 / 2339" },
        { bg: apac2, aspect: "1653 / 2339" },
      ]}
    />
  );
}
