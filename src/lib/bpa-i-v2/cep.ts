import { MUNICIPIOS_IBGE } from "@/lib/bpa-i-v2/municipios-ibge";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export interface InfoCep {
  ibge: string | null;
  cidadeUf: string | null; // ex.: "Ruy Barbosa - BA", p/ popover informativo
}

// Descobre o município (código IBGE + nome) a que um CEP pertence, p/ cruzar com o
// campo "Cód. IBGE Município" já preenchido na ficha e mostrar um popover informativo
// (mesmo espírito do popover do Código do Procedimento). Não existe base oficial
// gratuita completa de CEPs (Correios vende o DNE) — por isso consulta ao vivo:
// 1) ViaCEP (devolve o código IBGE direto, é a fonte mais confiável);
// 2) se falhar, BrasilAPI (só devolve cidade/UF em texto) + resolve o código batendo
//    contra a nossa própria tabela oficial do IBGE.
// Nunca lança — CEP não encontrado/erro vira { ibge: null, cidadeUf: null }.
export async function buscarInfoCep(cep: string): Promise<InfoCep> {
  const vazio: InfoCep = { ibge: null, cidadeUf: null };
  if (cep.length !== 8) return vazio;

  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (r.ok) {
      const d = await r.json();
      if (!d.erro && d.ibge) {
        return { ibge: String(d.ibge), cidadeUf: d.localidade && d.uf ? `${d.localidade} - ${d.uf}` : null };
      }
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
        if (achado) return { ibge: achado.code, cidadeUf: achado.label };
      }
    }
  } catch { /* sem sorte nas duas fontes */ }

  return vazio;
}
