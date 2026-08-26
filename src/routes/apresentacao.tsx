import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  Stethoscope, Files, HeartPulse, ClipboardCheck, BedDouble, Ambulance, CalendarCheck,
  ShieldCheck, Database, TrendingUp, Gauge, FileBarChart, Upload, Building2,
  PenLine, Lock, Send, ArrowRight, Check, LogIn, Tag,
} from "lucide-react";
import spaEmblem from "@/assets/spa-emblem.png";

export const Route = createFileRoute("/apresentacao")({
  head: () => ({
    meta: [
      { title: "SPA Digital — Produção ambulatorial do SUS sem retrabalho" },
      { name: "description", content: "Digitação, validação e transmissão da produção ambulatorial do SUS (BPA-I, BPA-C, RAAS, APAC, AIH, TFD e FPO). Valida contra o SIGTAP antes de transmitir, gera o arquivo magnético e mostra a produção em tempo real." },
    ],
  }),
  component: Apresentacao,
});

const MODULOS = [
  { icon: Stethoscope, nome: "BPA-I", desc: "Boletim de Produção Individualizado, com identificação do paciente e CID." },
  { icon: Files, nome: "BPA-C", desc: "Boletim de Produção Consolidado, por procedimento e ocupação." },
  { icon: HeartPulse, nome: "RAAS", desc: "Atenção Psicossocial (CAPS) — folhas e ações no layout DATASUS." },
  { icon: ClipboardCheck, nome: "APAC", desc: "Laudo de Solicitação/Autorização de Procedimentos Ambulatoriais." },
  { icon: BedDouble, nome: "AIH", desc: "Laudo de Solicitação de Autorização de Internação Hospitalar." },
  { icon: Ambulance, nome: "TFD", desc: "Tratamento Fora do Domicílio: viagens, acompanhante e faturamento." },
  { icon: CalendarCheck, nome: "FPO", desc: "Ficha de Programação Orçamentária — controle de teto por unidade." },
];

const DIFERENCIAIS = [
  { icon: ShieldCheck, titulo: "Crivo de consistência", desc: "Valida a produção contra o SIGTAP e o cadastro antes de transmitir — aponta procedimento sem serviço/classificação, CID faltando, ficha incompleta e duplicidade. Menos glosa e menos crítica no SIA." },
  { icon: Database, titulo: "Arquivo magnético pronto", desc: "Fecha a produção do mês e gera o arquivo para transmissão: BPA Magnético (.txt) e RAAS (.AAS), no layout oficial do DATASUS, com o dígito de controle correto." },
  { icon: TrendingUp, titulo: "Produção em tempo real", desc: "Dashboard por unidade, profissional, procedimento e competência. Acompanhe o que foi produzido no mês sem esperar o fechamento." },
  { icon: Gauge, titulo: "FPO × Produção", desc: "Compare o produzido com o teto orçado de cada unidade e evite estourar o FPO — o que reduz glosa por teto." },
  { icon: FileBarChart, titulo: "Relatórios com timbre", desc: "Produção, TFD, FPO e consistência em PDF com a identidade visual da prefeitura (logo e cor de destaque)." },
  { icon: Upload, titulo: "Importe a produção existente", desc: "Traga a produção que você já tem (.MAR/.JUN e .AAS) para dentro do sistema e passe a gerir tudo num lugar só." },
];

const PASSOS = [
  { icon: PenLine, titulo: "Digite", desc: "Cadastre a produção nas fichas — com autofill de paciente, profissional e procedimento." },
  { icon: ShieldCheck, titulo: "Valide", desc: "O crivo aponta as pendências antes de fechar. Corrija o que geraria glosa ou crítica." },
  { icon: Lock, titulo: "Feche o mês", desc: "Congele a produção da competência e gere o arquivo magnético." },
  { icon: Send, titulo: "Transmita", desc: "Envie ao SIA/DATASUS com a segurança de já ter validado tudo." },
];

const gradPrimario = { background: "linear-gradient(135deg, oklch(0.62 0.17 250), oklch(0.55 0.19 278))" };

function Apresentacao() {
  const semMovimento = useReducedMotion();

  // Variants de revelação no scroll (fade + rise), com stagger para os filhos.
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: semMovimento ? 0 : 0.08 } },
  };
  const item: Variants = {
    hidden: semMovimento ? { opacity: 0 } : { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 18 } },
  };
  // Wrapper padrão: anima quando entra na viewport (uma vez).
  const reveal = {
    initial: "hidden" as const,
    whileInView: "show" as const,
    viewport: { once: true, margin: "-80px" },
  };

  const consultarPreco = () =>
    toast("Consulta de preço em breve", { description: "Estamos finalizando os planos. Fale com a gente pela área de membros." });

  const btnPrimario = "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_oklch(0.56_0.17_258/0.6)]";

  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      {/* keyframes da aurora + brilho, respeitando reduce-motion */}
      <style>{`
        @keyframes spa-float { 0%,100%{transform:translate3d(0,0,0) scale(1)} 50%{transform:translate3d(0,-24px,0) scale(1.06)} }
        @keyframes spa-drift { 0%,100%{transform:translate3d(0,0,0)} 50%{transform:translate3d(30px,20px,0)} }
        .spa-blob{ will-change: transform; animation: spa-float 12s ease-in-out infinite; }
        .spa-blob-2{ animation: spa-drift 16s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .spa-blob,.spa-blob-2{ animation:none } }
      `}</style>

      {/* ===== Nav ===== */}
      <motion.header
        initial={semMovimento ? false : { y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src={spaEmblem} alt="SPA Digital" className="size-9 shrink-0 object-contain" />
            <span className="text-lg font-bold tracking-tight">SPA Digital</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={consultarPreco}
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex">
              <Tag className="size-4" /> Consultar preço
            </button>
            <motion.div whileHover={semMovimento ? undefined : { y: -2 }} whileTap={{ scale: 0.97 }}>
              <Link to="/" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted">
                <LogIn className="size-4" /> Área de membros
              </Link>
            </motion.div>
          </div>
        </nav>
      </motion.header>

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden">
        {/* Aurora animada (blobs que flutuam) */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="spa-blob absolute -left-24 -top-24 size-[38rem] rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, oklch(0.62 0.17 250 / 0.35), transparent 60%)" }} />
          <div className="spa-blob spa-blob-2 absolute -right-20 top-10 size-[34rem] rounded-full opacity-50 blur-3xl"
            style={{ background: "radial-gradient(circle, oklch(0.55 0.16 275 / 0.35), transparent 60%)" }} />
          <div className="spa-blob absolute bottom-0 left-1/3 size-[28rem] rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, oklch(0.72 0.12 178 / 0.30), transparent 60%)", animationDelay: "-6s" }} />
          {/* grade sutil */}
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(oklch(0.21 0.03 262) 1px, transparent 1px), linear-gradient(90deg, oklch(0.21 0.03 262) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(70% 60% at 50% 30%, #000, transparent)" }} />
        </div>

        <motion.div {...reveal} variants={container} className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <motion.span variants={item} className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" /> Produção ambulatorial do SUS, sem retrabalho
            </motion.span>
            <motion.h1 variants={item} className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
              Digite, valide e transmita sua produção do SUS{" "}
              <span className="bg-gradient-to-r from-[oklch(0.62_0.17_250)] via-[oklch(0.55_0.19_278)] to-[oklch(0.72_0.12_178)] bg-clip-text text-transparent">num só lugar</span>
            </motion.h1>
            <motion.p variants={item} className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
              BPA-I, BPA-C, RAAS, APAC, AIH, TFD e FPO. O SPA Digital valida sua produção contra o SIGTAP <strong className="text-foreground">antes</strong> de transmitir, gera o arquivo magnético no layout oficial e mostra sua produção em tempo real — reduzindo glosa e retrabalho.
            </motion.p>
            <motion.div variants={item} className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <motion.button whileHover={semMovimento ? undefined : { y: -3, scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={consultarPreco} className={btnPrimario} style={gradPrimario}>
                <Tag className="size-4" /> Consultar preço
              </motion.button>
              <motion.div whileHover={semMovimento ? undefined : { y: -3 }} whileTap={{ scale: 0.97 }}>
                <Link to="/" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted">
                  <LogIn className="size-4" /> Área de membros
                </Link>
              </motion.div>
            </motion.div>
            <motion.p variants={item} className="mt-4 text-xs text-muted-foreground">Acesso restrito a usuários criados pela administração.</motion.p>
          </div>
        </motion.div>
      </section>

      {/* ===== Faixa de credibilidade ===== */}
      <section className="border-y border-border/60 bg-muted/30">
        <motion.div {...reveal} variants={container} className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center sm:grid-cols-4 sm:px-6">
          {[
            ["7 formulários", "num só sistema"],
            ["Layout DATASUS", "arquivo magnético pronto"],
            ["Valida no SIGTAP", "antes de transmitir"],
            ["Multi-prefeitura", "com permissões por vínculo"],
          ].map(([a, b]) => (
            <motion.div variants={item} key={a}>
              <div className="text-base font-bold text-foreground sm:text-lg">{a}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{b}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ===== Módulos ===== */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <motion.div {...reveal} variants={container} className="mx-auto max-w-2xl text-center">
          <motion.h2 variants={item} className="text-3xl font-bold tracking-tight sm:text-4xl">Tudo o que sua produção precisa</motion.h2>
          <motion.p variants={item} className="mt-3 text-muted-foreground">Os formulários do dia a dia da atenção ambulatorial, cada um com as regras e o layout oficial.</motion.p>
        </motion.div>
        <motion.div {...reveal} variants={container} className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS.map((m) => (
            <motion.div variants={item} whileHover={semMovimento ? undefined : { y: -6 }} key={m.nome}
              className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-xl">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <m.icon className="size-5" />
                </span>
                <h3 className="text-lg font-bold">{m.nome}</h3>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{m.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ===== Diferenciais ===== */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <motion.div {...reveal} variants={container} className="mx-auto max-w-2xl text-center">
            <motion.h2 variants={item} className="text-3xl font-bold tracking-tight sm:text-4xl">Por que o SPA Digital</motion.h2>
            <motion.p variants={item} className="mt-3 text-muted-foreground">Não é só digitar: é fechar o mês com a produção certa e o menor risco de glosa.</motion.p>
          </motion.div>
          <motion.div {...reveal} variants={container} className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DIFERENCIAIS.map((d) => (
              <motion.div variants={item} whileHover={semMovimento ? undefined : { y: -6 }} key={d.titulo} className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-xl">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <d.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-bold">{d.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== Como funciona ===== */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <motion.div {...reveal} variants={container} className="mx-auto max-w-2xl text-center">
          <motion.h2 variants={item} className="text-3xl font-bold tracking-tight sm:text-4xl">Do atendimento à transmissão</motion.h2>
          <motion.p variants={item} className="mt-3 text-muted-foreground">Um fluxo simples, com a validação no meio do caminho.</motion.p>
        </motion.div>
        <motion.div {...reveal} variants={container} className="relative mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PASSOS.map((p, i) => (
            <motion.div variants={item} key={p.titulo} className="relative rounded-2xl border border-border bg-card p-6 shadow-sm">
              <span className="absolute right-5 top-5 text-4xl font-bold text-muted-foreground/15">{i + 1}</span>
              <span className="flex size-11 items-center justify-center rounded-xl text-white" style={gradPrimario}>
                <p.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-bold">{p.titulo}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ===== Para quem ===== */}
      <section className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <motion.div {...reveal} variants={container}>
              <motion.h2 variants={item} className="text-3xl font-bold tracking-tight sm:text-4xl">Feito para a gestão municipal de saúde</motion.h2>
              <motion.p variants={item} className="mt-4 text-muted-foreground">
                Secretarias e fundações municipais, CAPS, unidades de especialidades e ambulatórios. Cada unidade digita a sua produção; a gestão acompanha tudo, com permissões por vínculo — e a identidade visual da prefeitura nos relatórios.
              </motion.p>
              <motion.ul variants={container} className="mt-6 space-y-3">
                {[
                  "Controle de teto (FPO) para não estourar o orçado",
                  "Consistência da produção antes de transmitir",
                  "Fechamento do mês e arquivo magnético num clique",
                  "Importação da produção que você já tem",
                ].map((t) => (
                  <motion.li variants={item} key={t} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="size-3.5" /></span>
                    <span className="text-foreground">{t}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>
            <motion.div {...reveal} variants={item} whileHover={semMovimento ? undefined : { y: -6 }} className="rounded-3xl border border-border bg-card p-8 shadow-sm transition-shadow hover:shadow-xl">
              <div className="flex items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Building2 className="size-6" /></span>
                <div>
                  <div className="font-bold">Multi-prefeitura</div>
                  <div className="text-xs text-muted-foreground">um sistema, várias gestões</div>
                </div>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                Cada prefeitura tem seus dados isolados, sua logo e sua cor de destaque nos relatórios. Os acessos são criados pela administração — <strong className="text-foreground">não há autocadastro</strong>, garantindo que só entra quem deve.
              </p>
              <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                Acessar a área de membros <ArrowRight className="size-4" />
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== CTA final ===== */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <motion.div {...reveal} variants={item} className="relative overflow-hidden rounded-3xl px-6 py-16 text-center text-white shadow-[0_24px_60px_-24px_oklch(0.3_0.1_260/0.6)] sm:px-10"
          style={{ background: "linear-gradient(120deg, oklch(0.30 0.07 258), oklch(0.38 0.11 268), oklch(0.46 0.14 250))" }}>
          <div className="spa-blob pointer-events-none absolute -right-10 -top-16 size-64 rounded-full" style={{ background: "radial-gradient(circle, oklch(0.85 0.1 235 / 0.28), transparent 70%)" }} />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">Pronto para reduzir glosa e retrabalho?</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-white/80">Conheça os planos do SPA Digital ou entre na área de membros se você já tem acesso.</p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <motion.button whileHover={semMovimento ? undefined : { y: -3, scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={consultarPreco} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[oklch(0.35_0.1_262)] shadow-lg">
              <Tag className="size-4" /> Consultar preço
            </motion.button>
            <motion.div whileHover={semMovimento ? undefined : { y: -3 }} whileTap={{ scale: 0.97 }}>
              <Link to="/" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20">
                <LogIn className="size-4" /> Área de membros
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ===== Rodapé ===== */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src={spaEmblem} alt="SPA Digital" className="size-7 shrink-0 object-contain" />
            <span className="text-sm font-semibold">SPA Digital</span>
            <span className="text-xs text-muted-foreground">· Produção ambulatorial do SUS</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <button onClick={consultarPreco} className="text-muted-foreground hover:text-foreground">Consultar preço</button>
            <Link to="/" className="font-semibold text-primary hover:underline">Área de membros</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
