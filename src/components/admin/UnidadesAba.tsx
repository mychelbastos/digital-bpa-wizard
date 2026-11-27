// Aba Unidades (CNES): cadastrar unidade (puxa profissionais) + lista com atualização.
import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import type { EstabelecimentoOrg, PessoaAdmin } from "@/lib/admin";
import { buscarEstabelecimento } from "@/lib/bpa-i-v2/estabelecimentos";
import { sincronizarProfissionais } from "@/lib/bpa-i-v2/profissionais";
import { Campo, Card, Numero, btnOutline, btnPrimario, inputCls, tdCls, thCls } from "./ui";

export function UnidadesAba({
  estabelecimentos,
  pessoas,
  salvando,
  onAdicionar,
  onVerUsuarios,
}: {
  estabelecimentos: EstabelecimentoOrg[];
  pessoas: PessoaAdmin[];
  salvando: boolean;
  onAdicionar: (cnes: string, nome: string) => Promise<boolean>;
  onVerUsuarios: (cnes: string) => void;
}) {
  const [cnes, setCnes] = useState("");
  const [nome, setNome] = useState("");
  const [busca, setBusca] = useState("");
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [jaCadastrada, setJaCadastrada] = useState<string | null>(null);
  const valido = /^[0-9]{7}$/.test(cnes);

  // Aviso se o CNES digitado já existe no sistema (evita cadastro duplicado).
  useEffect(() => {
    setJaCadastrada(null);
    if (!valido) return;
    let vivo = true;
    buscarEstabelecimento(cnes).then((n) => {
      if (vivo) setJaCadastrada(n);
    });
    return () => {
      vivo = false;
    };
  }, [cnes, valido]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t
      ? estabelecimentos.filter((e) => e.cnes.includes(t) || e.nome.toLowerCase().includes(t))
      : estabelecimentos;
  }, [busca, estabelecimentos]);

  const cadastrar = async () => {
    if (!valido) return;
    if (await onAdicionar(cnes, nome.trim())) {
      setCnes("");
      setNome("");
    }
  };
  const atualizar = async (c: string) => {
    setAtualizando(c);
    try {
      const r = await sincronizarProfissionais(c, true);
      if (r > 0) toast.success(`Profissionais do CNES ${c} atualizados (${r} no SCNES).`);
      else
        toast.warning(
          `O SCNES não devolveu profissionais para o CNES ${c} agora. A lista anterior foi mantida.`,
        );
    } catch {
      toast.error(`Não foi possível atualizar os profissionais do CNES ${c}.`);
    } finally {
      setAtualizando(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card
        titulo="Adicionar unidade"
        subtitulo="Ao cadastrar, o sistema busca os profissionais da unidade pela API do CNES."
      >
        <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)_auto] md:items-end">
          <Campo rotulo="CNES" htmlFor="add-cnes">
            <input
              id="add-cnes"
              className={`${inputCls} font-mono`}
              inputMode="numeric"
              maxLength={7}
              value={cnes}
              onChange={(e) => setCnes(e.target.value.replace(/\D/g, ""))}
              placeholder="7 dígitos"
            />
          </Campo>
          <Campo
            rotulo={
              <>
                Nome da unidade{" "}
                <span className="font-normal text-muted-foreground">(opcional)</span>
              </>
            }
            htmlFor="add-nome"
          >
            <input
              id="add-nome"
              className={inputCls}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: HOSPITAL REGIONAL"
            />
          </Campo>
          <button
            type="button"
            className={btnPrimario}
            onClick={cadastrar}
            disabled={!valido || salvando}
          >
            {salvando && <Loader2 className="size-4 animate-spin" />} Cadastrar e buscar
            profissionais
          </button>
        </div>
        {cnes.length > 0 && !valido && (
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            O CNES tem 7 dígitos ({cnes.length}/7).
          </p>
        )}
        {valido && jaCadastrada && (
          <p className="mt-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Este CNES já está cadastrado no sistema: <strong>{jaCadastrada}</strong>.
          </p>
        )}
      </Card>

      <Card
        titulo={
          <>
            Unidades da prefeitura
            <Numero n={estabelecimentos.length} />
          </>
        }
        corpoCls="p-0"
        acoes={
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Buscar unidade</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${inputCls} pl-9`}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar unidade"
            />
          </label>
        }
      >
        {lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {estabelecimentos.length
              ? "Nenhuma unidade com esse filtro."
              : "Nenhuma unidade cadastrada."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={thCls}>CNES</th>
                  <th className={thCls}>Estabelecimento</th>
                  <th className={`${thCls} text-right`}>Usuários vinculados</th>
                  <th className={thCls}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => {
                  const n = pessoas.filter((p) => p.cnes.includes(e.cnes)).length;
                  return (
                    <tr key={e.cnes} className="border-t border-border">
                      <td className={`${tdCls} font-mono`}>{e.cnes}</td>
                      <td className={tdCls}>{e.nome}</td>
                      <td className={`${tdCls} text-right`}>
                        {n === 0 ? (
                          <span className="tabular-nums text-muted-foreground">0</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onVerUsuarios(e.cnes)}
                            className="font-semibold tabular-nums text-primary hover:underline"
                            aria-label={`Ver os ${n} usuários do CNES ${e.cnes}`}
                          >
                            {n}
                          </button>
                        )}
                      </td>
                      <td className={`${tdCls} text-right`}>
                        <button
                          type="button"
                          className={btnOutline}
                          onClick={() => atualizar(e.cnes)}
                          disabled={atualizando !== null}
                        >
                          {atualizando === e.cnes ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <RefreshCw className="size-4" />
                          )}{" "}
                          Atualizar profissionais
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
