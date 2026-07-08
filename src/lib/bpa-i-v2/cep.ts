import { MUNICIPIOS_IBGE } from "@/lib/bpa-i-v2/municipios-ibge";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Descobre o código IBGE do município a que um CEP pertence, p/ cruzar com o campo
// "Cód. IBGE Município" já preenchido na ficha. Não existe base oficial gratuita
// completa de CEPs (Correios vende o DNE) — por isso consulta ao vivo:
// 1) ViaCEP (devolve o código IBGE direto, é a fonte mais confiável);
// 2) se falhar, BrasilAPI (só devolve cidade/UF em texto) + resolve o código batendo
//    contra a nossa própria tabela oficial do IBGE.
// null = CEP não encontrado ou erro — nunca lança (não bloqueia o formulário sozinho).
export async function buscarIbgePorCep(cep: string): Promise<string | null> {
  if (cep.length !== 8) return null;

  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (r.ok) {
      const d = await r.json();
      if (!d.erro && d.ibge) return String(d.ibge);
    }
  } catch { /* tenta o fallback */ }

  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    if (r.ok) {
      const d = await r.json();
      if (d.city && d.state) {
        const cidade = norm(d.city);
        const uf = String(d.state).toUpperCase();
        const achado = MUNICIPIOS_IBGE.find((m) => m.label.toUpperCase().endsWith(`- ${uf}`) && norm(m.label.slice(0, m.label.lastIndexOf("-"))) === cidade);
        if (achado) return achado.code;
      }
    }
  } catch { /* sem sorte nas duas fontes */ }

  return null;
}
