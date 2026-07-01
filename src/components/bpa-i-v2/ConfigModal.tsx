import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, X, Save } from "lucide-react";
import { type ConfigOrgao, loadConfig, saveConfig } from "@/lib/bpa-i-v2/config";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (c: ConfigOrgao) => void;
}

// Painel "Configuração do estabelecimento": dados fixos do cabeçalho do arquivo
// magnético BPA (órgão de origem, destino, CNPJ/CPF). Salvo no localStorage.
export function ConfigModal({ open, onClose, onSaved }: Props) {
  const [c, setC] = useState<ConfigOrgao>(loadConfig);

  useEffect(() => {
    if (open) setC(loadConfig());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = <K extends keyof ConfigOrgao>(k: K, v: ConfigOrgao[K]) => setC((p) => ({ ...p, [k]: v }));
  const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4" role="dialog" aria-modal="true">
      <button aria-label="Fechar" className="fixed inset-0 cursor-default bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <form
        className="relative my-auto max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onSubmit={(e) => { e.preventDefault(); saveConfig(c); onSaved?.(c); onClose(); }}
      >
        <button type="button" aria-label="Fechar" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>

        <div className="flex flex-col items-center px-6 pt-7 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
            <Building2 className="size-6" />
          </div>
          <h2 className="mt-3 text-lg font-semibold text-foreground">Configuração do estabelecimento</h2>
          <p className="mt-1 text-xs text-muted-foreground">Dados do cabeçalho do arquivo magnético (BPA). Preenchidos uma vez.</p>
        </div>

        <div className="space-y-3 px-6 pb-2 pt-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">Órgão de origem (nome)</span>
            <input className={field} maxLength={30} value={c.orgaoOrigemNome} onChange={(e) => set("orgaoOrigemNome", e.target.value)} placeholder="Ex.: SEC MUN SAUDE DE ..." />
          </label>
          <div className="flex gap-3">
            <label className="block w-1/3">
              <span className="mb-1 block text-xs font-medium text-foreground">Sigla</span>
              <input className={field} maxLength={6} value={c.sigla} onChange={(e) => set("sigla", e.target.value)} placeholder="SMS" />
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-xs font-medium text-foreground">CNPJ/CPF (só números)</span>
              <input className={field} inputMode="numeric" maxLength={14} value={c.cgcCpf} onChange={(e) => set("cgcCpf", e.target.value.replace(/\D/g, ""))} placeholder="14 dígitos" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">Órgão de destino (nome)</span>
            <input className={field} maxLength={40} value={c.orgaoDestinoNome} onChange={(e) => set("orgaoDestinoNome", e.target.value)} placeholder="Ex.: SES / SMS destino" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">Tipo do órgão de destino</span>
            <select className={field} value={c.destinoTipo} onChange={(e) => set("destinoTipo", e.target.value as "M" | "E")}>
              <option value="M">Municipal (M)</option>
              <option value="E">Estadual (E)</option>
            </select>
          </label>
        </div>

        <div className="flex gap-2 px-6 pb-6 pt-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
            Cancelar
          </button>
          <button type="submit" className="flex flex-[1.4] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
            <Save className="size-4" /> Salvar
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
