// Aba Usuários: filtros + tabela; a linha selecionada abre o painel (ao lado no desktop,
// Sheet à direita abaixo de lg).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import type { EstabelecimentoOrg, PermissaoCat, PessoaAdmin } from "@/lib/admin";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { iniciais, nomeCargo } from "./constantes";
import { contarExcecoes, tituloPessoa } from "./UsuarioPainel";
import { Avatar, Card, Pill, btnOutline, btnPrimario, inputCls, tdCls, thCls } from "./ui";

const POR_PAGINA = 25;

function useTelaLarga() {
  const [larga, setLarga] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const on = () => setLarga(mql.matches);
    mql.addEventListener("change", on);
    on();
    return () => mql.removeEventListener("change", on);
  }, []);
  return larga;
}

export function UsuariosAba({
  pessoas,
  estabelecimentos,
  cargos,
  perms,
  defaultsDaPessoa,
  usuarioSel,
  filtroCnes,
  onFiltroCnes,
  onSelecionar,
  onCriarConta,
  painel,
}: {
  pessoas: PessoaAdmin[];
  estabelecimentos: EstabelecimentoOrg[];
  cargos: string[];
  perms: PermissaoCat[];
  defaultsDaPessoa: (p: PessoaAdmin) => Set<string>;
  usuarioSel: string | null;
  filtroCnes: string;
  onFiltroCnes: (cnes: string) => void;
  onSelecionar: (userId: string | null) => void;
  onCriarConta: () => void;
  painel: ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const [cargo, setCargo] = useState("");
  const [pagina, setPagina] = useState(1);
  const larga = useTelaLarga();

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const td = t.replace(/\D/g, "");
    return pessoas
      .filter((p) => !cargo || p.papeis.includes(cargo))
      .filter((p) => !filtroCnes || p.cnes.includes(filtroCnes))
      .filter(
        (p) =>
          !t ||
          p.email.toLowerCase().includes(t) ||
          (p.nome ?? "").toLowerCase().includes(t) ||
          (td.length >= 3 && (p.cns ?? "").includes(td)),
      )
      .sort((a, b) => tituloPessoa(a).localeCompare(tituloPessoa(b), "pt-BR"));
  }, [pessoas, busca, cargo, filtroCnes]);
  useEffect(() => setPagina(1), [busca, cargo, filtroCnes]);
  const totalPag = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const pag = Math.min(pagina, totalPag);
  const visiveis = filtradas.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);
  const aberto = Boolean(usuarioSel && painel);

  const tabela = (
    <Card corpoCls="p-0">
      <div className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Buscar usuário</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputCls} pl-9`}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou CNS"
            data-nocaps
          />
        </label>
        <label className="w-full sm:w-48">
          <span className="sr-only">Filtrar por cargo</span>
          <select className={inputCls} value={cargo} onChange={(e) => setCargo(e.target.value)}>
            <option value="">Todos os cargos</option>
            {cargos.map((c) => (
              <option key={c} value={c}>
                {nomeCargo(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full sm:w-60">
          <span className="sr-only">Filtrar por unidade</span>
          <select
            className={inputCls}
            value={filtroCnes}
            onChange={(e) => onFiltroCnes(e.target.value)}
          >
            <option value="">Todas as unidades</option>
            {estabelecimentos.map((e) => (
              <option key={e.cnes} value={e.cnes}>
                {e.cnes} · {e.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onCriarConta} className={btnPrimario}>
          <Plus className="size-4" /> Criar conta
        </button>
      </div>
      {filtradas.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {pessoas.length
            ? "Nenhum usuário com esses filtros."
            : "Nenhum usuário nesta prefeitura ainda."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className={thCls}>Usuário</th>
                <th className={thCls}>Cargo</th>
                <th className={thCls}>Unidades</th>
                <th className={thCls}>Permissões</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => {
                const sel = p.user_id === usuarioSel;
                const n = contarExcecoes(p, perms, defaultsDaPessoa(p));
                return (
                  <tr
                    key={p.user_id}
                    onClick={() => onSelecionar(sel ? null : p.user_id)}
                    aria-selected={sel}
                    className={cn(
                      "cursor-pointer border-t border-border transition-colors",
                      sel
                        ? "bg-primary/[0.07] shadow-[inset_3px_0_0_var(--color-primary)]"
                        : "hover:bg-muted/40",
                    )}
                  >
                    <td className={tdCls}>
                      <button
                        type="button"
                        className="flex items-center gap-3 text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelecionar(sel ? null : p.user_id);
                        }}
                      >
                        <Avatar texto={iniciais(tituloPessoa(p))} />
                        <span className="min-w-0">
                          <span className="block font-semibold text-foreground">
                            {tituloPessoa(p)}
                          </span>
                          {p.nome && (
                            <span className="block break-all text-[12.5px] text-muted-foreground">
                              {p.email}
                            </span>
                          )}
                        </span>
                      </button>
                    </td>
                    <td className={tdCls}>
                      {p.papeis.length === 0 ? (
                        <span className="text-muted-foreground">Sem vínculo ativo</span>
                      ) : (
                        p.papeis.map(nomeCargo).join(", ")
                      )}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      {p.cnes.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          <span className="font-mono">{p.cnes[0]}</span>
                          {p.cnes.length > 1 && (
                            <span className="ml-1 text-muted-foreground">+{p.cnes.length - 1}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className={tdCls}>
                      {n === 0 ? (
                        <Pill tom="cinza">Padrão do cargo</Pill>
                      ) : (
                        <Pill tom="ambar">
                          {n} {n === 1 ? "exceção" : "exceções"}
                        </Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {filtradas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
          <span>
            Mostrando {visiveis.length} de {filtradas.length}
          </span>
          {totalPag > 1 && (
            <span className="flex gap-2">
              <button
                type="button"
                className={btnOutline}
                disabled={pag <= 1}
                onClick={() => setPagina(pag - 1)}
              >
                <ChevronLeft className="size-4" /> Anterior
              </button>
              <button
                type="button"
                className={btnOutline}
                disabled={pag >= totalPag}
                onClick={() => setPagina(pag + 1)}
              >
                Próxima <ChevronRight className="size-4" />
              </button>
            </span>
          )}
        </div>
      )}
    </Card>
  );

  if (larga) {
    return (
      <div className={cn("grid items-start gap-5", aberto && "lg:grid-cols-[minmax(0,1fr)_440px]")}>
        {tabela}
        {aberto && (
          <aside
            aria-label="Painel do usuário"
            className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-border bg-card shadow-sm"
          >
            {painel}
          </aside>
        )}
      </div>
    );
  }
  return (
    <>
      {tabela}
      <Sheet
        open={aberto}
        onOpenChange={(v) => {
          if (!v) onSelecionar(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-0 sm:max-w-[480px] [&>button]:hidden"
        >
          <SheetTitle className="sr-only">Painel do usuário</SheetTitle>
          <SheetDescription className="sr-only">
            Cargo, unidades e permissões do usuário.
          </SheetDescription>
          {painel}
        </SheetContent>
      </Sheet>
    </>
  );
}
