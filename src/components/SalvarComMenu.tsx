// Botão padrão de salvar dos formulários (o mesmo do BPA-I e do BPA-C): "💾 Salvar" + setinha
// ▾ que abre "Salvar como… (nova cópia)".
import { useState } from "react";

export function SalvarComMenu({ onSalvar, onSalvarComo, salvando = false, jaSalva, desabilitado = false, title, apagado = false }: {
  onSalvar: () => void;
  onSalvarComo: () => void;
  salvando?: boolean;
  jaSalva: boolean; // ficha já existe na nuvem ("Salvar" em vez de "Salvar ficha")
  desabilitado?: boolean;
  title?: string;
  apagado?: boolean; // visual esmaecido (ex.: campos inválidos), sem bloquear o clique
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="group relative flex">
      <button
        type="button"
        onClick={onSalvar}
        disabled={salvando || desabilitado}
        title={title ?? (jaSalva ? "Salvar alterações nesta ficha" : "Salvar esta ficha na sua conta (nuvem)")}
        className={`rounded-l-md border border-r-0 border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60${apagado ? " opacity-50" : ""}`}
      >
        {salvando ? "Salvando…" : `💾 Salvar${jaSalva ? "" : " ficha"}`}
      </button>
      <button
        type="button"
        onClick={() => setAberto((o) => !o)}
        title="Mais opções de salvar"
        aria-label="Mais opções de salvar"
        aria-expanded={aberto}
        className="rounded-r-md border border-primary/40 bg-primary/5 px-1.5 py-2 text-xs font-medium text-primary hover:bg-primary/10"
      >
        ▾
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-md border border-border bg-background py-1 text-xs shadow-lg">
            <button type="button" onClick={() => { setAberto(false); onSalvarComo(); }} className="block w-full px-3 py-2 text-left hover:bg-muted">
              Salvar como… <span className="text-muted-foreground">(nova cópia)</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
