// Edge Function CNES:
//  - { cnes }        -> lista de profissionais do estabelecimento (Nome/CNS). SOAP 1.1.
//  - { cns, cnes }   -> CBO(s) do profissional NAQUELE estabelecimento (vínculo). SOAP 1.2.
// O CBO depende do vínculo (CNS+CNES): um profissional pode ter CBOs diferentes por
// estabelecimento e mais de um no mesmo. Fonte: VinculacaoProfissionalService (pareia
// CBO ao estabelecimento; exige varrer os tipos de vínculo 1..9). Cache nas tabelas
// `profissionais` (lista) e `profissional_vinculos` (CBO por CNS+CNES).
// Endpoint/credencial por env vars (homolog agora; produção = trocar as envs).
//
// LGPD: a base (mesmo em HOMOLOGAÇÃO) retorna PII real. Por isso: (a) NÃO logamos as
// respostas da API (nome/CNS) em lugar nenhum além da tabela `profissionais`; (b) NÃO
// guardamos o CPF do profissional — não é usado em nada. Proveniência: gravamos o
// `ambiente` (homolog/producao) derivado da URL, p/ revalidar quando virar produção.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SOAP_URL = Deno.env.get("CNES_SOAP_URL")!; // .../ProfissionalSaudeService/v1r0
const SOAP_USER = Deno.env.get("CNES_SOAP_USER")!;
const SOAP_PASS = Deno.env.get("CNES_SOAP_PASS")!;
const TTL_MS = Number(Deno.env.get("CNES_CACHE_TTL_DIAS") ?? "7") * 86_400_000;
// O serviço de vínculos é outro path no mesmo host.
const VINC_URL = SOAP_URL.replace("ProfissionalSaudeService", "VinculacaoProfissionalService");
// Proveniência: derivada da URL (host de homologação do DATASUS = servicoshm).
const AMBIENTE = SOAP_URL.includes("servicoshm") ? "homolog" : "producao";
const NONE = "__NONE__"; // sentinela: consultado e sem vínculo

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const wsseHeader = (open: string, close: string) =>
  `${open}<wsse:Security ${close}mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><wsse:UsernameToken><wsse:Username>${SOAP_USER}</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${SOAP_PASS}</wsse:Password></wsse:UsernameToken></wsse:Security>`;

// --- Lista de profissionais (SOAP 1.1) ---
const envelopeLista = (cnes: string) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:prof="http://servicos.saude.gov.br/cnes/v1r0/profissionalsaudeservice" xmlns:fil="http://servicos.saude.gov.br/wsdl/mensageria/v1r0/filtropesquisaestabelecimentosaude" xmlns:cod="http://servicos.saude.gov.br/schema/cnes/v1r0/codigocnes">
<soapenv:Header>${wsseHeader("", "soapenv:")}</soapenv:Header>
<soapenv:Body><prof:requestConsultarProfissionaisSaude><fil:FiltroPesquisaEstabelecimentoSaude><cod:CodigoCNES><cod:codigo>${cnes}</cod:codigo></cod:CodigoCNES></fil:FiltroPesquisaEstabelecimentoSaude></prof:requestConsultarProfissionaisSaude></soapenv:Body></soapenv:Envelope>`;

// --- Vínculo (SOAP 1.2) por CNS + CNES + tipo de vínculo (1..9) ---
const envelopeVinculo = (cns: string, cnes: string, tipo: string) => `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope" xmlns:vin="http://servicos.saude.gov.br/cnes/v1r0/vinculacaoprofissionalservice" xmlns:fil="http://servicos.saude.gov.br/wsdl/mensageria/v1r0/filtropesquisavinculacao" xmlns:cns="http://servicos.saude.gov.br/schema/cadsus/v5r0/cns" xmlns:cod="http://servicos.saude.gov.br/schema/cnes/v1r0/codigocnes">
<env:Header>${wsseHeader("", "env:")}</env:Header>
<env:Body><vin:RequestVinculacao><fil:FiltroPesquisaVinculacao><fil:IdentificacaoProfissional><fil:cns><cns:numeroCNS>${cns}</cns:numeroCNS></fil:cns></fil:IdentificacaoProfissional><fil:IdentificacaoEstabelecimento><fil:cnes><cod:codigo>${cnes}</cod:codigo></fil:cnes></fil:IdentificacaoEstabelecimento><fil:IdentificacaoVinculacao><fil:tipoVinculacao>${tipo}</fil:tipoVinculacao></fil:IdentificacaoVinculacao></fil:FiltroPesquisaVinculacao></vin:RequestVinculacao></env:Body></env:Envelope>`;

// Só Nome+CNS: o CPF do profissional não é usado em nada e não é guardado (LGPD).
function parseProfs(xml: string) {
  const out: { cns: string; nome: string }[] = [];
  for (const b of xml.match(/<[a-zA-Z0-9]+:ProfissionalSaude\b[\s\S]*?<\/[a-zA-Z0-9]+:ProfissionalSaude>/g) ?? []) {
    const nome = b.match(/:Nome[^>]*>([^<]+)<\/[a-zA-Z0-9]+:Nome>/)?.[1]?.trim();
    const cns = b.match(/numeroCNS[^>]*>([^<]+)</)?.[1]?.trim();
    if (cns && nome) out.push({ cns, nome });
  }
  return out;
}
function parseCbos(xml: string): { codigo: string; descricao: string }[] {
  if (xml.includes("NO_RESULT")) return [];
  const cods = [...xml.matchAll(/codigoCBO[^>]*>([^<]+)</g)].map((m) => m[1].trim());
  const descs = [...xml.matchAll(/descricaoCBO[^>]*>([^<]+)</g)].map((m) => m[1].trim());
  return cods.map((codigo, i) => ({ codigo, descricao: descs[i] ?? "" }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));

    // ===== Modo CBO do vínculo (CNS + CNES) =====
    if (body.cns && body.cnes) {
      const cns = String(body.cns), cnes = String(body.cnes);
      if (!/^[0-9]{15}$/.test(cns) || !/^[0-9]{7}$/.test(cnes)) return json({ erro: "CNS/CNES inválidos" }, 400);

      const { data: cache } = await supabase
        .from("profissional_vinculos").select("cbo_codigo, cbo_descricao, atualizado_em")
        .eq("cns", cns).eq("cnes", cnes);
      if (cache && cache.length && Date.now() - new Date(cache[0].atualizado_em).getTime() < TTL_MS) {
        const cbos = cache.filter((r) => r.cbo_codigo !== NONE).map((r) => ({ codigo: r.cbo_codigo, descricao: r.cbo_descricao }));
        return json({ fonte: "cache", cbos });
      }

      // Varre os 9 tipos de vínculo em paralelo e agrega CBOs distintos.
      const tipos = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
      const map = new Map<string, string>();
      try {
        const respostas = await Promise.all(tipos.map((t) =>
          fetch(VINC_URL, { method: "POST", headers: { "Content-Type": "application/soap+xml;charset=UTF-8" }, body: envelopeVinculo(cns, cnes, t) })
            .then((r) => r.text()).catch(() => "")));
        for (const xml of respostas) for (const c of parseCbos(xml)) map.set(c.codigo, c.descricao);
      } catch (e) {
        return json({ aviso: `falha: ${String(e)}`, cbos: [] });
      }
      const cbos = [...map].map(([codigo, descricao]) => ({ codigo, descricao }));
      // Atualiza o cache (rows reais, ou sentinela se vazio).
      await supabase.from("profissional_vinculos").delete().eq("cns", cns).eq("cnes", cnes);
      const rows = cbos.length
        ? cbos.map((c) => ({ cns, cnes, cbo_codigo: c.codigo, cbo_descricao: c.descricao, atualizado_em: new Date().toISOString() }))
        : [{ cns, cnes, cbo_codigo: NONE, cbo_descricao: null, atualizado_em: new Date().toISOString() }];
      await supabase.from("profissional_vinculos").insert(rows);
      return json({ fonte: "api", cbos });
    }

    // ===== Modo lista (CNES) =====
    const cnes = body.cnes;
    if (!/^[0-9]{7}$/.test(cnes ?? "")) return json({ erro: "CNES inválido (7 dígitos)" }, 400);
    const forcar = body.forcar === true; // ignora o TTL e reconsulta a API
    const { data: recente } = await supabase.from("profissionais").select("atualizado_em").eq("cnes", cnes).order("atualizado_em", { ascending: false }).limit(1);
    const countCache = async () => (await supabase.from("profissionais").select("*", { count: "exact", head: true }).eq("cnes", cnes)).count ?? 0;
    if (!forcar && recente?.[0] && Date.now() - new Date(recente[0].atualizado_em).getTime() < TTL_MS) {
      return json({ fonte: "cache", total: await countCache() });
    }
    let xml: string;
    try {
      const resp = await fetch(SOAP_URL, { method: "POST", headers: { "Content-Type": "text/xml;charset=UTF-8", "SOAPAction": '""' }, body: envelopeLista(cnes) });
      if (!resp.ok) return json({ fonte: "cache-antigo", total: await countCache(), aviso: `API HTTP ${resp.status}` });
      xml = await resp.text();
    } catch (e) {
      return json({ fonte: "cache-antigo", total: await countCache(), aviso: `rede: ${String(e)}` });
    }
    const profs = parseProfs(xml);
    if (profs.length) {
      const rows = profs.map((p) => ({ cnes, cns: p.cns, nome: p.nome, ambiente: AMBIENTE, atualizado_em: new Date().toISOString() }));
      const { error } = await supabase.from("profissionais").upsert(rows, { onConflict: "cnes,cns" });
      if (error) return json({ erro: `upsert: ${error.message}`, total: profs.length }, 500);
    }
    return json({ fonte: "api", total: profs.length });
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
