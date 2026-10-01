// Edge Function: sigtap-sync
// Automatiza a atualização mensal das tabelas SIGTAP a partir do DATASUS.
//
// FLUXO: lista o FTP do DATASUS -> acha o TabelaUnificada_AAAAMM mais recente -> se essa
// competência AINDA NÃO está carregada, baixa o .zip, descompacta, parseia os arquivos de
// largura fixa e faz upsert nas tabelas (idêntico ao import manual validado) -> grava
// sigtap_competencias -> aplica a RETENÇÃO (mantém só as 4 últimas competências).
//
// ⚠️ IMPORTANTE (restrição real): o DATASUS NÃO serve por HTTP(S) — só FTP. Edge Functions
// (Deno) não têm cliente FTP nativo, então aqui há um cliente FTP mínimo (modo passivo) por
// TCP (Deno.connect). A parte pesada roda em EdgeRuntime.waitUntil (resposta rápida; trabalho
// continua em background). Se o runtime/limite de tempo da sua conta não aguentar o volume
// (~295 mil linhas/competência), use o fallback (GitHub Action rodando o mesmo ETL) — ver o
// README ao lado. Proteção: exige o header `x-sigtap-secret` == env SIGTAP_SYNC_SECRET.
//
// Import via npm: (não esm.sh — pode falhar no BOOT do edge runtime).
import { createClient } from "npm:@supabase/supabase-js@2";
import { unzipSync } from "npm:fflate@0.8.2";

const FTP_HOST = "ftp2.datasus.gov.br";
const FTP_DIR = "/public/sistemas/tup/downloads";
const RETER = 4; // competências a manter
const latin1 = new TextDecoder("latin1");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-sigtap-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- Cliente FTP mínimo (modo passivo, binário) ----------
async function ftpConnect() {
  const conn = await Deno.connect({ hostname: FTP_HOST, port: 21 });
  const reader = conn.readable.getReader();
  let buf = new Uint8Array(0);
  const readLine = async (): Promise<string> => {
    // lê até uma resposta completa "NNN <texto>\r\n" (ignora linhas de continuação "NNN-")
    for (;;) {
      const txt = latin1.decode(buf);
      const m = txt.match(/^(\d{3}) [^\r\n]*\r\n/m);
      if (m) {
        const line = txt.slice(0, m.index! + m[0].length);
        buf = buf.slice(new TextEncoder().encode(line).length);
        return line.trim();
      }
      const { value, done } = await reader.read();
      if (done) return latin1.decode(buf).trim();
      const nb = new Uint8Array(buf.length + value.length);
      nb.set(buf); nb.set(value, buf.length); buf = nb;
    }
  };
  const send = async (cmd: string) => { await conn.write(new TextEncoder().encode(cmd + "\r\n")); };
  await readLine(); // 220 banner
  await send("USER anonymous"); await readLine();
  await send("PASS anonymous@"); await readLine();
  await send("TYPE I"); await readLine();
  return { conn, reader, readLine, send };
}

async function ftpList(ftp: Awaited<ReturnType<typeof ftpConnect>>, dir: string): Promise<string> {
  const { ip, port } = await pasv(ftp);
  const data = await Deno.connect({ hostname: ip, port });
  await ftp.send(`LIST ${dir}`); await ftp.readLine(); // 150
  const bytes = await readAll(data);
  await ftp.readLine(); // 226
  return latin1.decode(bytes);
}

async function ftpGet(ftp: Awaited<ReturnType<typeof ftpConnect>>, path: string): Promise<Uint8Array> {
  const { ip, port } = await pasv(ftp);
  const data = await Deno.connect({ hostname: ip, port });
  await ftp.send(`RETR ${path}`); await ftp.readLine(); // 150
  const bytes = await readAll(data);
  await ftp.readLine(); // 226
  return bytes;
}

async function pasv(ftp: Awaited<ReturnType<typeof ftpConnect>>) {
  await ftp.send("PASV");
  const line = await ftp.readLine(); // 227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)
  const m = line.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
  if (!m) throw new Error("PASV falhou: " + line);
  return { ip: `${m[1]}.${m[2]}.${m[3]}.${m[4]}`, port: (+m[5]) * 256 + (+m[6]) };
}

async function readAll(conn: Deno.Conn): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const r = conn.readable.getReader();
  for (;;) { const { value, done } = await r.read(); if (done) break; chunks.push(value); }
  let n = 0; for (const c of chunks) n += c.length;
  const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// ---------- parsing (mesmos offsets do import manual validado) ----------
const field = (ln: string, a: number, b: number) => ln.slice(a, b).trim();
const sexoOk = (c: string) => (["M", "F", "I", "N"].includes(c.trim().toUpperCase()) ? c.trim().toUpperCase() : "N");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-sigtap-secret") !== Deno.env.get("SIGTAP_SYNC_SECRET"))
    return json({ erro: "não autorizado" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const forcar = new URL(req.url).searchParams.get("forcar") === "1";

  try {
    const ftp = await ftpConnect();
    const listing = await ftpList(ftp, FTP_DIR);
    const zips = [...listing.matchAll(/TabelaUnificada_(\d{6})_[^\s]*\.zip/g)]
      .map((m) => ({ nome: m[0], comp: m[1] })).sort((a, b) => b.comp.localeCompare(a.comp));
    if (!zips.length) return json({ erro: "nenhum TabelaUnificada no FTP" }, 502);
    const alvo = zips[0];

    const { data: ja } = await supabase.from("sigtap_competencias").select("competencia").eq("competencia", alvo.comp);
    if (ja?.length && !forcar) return json({ status: "ja-atualizado", competencia: alvo.comp });

    // trabalho pesado em background; resposta imediata.
    const tarefa = (async () => {
      const zip = await ftpGet(ftp, `${FTP_DIR}/${alvo.nome}`);
      const files = unzipSync(zip);
      const lines = (n: string) => latin1.decode(files[n]).split(/\r?\n/).filter((l) => l.length > 5);
      const comp = alvo.comp;
      const up = async (tabela: string, rows: Record<string, unknown>[], onConflict: string) => {
        for (let i = 0; i < rows.length; i += 1000)
          await supabase.from(tabela).upsert(rows.slice(i, i + 1000), { onConflict, ignoreDuplicates: true });
      };

      // referências (snapshot atual)
      await up("ocupacoes_sigtap",
        dedupe(lines("tb_ocupacao.txt").map((l) => ({ codigo: field(l, 0, 6), nome: field(l, 6, 156) })), "codigo"), "codigo");
      await up("cid_sigtap",
        dedupe(lines("tb_cid.txt").map((l) => ({ codigo: field(l, 0, 4), nome: field(l, 4, 104), sexo: sexoOk(l.slice(105, 106)) })), "codigo"), "codigo");
      await up("servicos_sigtap",
        dedupe(lines("tb_servico.txt").map((l) => ({ codigo: field(l, 0, 3), nome: field(l, 3, 123) })), "codigo"), "codigo");
      await up("servico_classificacao_sigtap",
        dedupe(lines("tb_servico_classificacao.txt").map((l) => ({ servico: field(l, 0, 3), classificacao: field(l, 3, 6), nome: field(l, 6, 156) })), "servico,classificacao"), "servico,classificacao");

      // versionadas por competência
      const procs = lines("tb_procedimento.txt").map((l) => ({
        codigo: field(l, 0, 10), nome: field(l, 10, 260), sexo: sexoOk(l.slice(261, 262)),
        qt_maxima_execucao: +field(l, 262, 266) || 0,
        idade_minima_meses: +field(l, 274, 278) || 0, idade_maxima_meses: +field(l, 278, 282) || 0,
        competencia: comp,
      }));
      await up("procedimentos_sigtap", procs, "codigo,competencia");
      await up("procedimento_ocupacao",
        lines("rl_procedimento_ocupacao.txt").map((l) => ({ procedimento: field(l, 0, 10), cbo: field(l, 10, 16), competencia: comp })), "procedimento,cbo,competencia");
      const cids = lines("rl_procedimento_cid.txt").map((l) => ({ procedimento: field(l, 0, 10), cid: field(l, 10, 14), principal: l.slice(14, 15).trim().toUpperCase() === "S", competencia: comp }));
      await up("procedimento_cid", cids, "procedimento,cid,competencia");
      const servs = lines("rl_procedimento_servico.txt").map((l) => ({ procedimento: field(l, 0, 10), servico: field(l, 10, 13), classificacao: field(l, 13, 16), competencia: comp }));
      await up("procedimento_servico", servs, "procedimento,servico,classificacao,competencia");

      await supabase.from("sigtap_competencias").upsert({
        competencia: comp, importado_em: new Date().toISOString(),
        qtd_procedimentos: procs.length, qtd_relacoes_ocupacao: lines("rl_procedimento_ocupacao.txt").length,
        qtd_relacoes_cid: cids.length, qtd_relacoes_servico: servs.length,
      }, { onConflict: "competencia" });

      // RETENÇÃO: mantém só as RETER últimas competências
      const { data: todas } = await supabase.from("sigtap_competencias").select("competencia").order("competencia", { ascending: false });
      const velhas = (todas ?? []).slice(RETER).map((r) => r.competencia);
      for (const c of velhas) {
        for (const t of ["procedimentos_sigtap", "procedimento_ocupacao", "procedimento_cid", "procedimento_servico", "sigtap_competencias"])
          await supabase.from(t).delete().eq("competencia", c);
      }
      console.log(`[sigtap-sync] ${comp} OK: ${procs.length} proc; retenção removeu ${velhas.join(",") || "nada"}`);
    })();

    // @ts-ignore EdgeRuntime existe no runtime do Supabase
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(tarefa); else await tarefa;
    return json({ status: "importando", competencia: alvo.comp });
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});

function dedupe<T extends Record<string, unknown>>(rows: T[], keys: string) {
  const ks = keys.split(","); const seen = new Set<string>(); const out: T[] = [];
  for (const r of rows) { const k = ks.map((x) => r[x]).join("|"); if (r[ks[0]] && !seen.has(k)) { seen.add(k); out.push(r); } }
  return out;
}
