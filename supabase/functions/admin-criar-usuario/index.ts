// Edge Function: criar conta de usuário pelo painel de administração, SEM verificação por
// e-mail (email_confirm: true) — o admin define a senha inicial. Gated: o CHAMADOR precisa
// ter 'gerenciar_vinculos' no CNES informado. A criação usa a service-role (injetada pelo
// Supabase) via a Admin API do GoTrue — não montamos linhas de auth.users na mão. O 1º
// vínculo é criado pelo RPC admin_vincular_unidade (mesmas travas: regra do digitador etc.).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ erro: "Sem autenticação." }, 401);

    const { email, senha, cnes, papel, nome, cns } = await req.json().catch(() => ({}));
    const emailOk = typeof email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (!emailOk) return json({ erro: "E-mail inválido." }, 400);
    if (typeof senha !== "string" || senha.length < 8)
      return json({ erro: "A senha deve ter ao menos 8 caracteres." }, 400);
    if (!/^[0-9]{7}$/.test(cnes ?? "")) return json({ erro: "CNES inválido." }, 400);
    if (typeof papel !== "string" || !papel) return json({ erro: "Cargo obrigatório." }, 400);
    // nome + CNS do profissional (unidade de cadastro/base). CNS obrigatório (15 díg.).
    const nomeStr = typeof nome === "string" ? nome.trim() : "";
    const cnsStr = typeof cns === "string" ? cns.replace(/\D/g, "") : "";
    if (!nomeStr) return json({ erro: "Informe o nome do profissional." }, 400);
    if (!/^[0-9]{15}$/.test(cnsStr)) return json({ erro: "CNS do profissional inválido (15 dígitos)." }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Permissão do CHAMADOR: precisa de 'gerenciar_vinculos' NESTE CNES (contexto do JWT dele).
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await caller.auth.getUser();
    if (!u?.user) return json({ erro: "Sessão inválida." }, 401);
    const { data: permitido, error: e1 } = await caller.rpc("cnes_com_permissao", {
      _perm: "gerenciar_vinculos",
    });
    if (e1) return json({ erro: e1.message }, 500);
    const lista = ((permitido ?? []) as { cnes: string }[]).map((r) => r.cnes);
    if (!lista.includes(cnes))
      return json({ erro: "Você não tem 'gerenciar vínculos' nesta unidade." }, 403);

    // 2) Organização do CNES (para o vínculo).
    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: estab, error: e2 } = await admin
      .from("estabelecimentos")
      .select("organizacao_id")
      .eq("cnes", cnes)
      .single();
    if (e2 || !estab?.organizacao_id) return json({ erro: "CNES sem organização." }, 400);

    // 2b) CRIVO: o profissional (CNS) precisa constar no cadastro SCNES DESTE CNES. Se o CNS
    // não estiver no cache local, dispara a sincronização (mesma Edge Function) e reconsulta.
    let nomeFinal = nomeStr;
    const buscaProf = async () =>
      (await admin.from("profissionais").select("nome").eq("cnes", cnes).eq("cns", cnsStr).limit(1)).data as { nome: string }[] | null;
    let prof = await buscaProf();
    if (!prof || prof.length === 0) {
      try { await admin.functions.invoke("cnes-profissionais", { body: { cnes } }); } catch { /* best-effort */ }
      prof = await buscaProf();
    }
    if (!prof || prof.length === 0)
      return json({ erro: "O profissional (CNS) não confere com o cadastro SCNES desta unidade." }, 400);
    nomeFinal = prof[0].nome || nomeStr; // usa o nome oficial do SCNES

    // 3) Cria o usuário (Admin API). email_confirm: true = já ativo, sem e-mail de confirmação.
    // Guarda nome+CNS no perfil (user_metadata) — usados como assinatura/identidade.
    const { data: novo, error: e3 } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome: nomeFinal, cns: cnsStr, cnes_base: cnes },
    });
    if (e3) return json({ erro: e3.message }, 400);
    const userId = novo.user?.id;
    if (!userId) return json({ erro: "Falha ao criar usuário." }, 500);

    // 4) Primeiro vínculo — pelo RPC validado (roda no contexto do chamador; grava concedido_por).
    const { error: e4 } = await caller.rpc("admin_vincular_unidade", {
      _user_id: userId,
      _org: estab.organizacao_id,
      _cnes: cnes,
      _papel: papel,
    });
    if (e4)
      return json(
        { erro: `Conta criada, mas falha ao vincular: ${e4.message}`, user_id: userId },
        500,
      );

    return json({ user_id: userId });
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
