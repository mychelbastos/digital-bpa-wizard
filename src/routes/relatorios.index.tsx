// Central de Relatórios v2: barra de período/unidade, "O que pede atenção" (5 destaques que
// carregam em segundo plano, um de cada vez, sem travar a página), Meus modelos e a lista dos
// relatórios prontos. Os relatórios em si continuam nas rotas de sempre.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Ambulance,
  ChevronRight,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Lock,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UserX,
  Users,
  Wallet,
  ClipboardList,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { usePermissoes } from "@/lib/permissoes";
import { useAuthUser } from "@/lib/bpa-i-v2/auth";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import { MultiSelect, mesLabel, mesOffset, competenciaPadrao } from "@/components/relatorios/comum";
import { periodoAnterior, ROTULO_DIM } from "@/lib/relatorios/pivo";
import {
  destaqueCadastros,
  destaqueErros,
  destaqueFpo,
  destaqueInativos,
  destaqueTendencia,
} from "@/lib/relatorios/destaques";
import {
  listarModelos,
  excluirModelo,
  renomearModelo,
  type ModeloRelatorio,
} from "@/lib/relatorios/modelos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/relatorios/")({
  component: CentralRelatorios,
});

const card = "rounded-[18px] border border-[#E3E8EF] bg-white";
const pctFmt = (p: number) =>
  `${(p * 100).toLocaleString("pt-BR", { maximumFractionDigits: p !== 0 && Math.abs(p) < 0.1 ? 1 : 0 })}%`;
const sinal = (p: number) => `${p >= 0 ? "+" : "−"}${pctFmt(Math.abs(p))}`;

type Estado<T> = { st: "carregando" } | { st: "ok"; v: T } | { st: "erro" };

// ---------------- Barra de período e unidade ----------------
function BarraPeriodo() {
  const { compDe, compAte, setCompDe, setCompAte, cnesSel, setCnesSel, cnesOpcoes } =
    useRelatoriosCtx();
  const base = competenciaPadrao();
  const atalhos: { key: string; label: string; de: string; ate: string }[] = [
    { key: "mov", label: mesLabel(base), de: base, ate: base },
    { key: "ant", label: "Mês anterior", de: mesOffset(base, -1), ate: mesOffset(base, -1) },
    { key: "3", label: "3 meses", de: mesOffset(base, -2), ate: base },
    { key: "6", label: "6 meses", de: mesOffset(base, -5), ate: base },
    { key: "12", label: "12 meses", de: mesOffset(base, -11), ate: base },
  ];
  const meses = Array.from({ length: 24 }, (_, i) => mesOffset(base, -i));
  const sel =
    "h-10 rounded-full border border-[#D5DCE6] bg-white px-3 text-[13.5px] font-medium text-[#172033] outline-none focus:border-[#2563D9]";
  return (
    <section
      aria-label="Período e unidade"
      className="rv mb-6 flex flex-wrap items-center gap-2.5 rounded-[18px] border border-[#E3E8EF] bg-white px-4 py-3"
      style={{ animationDelay: "0ms" }}
    >
      <div role="group" aria-label="Atalhos de período" className="flex flex-wrap gap-1.5">
        {atalhos.map((a) => {
          const ativo = compDe === a.de && compAte === a.ate;
          return (
            <button
              key={a.key}
              type="button"
              aria-pressed={ativo}
              onClick={() => {
                setCompDe(a.de);
                setCompAte(a.ate);
              }}
              className={`btn min-h-10 rounded-full px-3.5 text-[13px] font-semibold ${ativo ? "bg-[#15213A] text-white" : "bg-[#F1F4F8] text-[#33415A] hover:bg-[#E6EBF2]"}`}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      <span className="mx-1 hidden h-6 w-px bg-[#E3E8EF] md:block" />
      <label className="flex items-center gap-1.5 text-[13px] text-[#5B6B82]">
        De
        <select
          className={sel}
          value={compDe}
          onChange={(e) => {
            const v = e.target.value;
            setCompDe(v);
            if (v > compAte) setCompAte(v);
          }}
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {mesLabel(m)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-[13px] text-[#5B6B82]">
        até
        <select
          className={sel}
          value={compAte}
          onChange={(e) => {
            const v = e.target.value;
            setCompAte(v);
            if (v < compDe) setCompDe(v);
          }}
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {mesLabel(m)}
            </option>
          ))}
        </select>
      </label>
      <div className="min-w-[200px] flex-1 sm:max-w-[280px]">
        <MultiSelect
          titulo="Unidade"
          allLabel="Todas as unidades"
          opcoes={cnesOpcoes.map((u) => ({ code: u.cnes, label: u.nome }))}
          sel={cnesSel}
          onChange={setCnesSel}
        />
      </div>
    </section>
  );
}

// ---------------- Destaques ----------------
function CardDestaque({
  tag,
  tom,
  estado,
  valor,
  texto,
  acao,
  to,
  search,
}: {
  tag: string;
  tom: "vermelho" | "ambar" | "azul" | "verde";
  estado: "carregando" | "ok" | "erro";
  valor?: string;
  texto?: ReactNode;
  acao: string;
  to: string;
  search?: Record<string, string>;
}) {
  const tons = {
    vermelho: "bg-[#FDECEA] text-[#A3241A]",
    ambar: "bg-[#FFF4DF] text-[#7A4A00]",
    azul: "bg-[#EAF1FD] text-[#1D4FB0]",
    verde: "bg-[#E7F6EE] text-[#0B6B44]",
  };
  return (
    <div className={`${card} card flex min-w-0 flex-[1_1_200px] flex-col gap-2.5 p-5`}>
      <span className={`w-fit rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${tons[tom]}`}>
        {tag}
      </span>
      {estado === "carregando" ? (
        <>
          <span className="sk" style={{ height: 30, width: "55%", display: "block" }} />
          <span className="sk" style={{ height: 12, width: "100%", display: "block" }} />
          <span className="sk" style={{ height: 12, width: "80%", display: "block" }} />
        </>
      ) : estado === "erro" ? (
        <p className="text-[13.5px] text-[#5B6B82]">Não foi possível calcular agora.</p>
      ) : (
        <>
          <span className="text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[#172033]">
            {valor}
          </span>
          <p className="text-[13.5px] leading-snug text-[#33415A]">{texto}</p>
        </>
      )}
      <Link
        to={to}
        search={search as never}
        className="more mt-auto inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-[#2563D9]"
      >
        {acao} <ChevronRight className="chev size-3.5" />
      </Link>
    </div>
  );
}

function Destaques() {
  const { compDe, compAte, cnesSel, cnesOpcoes, periodoLabel } = useRelatoriosCtx();
  const { pode } = usePermissoes();
  const [erros, setErros] = useState<Estado<Awaited<ReturnType<typeof destaqueErros>>>>({
    st: "carregando",
  });
  const [inat, setInat] = useState<Estado<Awaited<ReturnType<typeof destaqueInativos>>>>({
    st: "carregando",
  });
  const [fpo, setFpo] = useState<Estado<Awaited<ReturnType<typeof destaqueFpo>>>>({
    st: "carregando",
  });
  const [cad, setCad] = useState<Estado<Awaited<ReturnType<typeof destaqueCadastros>>>>({
    st: "carregando",
  });
  const [tend, setTend] = useState<Estado<Awaited<ReturnType<typeof destaqueTendencia>>>>({
    st: "carregando",
  });
  const [hora, setHora] = useState<Date | null>(null);
  const token = useRef(0);
  const cnesLista = useMemo(
    () => (cnesSel.size ? [...cnesSel] : cnesOpcoes.map((u) => u.cnes)),
    [cnesSel, cnesOpcoes],
  );
  const nomes = useMemo(
    () => Object.fromEntries(cnesOpcoes.map((u) => [u.cnes, u.nome])),
    [cnesOpcoes],
  );
  const [antDe, antAte] = periodoAnterior(compDe, compAte, mesOffset);

  useEffect(() => {
    if (cnesOpcoes.length === 0) return;
    const t = ++token.current;
    const vivo = () => token.current === t;
    setErros({ st: "carregando" });
    setInat({ st: "carregando" });
    setFpo({ st: "carregando" });
    setCad({ st: "carregando" });
    setTend({ st: "carregando" });
    // Um de cada vez (do mais leve ao mais pesado): cada card aparece quando o seu termina e o
    // banco não recebe várias consultas pesadas ao mesmo tempo.
    const tarefas: [boolean, () => Promise<void>][] = [
      [
        pode("emitir_rel_producao"),
        () =>
          destaqueTendencia(compDe, compAte, antDe, antAte, cnesSel).then((v) => {
            if (vivo()) setTend({ st: "ok", v });
          }),
      ],
      [
        pode("emitir_rel_fpo"),
        () =>
          destaqueFpo(compAte, cnesLista, nomes).then((v) => {
            if (vivo()) setFpo({ st: "ok", v });
          }),
      ],
      [
        pode("emitir_rel_perfil"),
        () =>
          destaqueCadastros(compDe, compAte, cnesSel).then((v) => {
            if (vivo()) setCad({ st: "ok", v });
          }),
      ],
      [
        pode("emitir_rel_inativos"),
        () =>
          destaqueInativos(compDe, compAte, cnesLista, nomes).then((v) => {
            if (vivo()) setInat({ st: "ok", v });
          }),
      ],
      [
        pode("emitir_rel_consistencia"),
        () =>
          destaqueErros(compDe, compAte, cnesLista).then((v) => {
            if (vivo()) setErros({ st: "ok", v });
          }),
      ],
    ];
    const falhas = [setTend, setFpo, setCad, setInat, setErros] as ((e: { st: "erro" }) => void)[];
    (async () => {
      for (let i = 0; i < tarefas.length; i++) {
        if (!vivo()) return;
        const [permitido, fn] = tarefas[i];
        if (!permitido) continue;
        try {
          await fn();
        } catch {
          if (vivo()) falhas[i]({ st: "erro" });
        }
      }
      if (vivo()) setHora(new Date());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compDe, compAte, cnesLista.join(","), cnesOpcoes.length]);

  const st = <T,>(e: Estado<T>) => e.st;
  const cards: ReactNode[] = [];
  if (pode("emitir_rel_consistencia")) {
    const v = erros.st === "ok" ? erros.v : null;
    cards.push(
      <CardDestaque
        key="erros"
        tag="Antes de transmitir"
        tom={v && v.total === 0 ? "verde" : "vermelho"}
        estado={st(erros)}
        valor={
          v ? `${v.total.toLocaleString("pt-BR")} ${v.total === 1 ? "erro" : "erros"}` : undefined
        }
        texto={
          v ? (
            v.total === 0 ? (
              "Nenhum erro de consistência encontrado no período."
            ) : (
              <>
                com erro de consistência
                {v.principais.length ? `: ${v.principais.join("; ")}.` : "."}
              </>
            )
          ) : undefined
        }
        acao="Ver consistência"
        to="/relatorios/consistencia"
      />,
    );
  }
  if (pode("emitir_rel_inativos")) {
    const v = inat.st === "ok" ? inat.v : null;
    cards.push(
      <CardDestaque
        key="inat"
        tag="Equipe"
        tom={v && v.total === 0 ? "verde" : "ambar"}
        estado={st(inat)}
        valor={v ? `${v.total} ${v.total === 1 ? "profissional" : "profissionais"}` : undefined}
        texto={
          v ? (
            v.total === 0 ? (
              "Todos os profissionais assistenciais lançaram produção."
            ) : (
              <>
                assistenciais não lançaram produção no período.
                {v.maiorUnidade && v.total > 1
                  ? ` ${v.maiorUnidade.n} deles são da ${v.maiorUnidade.nome}.`
                  : ""}
              </>
            )
          ) : undefined
        }
        acao="Ver quem são"
        to="/relatorios/inativos"
      />,
    );
  }
  if (pode("emitir_rel_fpo")) {
    const v = fpo.st === "ok" ? fpo.v : null;
    cards.push(
      <CardDestaque
        key="fpo"
        tag="FPO"
        tom={v?.maior && v.maior.pct > 1 ? "vermelho" : "azul"}
        estado={st(fpo)}
        valor={v ? (v.maior ? pctFmt(v.maior.pct) : "Sem FPO") : undefined}
        texto={
          v ? (
            v.maior ? (
              <>
                do teto na {v.maior.nome}
                {v.maior.estourados > 0
                  ? `: ${v.maior.estourados} ${v.maior.estourados === 1 ? "procedimento passou" : "procedimentos passaram"} do orçado.`
                  : ", a unidade mais perto do limite."}
              </>
            ) : (
              "Nenhuma unidade com FPO cadastrada para o período."
            )
          ) : undefined
        }
        acao="Abrir FPO × Produção"
        to="/relatorios/fpo"
      />,
    );
  }
  if (pode("emitir_rel_perfil")) {
    const v = cad.st === "ok" ? cad.v : null;
    cards.push(
      <CardDestaque
        key="cad"
        tag="Cadastros"
        tom={v && v.total === 0 ? "verde" : v && v.semDoc > 0 ? "vermelho" : "ambar"}
        estado={st(cad)}
        valor={v ? `${v.total} ${v.total === 1 ? "paciente" : "pacientes"}` : undefined}
        texto={
          v ? (
            v.total === 0 ? (
              "Todos os pacientes atendidos estão com o cadastro completo."
            ) : (
              <>
                com cadastro incompleto
                {v.semDoc > 0
                  ? `; ${v.semDoc} ${v.semDoc === 1 ? "está" : "estão"} sem CNS e sem CPF e travam o envio.`
                  : "."}
              </>
            )
          ) : undefined
        }
        acao="Ver cadastros"
        to="/relatorios/cadastros"
      />,
    );
  }
  if (pode("emitir_rel_producao")) {
    const v = tend.st === "ok" ? tend.v : null;
    cards.push(
      <CardDestaque
        key="tend"
        tag="Tendência"
        tom={v && v.pct !== null && v.pct < 0 ? "vermelho" : "verde"}
        estado={st(tend)}
        valor={v ? (v.pct === null ? "—" : sinal(v.pct)) : undefined}
        texto={
          v ? (
            v.pct === null ? (
              `Sem produção no período anterior para comparar.`
            ) : (
              <>
                de procedimentos em relação a{" "}
                {antDe === antAte ? mesLabel(antDe) : `${mesLabel(antDe)}–${mesLabel(antAte)}`}.
                {v.maiorQueda
                  ? ` A maior queda foi em ${v.maiorQueda.nome} (${sinal(v.maiorQueda.pct)}).`
                  : ""}
              </>
            )
          ) : undefined
        }
        acao="Comparar meses"
        to="/relatorios/montar"
        search={{ inicio: "tendencia" }}
      />,
    );
  }
  if (cards.length === 0) return null;
  return (
    <section className="rv mb-8" style={{ animationDelay: "60ms" }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[17px] font-semibold text-[#172033]">
          O que pede atenção em {periodoLabel}
        </h2>
        <span className="text-[12.5px] text-[#5B6B82]" role="status">
          {hora
            ? `Atualizado às ${hora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
            : "Calculando…"}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">{cards}</div>
    </section>
  );
}

// ---------------- Meus modelos ----------------
function MeusModelos() {
  const user = useAuthUser();
  const navigate = useNavigate();
  const { compDe, compAte } = useRelatoriosCtx();
  const [modelos, setModelos] = useState<ModeloRelatorio[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<ModeloRelatorio | null>(null);
  const [renomear, setRenomear] = useState<{ m: ModeloRelatorio; nome: string } | null>(null);
  const recarregar = () => {
    listarModelos(user?.id).then(setModelos);
  };
  useEffect(recarregar, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const periodoCurto =
    compDe === compAte ? mesLabel(compDe) : `${mesLabel(compDe).slice(0, 3)}–${mesLabel(compAte)}`;
  const desc = (m: ModeloRelatorio) => {
    const c = m.config;
    const partes = [
      `${ROTULO_DIM[c.linhas]}${c.colunas !== "nada" ? ` × ${ROTULO_DIM[c.colunas]}` : ""}`,
    ];
    if (c.tipos.length) partes.push(c.tipos.join(" e "));
    if (c.periodo.modo === "fixo")
      partes.push(`${mesLabel(c.periodo.de)}–${mesLabel(c.periodo.ate)} (fixo)`);
    return partes.join(" · ");
  };
  return (
    <section className="rv mb-8" style={{ animationDelay: "120ms" }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="m-0 text-[17px] font-semibold text-[#172033]">Meus modelos</h2>
          <p className="text-[12.5px] text-[#5B6B82]">
            Gere de novo com o período selecionado acima
          </p>
        </div>
        <Link
          to="/relatorios/montar"
          className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#D5DCE6] bg-white px-3.5 text-[13px] font-semibold text-[#172033]"
        >
          <Plus className="size-4" /> Novo
        </Link>
      </div>
      {modelos.length === 0 ? (
        <div className={`${card} px-5 py-6 text-[13.5px] text-[#5B6B82]`}>
          Nenhum modelo salvo ainda. Monte um relatório e use{" "}
          <strong className="text-[#172033]">Salvar como modelo</strong> para gerá-lo de novo com um
          clique.
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {modelos.map((m) => (
            <div
              key={m.id}
              className={`${card} card relative flex min-w-0 flex-[1_1_260px] flex-col gap-2 p-5`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="min-w-0 truncate text-[14.5px] font-semibold text-[#172033]"
                  title={m.nome}
                >
                  {m.nome}
                </span>
                <button
                  type="button"
                  aria-label={`Opções do modelo ${m.nome}`}
                  aria-expanded={menu === m.id}
                  onClick={() => setMenu(menu === m.id ? null : m.id)}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-[#5B6B82] hover:bg-[#F1F4F8]"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </div>
              {menu === m.id && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
                  <div className="absolute right-4 top-14 z-40 w-40 overflow-hidden rounded-xl border border-[#E3E8EF] bg-white py-1 text-[13.5px] shadow-lg">
                    <button
                      type="button"
                      className="block w-full px-3 py-2.5 text-left hover:bg-[#F6F8FB]"
                      onClick={() => {
                        setMenu(null);
                        setRenomear({ m, nome: m.nome });
                      }}
                    >
                      Renomear
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2.5 text-left text-[#A3241A] hover:bg-[#FDECEA]"
                      onClick={() => {
                        setMenu(null);
                        setExcluir(m);
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </>
              )}
              <span className="text-[12.5px] text-[#5B6B82]">{desc(m)}</span>
              <span className="text-[12px] text-[#5B6B82]">Só você · neste navegador</span>
              <button
                type="button"
                onClick={() =>
                  navigate({ to: "/relatorios/montar", search: { modelo: m.id } as never })
                }
                className="btn mt-1 inline-flex min-h-10 w-fit items-center gap-1.5 rounded-xl bg-[#EAF1FD] px-3.5 text-[13px] font-semibold text-[#1D4FB0] hover:bg-[#DCE8FC]"
              >
                Gerar{" "}
                {m.config.periodo.modo === "fixo"
                  ? `${mesLabel(m.config.periodo.de).slice(0, 3)}–${mesLabel(m.config.periodo.ate)}`
                  : periodoCurto}
              </button>
            </div>
          ))}
        </div>
      )}
      <AlertDialog
        open={Boolean(excluir)}
        onOpenChange={(v) => {
          if (!v) setExcluir(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              O modelo “{excluir?.nome}” será apagado. Os relatórios já gerados não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={async () => {
                if (excluir) {
                  await excluirModelo(user?.id, excluir.id);
                  toast.success("Modelo excluído.");
                  recarregar();
                }
                setExcluir(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(renomear)}
        onOpenChange={(v) => {
          if (!v) setRenomear(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Renomear modelo</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <label
                  htmlFor="ren-nome"
                  className="mb-1.5 block text-[13px] font-semibold text-[#172033]"
                >
                  Nome do modelo
                </label>
                <input
                  id="ren-nome"
                  autoFocus
                  value={renomear?.nome ?? ""}
                  onChange={(e) => setRenomear((r) => (r ? { ...r, nome: e.target.value } : r))}
                  className="h-11 w-full rounded-[10px] border border-[#D5DCE6] px-3 text-[15px] text-[#172033]"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (renomear) {
                  await renomearModelo(user?.id, renomear.m.id, renomear.nome);
                  toast.success("Modelo renomeado.");
                  recarregar();
                }
                setRenomear(null);
              }}
            >
              Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ---------------- Relatórios prontos ----------------
type Pronto = {
  nome: string;
  desc: string;
  to: string;
  search?: Record<string, string>;
  perm: string;
  icon: ReactNode;
  nominal?: boolean;
};

function RelatoriosProntos() {
  const { pode } = usePermissoes();
  const { podeTfd } = useRelatoriosCtx();
  const [q, setQ] = useState("");
  const grupos: { titulo: string; itens: Pronto[] }[] = [
    {
      titulo: "Produção e envio",
      itens: [
        {
          nome: "Produção",
          desc: "BPA-I, BPA-C e RAAS com todos os filtros",
          to: "/relatorios/producao",
          perm: "emitir_rel_producao",
          icon: <FileText className="size-4" />,
        },
        {
          nome: "Consistência da produção",
          desc: "O que corrigir antes de transmitir",
          to: "/relatorios/consistencia",
          perm: "emitir_rel_consistencia",
          icon: <AlertTriangle className="size-4" />,
        },
        {
          nome: "Profissionais sem produção",
          desc: "Quem não lançou no período",
          to: "/relatorios/inativos",
          perm: "emitir_rel_inativos",
          icon: <UserX className="size-4" />,
        },
        {
          nome: "FPO × Produção",
          desc: "Orçado e produzido por unidade",
          to: "/relatorios/fpo",
          perm: "emitir_rel_fpo",
          icon: <FileSpreadsheet className="size-4" />,
        },
      ],
    },
    {
      titulo: "Valores e qualidade",
      itens: [
        {
          nome: "Valores da produção (R$)",
          desc: "Valor unitário e total por procedimento, unidade ou profissional",
          to: "/relatorios/montar",
          search: { inicio: "valores" },
          perm: "emitir_rel_producao",
          icon: <Wallet className="size-4" />,
        },
        {
          nome: "Cadastros de pacientes incompletos",
          desc: "Quem está sem documento, endereço ou raça/cor",
          to: "/relatorios/cadastros",
          perm: "emitir_rel_perfil",
          icon: <ClipboardList className="size-4" />,
          nominal: true,
        },
      ],
    },
    ...(podeTfd
      ? [
          {
            titulo: "TFD",
            itens: [
              {
                nome: "TFD",
                desc: "Por unidade e faixa de competência",
                to: "/relatorios/tfd",
                perm: "emitir_rel_tfd",
                icon: <Ambulance className="size-4" />,
              },
            ],
          },
        ]
      : []),
    {
      titulo: "Perfil e epidemiologia",
      itens: [
        {
          nome: "Perfil de pacientes",
          desc: "Faixa etária, sexo, raça/cor — anonimizado",
          to: "/relatorios/perfil",
          perm: "emitir_rel_perfil",
          icon: <Users className="size-4" />,
        },
        {
          nome: "Relação de pacientes",
          desc: "Lista com nomes, para conferência interna",
          to: "/relatorios/relacao",
          perm: "emitir_rel_perfil",
          icon: <Users className="size-4" />,
          nominal: true,
        },
        {
          nome: "Tabulação por procedimento",
          desc: "Procedimento × idade × sexo × bairro",
          to: "/relatorios/tabulacao",
          perm: "emitir_rel_perfil",
          icon: <FileBarChart className="size-4" />,
        },
      ],
    },
  ];
  const t = q.trim().toLowerCase();
  const filtrados = grupos
    .map((g) => ({
      ...g,
      itens: g.itens.filter((i) => !t || `${i.nome} ${i.desc}`.toLowerCase().includes(t)),
    }))
    .filter((g) => g.itens.length);
  return (
    <section className="rv" style={{ animationDelay: "180ms" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-[17px] font-semibold text-[#172033]">Relatórios prontos</h2>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Buscar relatório</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5B6B82]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar relatório"
            data-nocaps
            className="h-10 w-full rounded-full border border-[#D5DCE6] bg-white pl-9 pr-3 text-[13.5px] outline-none focus:border-[#2563D9]"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4">
        {filtrados.map((g) => (
          <div key={g.titulo} className={`${card} min-w-0 flex-[1_1_320px] overflow-hidden`}>
            <h3 className="border-b border-[#EEF2F7] px-5 py-3 text-[12px] font-bold uppercase tracking-wide text-[#5B6B82]">
              {g.titulo}
            </h3>
            <ul className="m-0 list-none p-0">
              {g.itens.map((i) => {
                const ok = pode(i.perm);
                const corpo = (
                  <>
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${ok ? "bg-[#EAF1FD] text-[#1D4FB0]" : "bg-[#F1F4F8] text-[#5B6B82]"}`}
                    >
                      {ok ? i.icon : <Lock className="size-4" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[#172033]">
                        {i.nome}
                        {i.nominal && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF4DF] px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-[#7A4A00]">
                            <ShieldCheck className="size-3" />
                            NOMINAL
                          </span>
                        )}
                      </span>
                      <span className="text-[12.5px] text-[#5B6B82]">
                        {ok ? i.desc : "Sem permissão"}
                      </span>
                    </span>
                    {ok && <ChevronRight className="chev size-4 text-[#5B6B82]" />}
                  </>
                );
                return (
                  <li key={i.nome} className="border-t border-[#EEF2F7] first:border-t-0">
                    {ok ? (
                      <Link
                        to={i.to}
                        search={i.search as never}
                        className="row-l more flex min-h-14 items-center gap-3 px-5 py-3"
                      >
                        {corpo}
                      </Link>
                    ) : (
                      <div
                        title="Sem permissão — fale com o gestor"
                        className="flex min-h-14 cursor-not-allowed items-center gap-3 px-5 py-3 opacity-70"
                      >
                        {corpo}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="text-[13.5px] text-[#5B6B82]">Nenhum relatório com esse nome.</p>
        )}
      </div>
    </section>
  );
}

function CentralRelatorios() {
  return (
    <div>
      <BarraPeriodo />
      <Destaques />
      <MeusModelos />
      <RelatoriosProntos />
    </div>
  );
}
