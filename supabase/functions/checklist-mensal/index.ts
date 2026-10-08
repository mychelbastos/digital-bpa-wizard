// Edge Function: checklist-mensal
// Checklist de atualização do SPA — roda sob demanda (botão na conta MASTER). Faz:
//  1. SIGTAP: compara a última competência no FTP do DATASUS com a carregada no banco.
//  2. Programas (BPA-MAG, FPO-MAG, RAAS, APAC): lê a versão corrente no FTP e compara com a
//     versão que o nosso sistema MIRA (TARGETS) — sinaliza possível conflito nos arquivos
//     exportados quando o DATASUS está à frente.
//  3. SCNES: dispara o refresh da lista de profissionais dos CNES em uso (homologação).
// Resposta: relatório estruturado. Cada item degrada com graça (status "nao_verificado" +
// link) quando o FTP não responde — nunca trava o checklist inteiro.
//
// Autenticação: super-admin (JWT do app) OU header x-checklist-secret (CHECKLIST_SECRET).
import { createClient } from "npm:@supabase/supabase-js@2";

const latin1 = new TextDecoder("latin1");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-checklist-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// ---- cliente FTP mínimo (passivo), com timeout por operação ----
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: number;
  const to = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); });
  try { return await Promise.race([p, to]); } finally { clearTimeout(t!); }
}
async function ftpList(host: string, dir: string, ms = 15000): Promise<string> {
  return await withTimeout((async () => {
    const conn = await Deno.connect({ hostname: host, port: 21 });
    const reader = conn.readable.getReader();
    let buf = new Uint8Array(0);
    const readLine = async (): Promise<string> => {
      for (;;) {
        const m = latin1.decode(buf).match(/^(\d{3}) [^\r\n]*\r\n/m);
        if (m) { const line = latin1.decode(buf).slice(0, m.index! + m[0].length); buf = buf.slice(new TextEncoder().encode(line).length); return line.trim(); }
        const { value, done } = await reader.read();
        if (done) return latin1.decode(buf).trim();
        const nb = new Uint8Array(buf.length + value.length); nb.set(buf); nb.set(value, buf.length); buf = nb;
      }
    };
    const send = (c: string) => conn.write(new TextEncoder().encode(c + "\r\n"));
    await readLine(); await send("USER anonymous"); await readLine();
    await send("PASS anonymous@"); await readLine(); await send("TYPE I"); await readLine();
    await send("PASV"); const pv = await readLine();
    const m = pv.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    if (!m) throw new Error("PASV");
    const data = await Deno.connect({ hostname: `${m[1]}.${m[2]}.${m[3]}.${m[4]}`, port: (+m[5]) * 256 + (+m[6]) });
    await send(`LIST ${dir}`); await readLine();
    const chunks: Uint8Array[] = []; const dr = data.readable.getReader();
    for (;;) { const { value, done } = await dr.read(); if (done) break; chunks.push(value); }
    let n = 0; for (const c of chunks) n += c.length; const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
    try { conn.close(); } catch { /* */ }
    return latin1.decode(out);
  })(), ms);
}

// Versões que o NOSSO sistema mira hoje. O DATASUS (web e FTP dos programas) bloqueia IPs de
// datacenter — inalcançável do edge. A via automática possível é um CATÁLOGO COMUNITÁRIO no
// GitHub (reachable), que hoje cobre o BPA; onde o catálogo não tem (FPO/RAAS/APAC), cai para
// conferência MANUAL via link oficial. `prefixo` = prefixo da tag no catálogo (ex.: "bpa-v05-00").
const PROGRAMAS = [
  { item: "BPA Magnético", nosso: "05.00", prefixo: "bpa", pagina: "https://sia.datasus.gov.br/versao/listar_ftp_bpa.php" },
  { item: "FPO Magnético", nosso: "03.03", prefixo: "fpo", pagina: "https://sia.datasus.gov.br/versao/listar_ftp_fpo.php" },
  { item: "RAAS", nosso: "02.35", prefixo: "raas", pagina: "https://sia.datasus.gov.br/versao/listar_ftp_raas.php" },
  { item: "APAC Magnético", nosso: "04.02", prefixo: "apac", pagina: "https://sia.datasus.gov.br/versao/listar_ftp_apac.php" },
];

// Lê as releases do catálogo comunitário (GitHub). Retorna prefixo -> { v:"NN.NN", data }.
// NÃO é fonte oficial — é só uma DICA (o DATASUS bloqueia acesso de servidor). O checklist
// trata isso como indicativo + data, nunca como um "em dia" definitivo.
async function versoesDoCatalogo(): Promise<Record<string, { v: string; data: string }>> {
  const out: Record<string, { v: string; data: string }> = {};
  try {
    const r = await withTimeout(fetch("https://api.github.com/repos/BRConnect/datasus-releases/releases?per_page=100",
      { headers: { "User-Agent": "spa-digital-checklist", "Accept": "application/vnd.github+json" } }), 12000);
    if (!r.ok) return out;
    const rel = await r.json() as { tag_name: string; published_at: string }[];
    for (const x of rel) {
      const m = x.tag_name?.match(/^([a-z]+)-v(\d{2})-(\d{2})/i);
      if (!m) continue;
      const pref = m[1].toLowerCase(); const v = `${m[2]}.${m[3]}`;
      if (!out[pref] || v > out[pref].v) out[pref] = { v, data: (x.published_at || "").slice(0, 10) };
    }
  } catch { /* catálogo indisponível -> tudo manual */ }
  return out;
}
const brData = (s: string) => (s ? s.split("-").reverse().join("/") : "?");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const SERVICE = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // auth: segredo OU super-admin
  const segredo = Deno.env.get("CHECKLIST_SECRET");
  const viaSegredo = Boolean(segredo) && req.headers.get("x-checklist-secret") === segredo;
  if (!viaSegredo) {
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: auth } = await caller.auth.getUser();
    if (!auth?.user) return json({ erro: "Sem autenticação." }, 401);
    const { data: sa } = await caller.rpc("is_super_admin");
    if (sa !== true) return json({ erro: "Apenas a conta master." }, 403);
  }

  const itens: unknown[] = [];

  // 1) SIGTAP — competência mais recente no FTP vs banco
  try {
    const lst = await ftpList("ftp2.datasus.gov.br", "/public/sistemas/tup/downloads/");
    const comps = [...lst.matchAll(/TabelaUnificada_(\d{6})_/g)].map((m) => m[1]).sort();
    const ftpComp = comps[comps.length - 1] ?? null;
    const { data: dbrow } = await SERVICE.from("sigtap_competencias").select("competencia").order("competencia", { ascending: false }).limit(1);
    const dbComp = dbrow?.[0]?.competencia ?? null;
    const status = !ftpComp ? "nao_verificado" : ftpComp === dbComp ? "ok" : ftpComp > (dbComp ?? "") ? "atencao" : "ok";
    itens.push({ item: "SIGTAP (competência)", status, atual: ftpComp, nosso: dbComp, pagina: "http://sigtap.datasus.gov.br",
      detalhe: status === "atencao" ? `Há competência nova (${ftpComp}); temos ${dbComp}. O cron importa dia 20 — ou importe agora.` : `Em dia (${dbComp}).` });
  } catch (_e) {
    itens.push({ item: "SIGTAP (competência)", status: "nao_verificado", atual: null, nosso: null, detalhe: "Não consegui ler o FTP do SIGTAP agora." });
  }

  // 2) Programas. O DATASUS bloqueia acesso de servidor, então NÃO há fonte oficial automática.
  // O catálogo comunitário (GitHub) é só uma DICA DATADA; o link oficial é a palavra final.
  //   - catálogo À FRENTE da nossa versão  -> ⚠️ atenção (sinal forte para agir).
  //   - catálogo igual, ou sem catálogo    -> 🔗 conferir no link (nunca "em dia" definitivo).
  const catalogo = await versoesDoCatalogo();
  for (const p of PROGRAMAS) {
    const c = catalogo[p.prefixo];
    if (c && c.v > p.nosso) {
      itens.push({ item: p.item, status: "atencao", atual: c.v, nosso: p.nosso, pagina: p.pagina,
        detalhe: `O catálogo comunitário indica ${c.v} (publicado ${brData(c.data)}), À FRENTE da nossa ${p.nosso}. Confirme no link oficial e me avise para revisar o gerador/arquivo exportado.` });
    } else if (c) {
      itens.push({ item: p.item, status: "manual", atual: `catálogo: ${c.v} (${brData(c.data)})`, nosso: p.nosso, pagina: p.pagina,
        detalhe: `Catálogo comunitário (NÃO oficial) indica ${c.v}, igual à nossa. É só uma dica — não garanto que esteja sempre em dia. Para ter certeza, confira no DATASUS pelo link.` });
    } else {
      itens.push({ item: p.item, status: "manual", atual: null, nosso: p.nosso, pagina: p.pagina,
        detalhe: `Sem fonte automática (DATASUS bloqueia acesso de servidor). Abra o link e confira se a versão passou da ${p.nosso}.` });
    }
  }

  // 3) SCNES — refresh da lista de profissionais dos CNES em uso (homologação)
  try {
    const { data: e1 } = await SERVICE.from("estabelecimentos").select("cnes");
    const { data: e2 } = await SERVICE.from("profissionais").select("cnes");
    const cnesSet = [...new Set([...(e1 ?? []), ...(e2 ?? [])].map((r) => (r as { cnes: string }).cnes).filter((c) => /^\d{7}$/.test(c)))];
    const sc = Deno.env.get("SCNES_SYNC_SECRET");
    let ok = 0, falhou = 0;
    if (sc) {
      for (const cnes of cnesSet) {
        try {
          const r = await withTimeout(fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/cnes-profissionais`, {
            method: "POST", headers: { "Content-Type": "application/json", "x-scnes-secret": sc }, body: JSON.stringify({ cnes, forcar: true }),
          }), 30000);
          if (r.ok) ok++; else falhou++;
        } catch { falhou++; }
      }
    }
    const dataBR = new Date().toLocaleDateString("pt-BR");
    itens.push({ item: "SCNES (profissionais)", status: falhou === 0 && ok > 0 ? "ok" : ok > 0 ? "atencao" : "nao_verificado",
      atual: `buscado em ${dataBR}`, nosso: `${ok}/${cnesSet.length} unidades`,
      detalhe: !sc ? "SCNES_SYNC_SECRET não configurado." : `Retrato AO VIVO do SCNES (homologação), buscado agora — ${ok} de ${cnesSet.length} unidades${falhou ? `, ${falhou} falharam (SCNES homolog instável)` : ""}. Não é versionado por competência: traz o que o SCNES retorna no momento (não é um "mês" como o SIGTAP).` });
  } catch (_e) {
    itens.push({ item: "SCNES (profissionais)", status: "nao_verificado", atual: null, nosso: null, detalhe: "Falha ao atualizar o SCNES." });
  }

  // 4) "Conflito no SIA" com os arquivos exportados = depende da conferência manual dos
  // programas acima. Lembrete de verificar o que de fato impacta os nossos geradores.
  itens.push({ item: "Conflito com arquivos exportados", status: "manual", atual: "verificar", nosso: null,
    detalhe: "Confira as versões acima (BPA/FPO/RAAS/APAC). Se alguma mudou, os arquivos que EXPORTAMOS (BPA Magnético .txt e FPO .IMP) podem precisar de ajuste — me avise para revisar os geradores." });

  return json({ geradoEm: new Date().toISOString(), itens });
});
