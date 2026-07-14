// Configuração do estabelecimento (dados do cabeçalho do arquivo magnético BPA).
// São dados fixos do prestador/município. Desde 2026-07 a FONTE DA VERDADE é a
// ORGANIZAÇÃO (tabela organizacoes, editada em Administração); o localStorage é só um
// espelho para o gerador (loadConfig, síncrono) — ver sincronizarConfigDaOrg().

import { supabase } from "@/lib/supabase";

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

// Busca a config do cabeçalho da ORGANIZAÇÃO do usuário (fonte da verdade) e a espelha no
// localStorage para o gerador usar. Só sobrescreve o espelho se a org tiver config completa
// — assim, durante a transição, quem já tinha config local não a perde. Null-safe.
export async function sincronizarConfigDaOrg(): Promise<ConfigOrgao | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("org_config_do_usuario");
    const rows = (data ?? []) as Record<string, string | null>[];
    if (error || rows.length === 0) return null;
    const r = rows[0];
    const cfg: ConfigOrgao = {
      orgaoOrigemNome: r.cab_orgao_origem ?? "",
      sigla: r.cab_sigla ?? "",
      cgcCpf: r.cab_cgc_cpf ?? "",
      orgaoDestinoNome: r.cab_orgao_destino ?? "",
      destinoTipo: r.cab_destino_tipo === "E" ? "E" : "M",
      versao: r.cab_versao || "D04.11",
    };
    if (configCompleta(cfg)) saveConfig(cfg);
    return cfg;
  } catch {
    return null;
  }
}
