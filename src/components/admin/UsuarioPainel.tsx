// Painel do usuário: cargo, unidades vinculadas, permissões (switches) e ações.
import { useMemo, useState } from "react";
import { Building2, Loader2, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import type { EstabelecimentoOrg, PermissaoCat, PessoaAdmin, VinculoAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";
import {
  DESC_CARGO,
  LABEL_ESCOPO,
  alvoDoClique,
  escopoDoCargo,
  estadoPermissao,
  grupoOrg,
  iniciais,
  nomeCargo,
  nomePerm,
  rotuloCurto,
  type EstadoPerm,
} from "./constantes";
import { PermissaoLinha } from "./PermissaoLinha";
import {
  Avatar,
  Pill,
  btnOutline,
  btnPerigo,
  btnPrimario,
  btnTexto,
  inputCls,
  labelCls,
  ajudaCls,
} from "./ui";

export interface HandlersUsuario {
  onTrocarCargo: (p: PessoaAdmin, papel: string) => void;
  onVincular: (p: PessoaAdmin, cnes: string, papel: string) => void;
  onDesvincular: (p: PessoaAdmin, cnes: string) => void;
  onExcluir: (p: PessoaAdmin) => void;
  onDefinirPessoa: (p: PessoaAdmin, codigo: string, alvo: boolean | null) => void;
  onDefinirVinculo: (v: VinculoAdmin, codigo: string, alvo: boolean | null) => void;
  onDefinirGrupo: (p: PessoaAdmin, codigos: string[], alvo: boolean | null) => void;
  onDefinirGrupoVinculo: (v: VinculoAdmin, codigos: string[], alvo: boolean | null) => void;
}

export const tituloPessoa = (p: PessoaAdmin) => p.nome?.trim() || p.email;
const fmtCns = (c: string) => c.replace(/^(\d{3})(\d{4})(\d{4})(\d{4})$/, "$1 $2 $3 $4");

// Quantas permissões da pessoa diferem do padrão do cargo (inclui parciais).
export function contarExcecoes(p: PessoaAdmin, perms: PermissaoCat[], defaults: Set<string>) {
  return perms.filter(
    (x) => estadoPermissao(x.codigo, p.perms, p.total_vinculos, defaults).override,
  ).length;
}

export function UsuarioPainel({
  pessoa,
  ehDono,
  permsOrg,
  permsCnes,
  defaults,
  cargos,
  vinculos,
  estabelecimentos,
  cargoDefaults,
  salvando,
  onFechar,
  h,
}: {
  pessoa: PessoaAdmin;
  ehDono: boolean;
  permsOrg: PermissaoCat[];
  permsCnes: PermissaoCat[];
  defaults: Set<string>;
  cargos: string[];
  vinculos: VinculoAdmin[];
  estabelecimentos: EstabelecimentoOrg[];
  cargoDefaults: Record<string, string[]>;
  salvando: string | null;
  onFechar: () => void;
  h: HandlersUsuario;
}) {
  const [escopo, setEscopo] = useState<string>("todas"); // "todas" ou vinculo_id
  const [addAberto, setAddAberto] = useState(false);
  const [novoCnes, setNovoCnes] = useState("");
  const [novoPapel, setNovoPapel] = useState("");
  const cargoAtual = pessoa.papeis.length === 1 ? pessoa.papeis[0] : "";
  const nomeEstab = useMemo(
    () => new Map(estabelecimentos.map((e) => [e.cnes, e.nome])),
    [estabelecimentos],
  );
  const cnesDisponiveis = estabelecimentos.filter((e) => !pessoa.cnes.includes(e.cnes));
  const vincEscopo = vinculos.find((v) => v.vinculo_id === escopo) ?? null;
  const escopoAtual = vincEscopo ? escopo : "todas";
  const todos = [...permsOrg, ...permsCnes];
  const nExc = contarExcecoes(pessoa, todos, defaults);
  const ocupadoPessoa = salvando === `${pessoa.user_id}:grupo`;

  const estPessoa = (codigo: string) =>
    estadoPermissao(codigo, pessoa.perms, pessoa.total_vinculos, defaults);
  const estVinculo = (v: VinculoAdmin, codigo: string): EstadoPerm => {
    const padrao = (cargoDefaults[v.papel] ?? []).includes(codigo);
    const ativa = v.permissoes.includes(codigo);
    return { ativa, parcial: false, padrao, override: ativa !== padrao };
  };

  type Grupo = {
    chave: string;
    titulo: string;
    perms: PermissaoCat[];
    curto: boolean;
    massa: boolean;
  };
  const grupos: Grupo[] = vincEscopo
    ? [
        {
          chave: "cnes",
          titulo: `Fichas e produção · CNES ${vincEscopo.cnes}`,
          perms: permsCnes,
          curto: false,
          massa: true,
        },
      ]
    : [
        {
          chave: "menu",
          titulo: "Menu (páginas)",
          perms: permsOrg.filter((p) => grupoOrg(p.codigo) === "menu"),
          curto: true,
          massa: true,
        },
        {
          chave: "relatorio",
          titulo: "Relatórios",
          perms: permsOrg.filter((p) => grupoOrg(p.codigo) === "relatorio"),
          curto: true,
          massa: true,
        },
        { chave: "cnes", titulo: "Fichas e produção", perms: permsCnes, curto: false, massa: true },
        // Gestão: sem "Liberar/Bloquear tudo" em massa (gerenciar acessos é sensível) — só "Padrão".
        {
          chave: "gestao",
          titulo: "Gestão e acessos",
          perms: permsOrg.filter((p) => grupoOrg(p.codigo) === "gestao"),
          curto: false,
          massa: false,
        },
      ];

  const confirmarAdd = () => {
    if (!novoCnes || !novoPapel) return;
    h.onVincular(pessoa, novoCnes, novoPapel);
    setAddAberto(false);
    setNovoCnes("");
    setNovoPapel("");
  };

  return (
    <div className="flex flex-col">
      {/* 1. Cabeçalho */}
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <Avatar texto={iniciais(tituloPessoa(pessoa))} tamanho={44} />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-foreground">{tituloPessoa(pessoa)}</div>
          {pessoa.nome && (
            <div className="break-all text-[13px] text-muted-foreground">{pessoa.email}</div>
          )}
          {pessoa.cns && (
            <div className="font-mono text-[12.5px] text-muted-foreground">
              CNS {fmtCns(pessoa.cns)}
            </div>
          )}
          {ehDono && (
            <Pill
              tom="violeta"
              className="mt-1.5"
              title="Super-admin: administra qualquer prefeitura. Não atribuível pela tela."
            >
              <ShieldCheck className="size-3.5" /> Dono do sistema · {LABEL_ESCOPO.global}
            </Pill>
          )}
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar painel do usuário"
          className="inline-flex size-10 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="space-y-6 px-5 py-5">
        {/* 2. Cargo */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="painel-cargo" className={labelCls}>
              Cargo
            </label>
            {cargoAtual && (
              <Pill tom="cinza" className="uppercase">
                Escopo {LABEL_ESCOPO[escopoDoCargo(cargoAtual)]}
              </Pill>
            )}
          </div>
          <div className="relative">
            <select
              id="painel-cargo"
              value={cargoAtual}
              disabled={salvando === `${pessoa.user_id}:cargo`}
              onChange={(e) => h.onTrocarCargo(pessoa, e.target.value)}
              className={cn(inputCls, "font-medium")}
            >
              {cargoAtual === "" && <option value="">— vários —</option>}
              {cargos.map((c) => (
                <option key={c} value={c}>
                  {nomeCargo(c)}
                  {DESC_CARGO[c] ? ` (${DESC_CARGO[c]})` : ""}
                </option>
              ))}
            </select>
            {salvando === `${pessoa.user_id}:cargo` && (
              <Loader2 className="absolute right-9 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className={ajudaCls}>
            O cargo traz um pacote padrão de permissões. Trocar o cargo descarta as exceções abaixo.
          </p>
        </section>

        {/* 3. Unidades vinculadas */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className={labelCls}>Unidades vinculadas</h3>
            {!addAberto && cnesDisponiveis.length > 0 && (
              <button
                type="button"
                className={btnTexto}
                onClick={() => {
                  setAddAberto(true);
                  setNovoPapel(cargoAtual || "");
                }}
              >
                <Plus className="mr-0.5 size-4" /> Vincular unidade
              </button>
            )}
          </div>
          {pessoa.cnes.length === 0 ? (
            <p className={ajudaCls}>Nenhuma unidade ativa.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {pessoa.cnes.map((c) => (
                <li key={c} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Building2 className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-medium text-foreground">
                        {nomeEstab.get(c) ?? "Unidade"}
                      </div>
                      <div className="text-[12.5px] text-muted-foreground">
                        <span className="font-mono">CNES {c}</span>
                        {pessoa.cnes_base === c && " · unidade de cadastro"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => h.onDesvincular(pessoa, c)}
                    disabled={salvando === `${pessoa.user_id}:${c}:desvinc`}
                    className="min-h-10 shrink-0 rounded-[10px] px-3 text-[13px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950"
                  >
                    Desvincular
                  </button>
                </li>
              ))}
            </ul>
          )}
          {addAberto && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="vinc-cnes" className={labelCls}>
                  Unidade
                </label>
                <select
                  id="vinc-cnes"
                  value={novoCnes}
                  onChange={(e) => setNovoCnes(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Selecione…</option>
                  {cnesDisponiveis.map((e) => (
                    <option key={e.cnes} value={e.cnes}>
                      {e.cnes} — {e.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="vinc-papel" className={labelCls}>
                  Cargo na unidade
                </label>
                <select
                  id="vinc-papel"
                  value={novoPapel}
                  onChange={(e) => setNovoPapel(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Selecione…</option>
                  {cargos.map((c) => (
                    <option key={c} value={c}>
                      {nomeCargo(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmarAdd}
                  className={btnPrimario}
                  disabled={!novoCnes || !novoPapel || salvando === `${pessoa.user_id}:vinc`}
                >
                  {salvando === `${pessoa.user_id}:vinc` && (
                    <Loader2 className="size-4 animate-spin" />
                  )}{" "}
                  Vincular
                </button>
                <button type="button" onClick={() => setAddAberto(false)} className={btnOutline}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 4. Permissões */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className={labelCls}>Permissões</h3>
            {nExc === 0 ? (
              <Pill tom="verde">Tudo no padrão do cargo</Pill>
            ) : (
              <Pill tom="ambar">
                {nExc} {nExc === 1 ? "exceção" : "exceções"}
              </Pill>
            )}
          </div>
          {vinculos.length > 1 && (
            <div
              role="radiogroup"
              aria-label="Escopo das permissões"
              className="flex flex-wrap gap-1 rounded-[10px] bg-muted p-1"
            >
              {[
                { id: "todas", rotulo: "Todas as unidades" },
                ...vinculos.map((v) => ({ id: v.vinculo_id, rotulo: v.cnes })),
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={escopoAtual === s.id}
                  onClick={() => setEscopo(s.id)}
                  className={cn(
                    "min-h-9 flex-1 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                    s.id !== "todas" && "font-mono",
                    escopoAtual === s.id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.rotulo}
                </button>
              ))}
            </div>
          )}
          <p className={ajudaCls}>
            {vincEscopo
              ? `Ajustes valem só para o CNES ${vincEscopo.cnes} (cargo ${nomeCargo(vincEscopo.papel)}).`
              : vinculos.length > 1
                ? "Ajustes aqui valem para todas as unidades da pessoa. Para mudar só uma, escolha o CNES acima."
                : "Ligue ou desligue cada permissão. O que difere do cargo fica marcado como exceção."}
          </p>
          {grupos
            .filter((g) => g.perms.length > 0)
            .map((g) => {
              const codigos = g.perms.map((p) => p.codigo);
              const ocupadoGrupo = vincEscopo
                ? salvando === `${vincEscopo.vinculo_id}:grupo`
                : ocupadoPessoa;
              const aplicar = (alvo: boolean | null) =>
                vincEscopo
                  ? h.onDefinirGrupoVinculo(vincEscopo, codigos, alvo)
                  : h.onDefinirGrupo(pessoa, codigos, alvo);
              return (
                <div key={g.chave} className="overflow-hidden rounded-xl border border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-4 py-2">
                    <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                      {g.titulo}
                    </span>
                    <span className="flex items-center gap-0.5">
                      {g.massa && (
                        <button
                          type="button"
                          className={btnTexto}
                          disabled={ocupadoGrupo}
                          onClick={() => aplicar(true)}
                        >
                          Liberar tudo
                        </button>
                      )}
                      {g.massa && (
                        <button
                          type="button"
                          className={btnTexto}
                          disabled={ocupadoGrupo}
                          onClick={() => aplicar(false)}
                        >
                          Bloquear tudo
                        </button>
                      )}
                      <button
                        type="button"
                        className={btnTexto}
                        disabled={ocupadoGrupo}
                        onClick={() => aplicar(null)}
                      >
                        Padrão
                      </button>
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {g.perms.map((p) => {
                      const est = vincEscopo
                        ? estVinculo(vincEscopo, p.codigo)
                        : estPessoa(p.codigo);
                      const chave = vincEscopo
                        ? `${vincEscopo.vinculo_id}:${p.codigo}`
                        : `${pessoa.user_id}:${p.codigo}`;
                      const definir = (alvo: boolean | null) =>
                        vincEscopo
                          ? h.onDefinirVinculo(vincEscopo, p.codigo, alvo)
                          : h.onDefinirPessoa(pessoa, p.codigo, alvo);
                      return (
                        <PermissaoLinha
                          key={p.codigo}
                          rotulo={g.curto ? rotuloCurto(p) : nomePerm(p)}
                          codigo={p.codigo}
                          est={est}
                          carregando={salvando === chave || ocupadoGrupo}
                          desabilitado={Boolean(salvando) && salvando !== chave}
                          onAlternar={() => definir(alvoDoClique(est))}
                          onRestaurar={() => definir(null)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </section>

        {/* 5. Rodapé */}
        <section className="flex flex-col gap-2 border-t border-border pt-5">
          <button
            type="button"
            className={btnOutline}
            disabled={ocupadoPessoa || nExc === 0}
            onClick={() =>
              h.onDefinirGrupo(
                pessoa,
                todos.map((p) => p.codigo),
                null,
              )
            }
          >
            Restaurar tudo ao padrão do cargo
          </button>
          {!ehDono && (
            <button
              type="button"
              className={btnPerigo}
              onClick={() => h.onExcluir(pessoa)}
              disabled={salvando === `${pessoa.user_id}:excluir`}
            >
              <Trash2 className="size-4" /> Excluir usuário desta prefeitura
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
