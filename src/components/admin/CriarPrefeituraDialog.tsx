// Diálogo "Nova prefeitura" (só super-admin). Mesmo criarOrganizacao de antes.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Campo, btnOutline, btnPrimario, inputCls } from "./ui";

export function CriarPrefeituraDialog({
  aberto,
  onAberto,
  criando,
  onCriar,
}: {
  aberto: boolean;
  onAberto: (v: boolean) => void;
  criando: boolean;
  onCriar: (nome: string, ibge: string, uf: string) => Promise<boolean>;
}) {
  const [nome, setNome] = useState("");
  const [ibge, setIbge] = useState("");
  const [uf, setUf] = useState("");
  const resetar = () => {
    setNome("");
    setIbge("");
    setUf("");
  };
  const submeter = async () => {
    if (!nome.trim()) return;
    if (await onCriar(nome.trim(), ibge.trim(), uf.trim())) {
      resetar();
      onAberto(false);
    }
  };
  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) resetar();
        onAberto(v);
      }}
    >
      <DialogContent className="max-w-[520px] gap-0 rounded-2xl p-0">
        <div className="border-b border-border px-6 py-5">
          <DialogTitle className="text-xl font-bold">Nova prefeitura</DialogTitle>
          <DialogDescription className="mt-1 text-[13.5px]">
            Depois de criar, abra a prefeitura para cadastrar unidades, usuários e o arquivo
            magnético.
          </DialogDescription>
        </div>
        <div className="grid gap-4 px-6 py-6 sm:grid-cols-4">
          <Campo rotulo="Nome da prefeitura" htmlFor="np-nome" className="sm:col-span-4">
            <input
              id="np-nome"
              className={inputCls}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: FMS — Cidade/UF"
            />
          </Campo>
          <Campo rotulo="Município (IBGE)" htmlFor="np-ibge" className="sm:col-span-3">
            <input
              id="np-ibge"
              className={`${inputCls} font-mono`}
              inputMode="numeric"
              maxLength={7}
              value={ibge}
              onChange={(e) => setIbge(e.target.value.replace(/\D/g, ""))}
              placeholder="2927200"
            />
          </Campo>
          <Campo rotulo="UF" htmlFor="np-uf">
            <input
              id="np-uf"
              className={inputCls}
              maxLength={2}
              value={uf}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
            />
          </Campo>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            className={btnOutline}
            onClick={() => {
              resetar();
              onAberto(false);
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={btnPrimario}
            onClick={submeter}
            disabled={!nome.trim() || criando}
          >
            {criando && <Loader2 className="size-4 animate-spin" />} Criar prefeitura
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
