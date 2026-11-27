// Cadastros de pacientes incompletos — só pacientes com ficha no período/unidade escolhidos.
// Documento sempre mascarado; abrir/completar um cadastro registra a leitura (LGPD).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Download, FileText, Loader2, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { usePermissoes } from "@/lib/permissoes";
import { registrarLeituraPaciente, type Paciente } from "@/lib/pacientes";
import {
  carregarCadastrosIncompletos,
  documentoMascarado,
  camposFaltando,
  CAMPOS_FALTA,
  type ResultadoCadastros,
} from "@/lib/relatorios/cadastros";
import { baixarCsv } from "@/lib/relatorios/producao";
import { gerarPdfTabela, type GrupoPdf } from "@/lib/relatorios/pdf-tabela";
import { useRelatoriosCtx } from "@/components/relatorios/ctx";
import { SemAcesso, BarraFiltrosBase } from "@/components/relatorios/comum";
import { PdfAjustavelModal } from "@/components/relatorios/PdfAjustavelModal";
import { PacienteForm } from "@/components/pacientes/PacientePicker";

export const Route = createFileRoute("/relatorios/cadastros")({
  head: () => ({ meta: [{ title: "Cadastros incompletos — SPA Digital" }] }),
  component: CadastrosIncompletos,
});

const ROTULO = new Map(CAMPOS_FALTA.map((c) => [c.id, c.rotulo]));
const GRAVE = new Set(CAMPOS_FALTA.filter((c) => c.grave).map((c) => c.id));
const intFmt = (n: number) => n.toLocaleString("pt-BR");

function CadastrosIncompletos() {
  const { pode } = usePermissoes();
  const { compDe, compAte, cnesSel, cnesOpcoes, logo, cor, nomeUsuario, periodoLabel, periodoArq } =
    useRelatoriosCtx();
  const [res, setRes] = useState<ResultadoCadastros | null>(null);
  const [erro, setErro] = useState(false);
  const [falta, setFalta] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Paciente | null>(null);
  const [pdfAberto, setPdfAberto] = useState(false);
  const token = useRef(0);
  const nomeUnidade = useCallback(
    (c: string | null) => (c ? (cnesOpcoes.find((u) => u.cnes === c)?.nome ?? c) : "—"),
    [cnesOpcoes],
  );

  const carregar = useCallback(async () => {
    const t = ++token.current;
    setRes(null);
    setErro(false);
    try {
      const r = await carregarCadastrosIncompletos(compDe, compAte, cnesSel);
      if (token.current === t) setRes(r);
    } catch {
      if (token.current === t) setErro(true);
    }
  }, [compDe, compAte, cnesSel]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of res?.incompletos ?? []) for (const f of p.faltam) m.set(f, (m.get(f) ?? 0) + 1);
    return CAMPOS_FALTA.map((c) => ({ ...c, n: m.get(c.id) ?? 0 }))
      .filter((c) => c.n > 0)
      .sort((a, b) => b.n - a.n);
  }, [res]);
  const maxCont = Math.max(1, ...contagem.map((c) => c.n));

  const lista = useMemo(() => {
    const t = q.trim().toUpperCase();
    return (res?.incompletos ?? []).filter(
      (p) =>
        (!falta || p.faltam.includes(falta)) && (!t || p.paciente.nome.toUpperCase().includes(t)),
    );
  }, [res, falta, q]);

  const unidadesTexto = cnesSel.size
    ? [...cnesSel].map(nomeUnidade).join(", ")
    : "todas as unidades";

  const csv = () => {
    const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const linhas = [
      ["Paciente", "Documento", "Unidade (última ficha)", "Fichas no período", "O que falta"],
      ...lista.map((p) => [
        p.paciente.nome,
        documentoMascarado(p.paciente),
        nomeUnidade(p.cnesUltima),
        String(p.fichas),
        p.faltam.map((f) => ROTULO.get(f) ?? f).join(", "),
      ]),
    ];
    baixarCsv(
      `cadastros-incompletos-${periodoArq}.csv`,
      "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\r\n"),
    );
    toast.success("CSV gerado.");
  };

  const gerarPdf = (o: { orientacao: "auto" | "retrato" | "paisagem"; ajustar: boolean }) => {
    const porUnidade = new Map<string, typeof lista>();
    for (const p of lista) {
      const u = nomeUnidade(p.cnesUltima);
      porUnidade.set(u, [...(porUnidade.get(u) ?? []), p]);
    }
    const grupos: GrupoPdf[] = [...porUnidade.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
      .map(([u, ps]) => ({
        titulo: `${u} — ${ps.length} ${ps.length === 1 ? "paciente" : "pacientes"}`,
        linhas: ps.map((p) => [
          p.paciente.nome,
          documentoMascarado(p.paciente),
          String(p.fichas),
          p.faltam.map((f) => ROTULO.get(f) ?? f).join(", "),
        ]),
      }));
    return gerarPdfTabela({
      titulo: "Cadastros de pacientes incompletos",
      infos: [
        `Período de produção ${periodoLabel} · ${intFmt(lista.length)} paciente(s) com cadastro incompleto`,
        `Unidade(s): ${unidadesTexto}${falta ? ` · Filtro: falta ${ROTULO.get(falta)}` : ""}`,
        "Documentos mascarados. Uso interno para correção de cadastro (LGPD).",
      ],
      colunas: [
        { titulo: "Paciente", alinhar: "left" },
        { titulo: "Documento", alinhar: "left" },
        { titulo: "Fichas", alinhar: "right" },
        { titulo: "O que falta", alinhar: "left" },
      ],
      grupos,
      logo,
      cor,
      geradoPor: nomeUsuario,
      orientacao: o.orientacao,
      ajustar: o.ajustar,
    });
  };

  const abrirEdicao = (p: Paciente) => {
    void registrarLeituraPaciente(p.id);
    setEditando(p);
  };

  if (!pode("emitir_rel_perfil")) return <SemAcesso />;

  const card = "rounded-[18px] border border-[#E3E8EF] bg-white";
  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Trilha" className="mb-1 flex items-center gap-1.5 text-[13px]">
            <Link
              to="/relatorios"
              className="inline-flex min-h-8 items-center gap-1 font-semibold text-[#2563D9] hover:underline"
            >
              <ChevronLeft className="size-4" />
              Relatórios
            </Link>
            <span className="text-[#5B6B82]">/ Cadastros incompletos</span>
          </nav>
          <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-[#5B6B82]">
            Pacientes atendidos em {periodoLabel} · {unidadesTexto}
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF4DF] px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-[#7A4A00]">
              <ShieldCheck className="size-3" />
              NOMINAL
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={csv}
            disabled={!res || lista.length === 0}
            className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#D5DCE6] bg-white px-3.5 text-[13px] font-semibold text-[#172033] disabled:opacity-50"
          >
            <Download className="size-4" /> CSV
          </button>
          <button
            type="button"
            onClick={() => setPdfAberto(true)}
            disabled={!res || lista.length === 0}
            className="btn inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#15213A] px-4 text-[13px] font-semibold text-white hover:bg-[#1F2E4D] disabled:opacity-50"
          >
            <FileText className="size-4" /> PDF por unidade
          </button>
        </div>
      </div>

      <div className="no-print mb-5">
        <BarraFiltrosBase />
      </div>

      {erro ? (
        <div className={`${card} p-8 text-center text-[14px] text-[#5B6B82]`}>
          Não foi possível carregar agora.{" "}
          <button
            type="button"
            onClick={() => void carregar()}
            className="font-semibold text-[#2563D9] underline"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div
            className="rv mb-5 grid grid-cols-2 gap-3 md:grid-cols-4"
            style={{ animationDelay: "0ms" }}
          >
            {[
              { r: "Pacientes atendidos", v: res ? intFmt(res.atendidos) : null },
              { r: "Com cadastro incompleto", v: res ? intFmt(res.incompletos.length) : null },
              {
                r: "Sem CNS e sem CPF",
                v: res
                  ? intFmt(res.incompletos.filter((p) => p.faltam.includes("documento")).length)
                  : null,
              },
              { r: "Fichas afetadas", v: res ? intFmt(res.fichasAfetadas) : null },
            ].map((x) => (
              <div key={x.r} className={`${card} px-5 py-4`}>
                <div className="text-[12px] font-semibold text-[#5B6B82]">{x.r}</div>
                {x.v === null ? (
                  <span
                    className="sk mt-1.5"
                    style={{ display: "block", height: 26, width: "50%" }}
                  />
                ) : (
                  <div className="text-[24px] font-bold tabular-nums text-[#172033]">{x.v}</div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            {/* O que mais falta */}
            <section
              aria-label="O que mais falta"
              className={`${card} rv no-print w-full shrink-0 p-5 lg:w-[320px]`}
              style={{ animationDelay: "60ms" }}
            >
              <h2 className="mb-1 text-[15px] font-semibold text-[#172033]">O que mais falta</h2>
              <p className="mb-3 text-[12.5px] text-[#5B6B82]">Clique para filtrar a lista.</p>
              {!res ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className="sk" style={{ display: "block", height: 30 }} />
                  ))}
                </div>
              ) : contagem.length === 0 ? (
                <p className="text-[13.5px] text-[#0B6B44]">Nenhum campo faltando. 🎉</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {contagem.map((c) => {
                    const ativo = falta === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          aria-pressed={ativo}
                          onClick={() => setFalta(ativo ? null : c.id)}
                          className={`flex min-h-11 w-full flex-col gap-1 rounded-lg px-2.5 py-1.5 text-left ${ativo ? "bg-[#EAF1FD]" : "hover:bg-[#F6F8FB]"}`}
                        >
                          <span className="flex w-full items-center justify-between gap-2 text-[13px]">
                            <span
                              className={`font-semibold ${GRAVE.has(c.id) ? "text-[#A3241A]" : "text-[#172033]"}`}
                            >
                              {c.rotulo}
                            </span>
                            <span className="tabular-nums text-[#33415A]">{intFmt(c.n)}</span>
                          </span>
                          <span className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEF2F7]">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${(c.n / maxCont) * 100}%`,
                                background: GRAVE.has(c.id) ? "#D64545" : "#257DE0",
                              }}
                            />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {res && res.semCadastro > 0 && (
                <p className="mt-3 border-t border-[#EEF2F7] pt-3 text-[12px] text-[#5B6B82]">
                  {intFmt(res.semCadastro)} atendimento(s) foram lançados sem ligação com o cadastro
                  de pacientes (fichas antigas ou importadas) e não entram nesta lista.
                </p>
              )}
            </section>

            {/* Lista */}
            <section
              aria-label="Pacientes com cadastro incompleto"
              className={`${card} rv min-w-0 flex-1`}
              style={{ animationDelay: "120ms" }}
            >
              <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF2F7] px-5 py-3">
                <h2 className="m-0 text-[15px] font-semibold text-[#172033]">
                  {res
                    ? `${intFmt(lista.length)} ${lista.length === 1 ? "paciente" : "pacientes"}`
                    : "Carregando…"}
                  {falta && (
                    <button
                      type="button"
                      onClick={() => setFalta(null)}
                      className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#EAF1FD] px-2.5 py-0.5 text-[12px] font-semibold text-[#1D4FB0]"
                    >
                      falta {ROTULO.get(falta)} <X className="size-3" />
                    </button>
                  )}
                </h2>
                <label className="relative w-full sm:w-64">
                  <span className="sr-only">Buscar paciente</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5B6B82]" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar pelo nome"
                    className="h-10 w-full rounded-full border border-[#D5DCE6] bg-white pl-9 pr-3 text-[13.5px] uppercase outline-none focus:border-[#2563D9]"
                  />
                </label>
              </div>
              {!res ? (
                <div className="flex flex-col gap-2 p-5">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i} className="sk" style={{ display: "block", height: 40 }} />
                  ))}
                </div>
              ) : lista.length === 0 ? (
                <p className="p-10 text-center text-[14px] text-[#5B6B82]">
                  {res.incompletos.length === 0
                    ? "Todos os pacientes atendidos no período estão com o cadastro completo."
                    : "Nenhum paciente com esse filtro."}
                </p>
              ) : (
                <ul className="rel-scroll m-0 max-h-[680px] list-none overflow-auto p-0">
                  {lista.map((p) => (
                    <li
                      key={p.paciente.id}
                      className="flex flex-wrap items-center gap-3 border-t border-[#EEF2F7] px-5 py-3 first:border-t-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-[#172033]">
                          {p.paciente.nome}
                        </div>
                        <div className="text-[12px] text-[#5B6B82]">
                          <span className="mono">{documentoMascarado(p.paciente)}</span> ·{" "}
                          {nomeUnidade(p.cnesUltima)} · {p.fichas}{" "}
                          {p.fichas === 1 ? "ficha" : "fichas"} no período
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {p.faltam.map((f) => (
                            <span
                              key={f}
                              className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${GRAVE.has(f) ? "bg-[#FDECEA] text-[#A3241A]" : "bg-[#F1F4F8] text-[#33415A]"}`}
                            >
                              {ROTULO.get(f) ?? f}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => abrirEdicao(p.paciente)}
                        className="no-print btn inline-flex min-h-10 items-center rounded-xl bg-[#EAF1FD] px-3.5 text-[13px] font-semibold text-[#1D4FB0] hover:bg-[#DCE8FC]"
                      >
                        Completar cadastro
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="border-t border-[#EEF2F7] px-5 py-3 text-[12px] text-[#5B6B82]">
                Os documentos aparecem mascarados. Abrir um cadastro fica registrado (LGPD).
              </p>
            </section>
          </div>
        </>
      )}

      {editando && (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-[#15213A]/55 p-4 backdrop-blur-sm"
          onMouseDown={() => setEditando(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Completar cadastro"
            className="my-6 w-full max-w-3xl rounded-2xl bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E3E8EF] px-5 py-3">
              <h2 className="text-[16px] font-semibold text-[#172033]">Completar cadastro</h2>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setEditando(null)}
                className="inline-flex size-10 items-center justify-center rounded-xl text-[#5B6B82] hover:bg-[#F1F4F8]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5">
              <PacienteForm
                orgId={editando.organizacao_id}
                paciente={editando}
                permitirAcompanhante={false}
                apenasTfd={false}
                marcarTfd={false}
                onSalvo={(novo) => {
                  setEditando(null);
                  toast.success(
                    camposFaltando(novo).length === 0
                      ? "Cadastro completo."
                      : "Cadastro atualizado.",
                  );
                  setRes((r) => {
                    if (!r) return r;
                    const incompletos = r.incompletos
                      .map((x) =>
                        x.paciente.id === novo.id
                          ? { ...x, paciente: novo, faltam: camposFaltando(novo) }
                          : x,
                      )
                      .filter((x) => x.faltam.length > 0);
                    const afetadas = new Set(incompletos.flatMap((x) => x.fichaIds));
                    return { ...r, incompletos, fichasAfetadas: afetadas.size };
                  });
                }}
                onCancela={() => setEditando(null)}
              />
            </div>
          </div>
        </div>
      )}
      {pdfAberto && (
        <PdfAjustavelModal
          titulo="Cadastros de pacientes incompletos"
          nomeArquivo={`cadastros-incompletos-${periodoArq}.pdf`}
          gerar={gerarPdf}
          onClose={() => setPdfAberto(false)}
        />
      )}
      {!res && !erro && (
        <span className="sr-only" role="status">
          <Loader2 /> Carregando cadastros
        </span>
      )}
    </div>
  );
}
