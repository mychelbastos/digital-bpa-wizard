// Configuração do estabelecimento (dados do cabeçalho do arquivo magnético BPA).
// São dados fixos do prestador/município, preenchidos uma vez. Salvo no localStorage
// (e, quando logado, também no Supabase junto da ficha — ver fichas.ts).

export interface ConfigOrgao {
  orgaoOrigemNome: string; // nome do órgão de origem (30)
  sigla: string; // sigla do órgão de origem (6)
  cgcCpf: string; // CNPJ/CPF do prestador (14 dígitos)
  orgaoDestinoNome: string; // nome do órgão destino (40)
  destinoTipo: "M" | "E"; // Municipal / Estadual (indicador destino, 1 char no header)
  versao: string; // versão do layout (6 no header) — v04.11 observada = "D04.11"
}

const KEY = "bpa-i-v2-config";

export const configVazia = (): ConfigOrgao => ({
  orgaoOrigemNome: "",
  sigla: "",
  cgcCpf: "",
  orgaoDestinoNome: "",
  destinoTipo: "M",
  versao: "D04.11",
});

export function loadConfig(): ConfigOrgao {
  if (typeof window === "undefined") return configVazia();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return configVazia();
    return { ...configVazia(), ...(JSON.parse(raw) as Partial<ConfigOrgao>) };
  } catch {
    return configVazia();
  }
}

export function saveConfig(c: ConfigOrgao): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* noop */
  }
}

// Mínimo obrigatório para gerar o arquivo (o header exige esses campos).
export function configCompleta(c: ConfigOrgao): boolean {
  return Boolean(
    c.orgaoOrigemNome.trim() &&
      c.sigla.trim() &&
      c.cgcCpf.replace(/\D/g, "") &&
      c.orgaoDestinoNome.trim() &&
      (c.destinoTipo === "M" || c.destinoTipo === "E"),
  );
}
