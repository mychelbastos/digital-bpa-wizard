// Mapas e regras da tela de Administração (movidos do admin.tsx no redesign de 11/2026).
import type { PermissaoCat } from "@/lib/admin";

export const LABEL_CARGO: Record<string, string> = {
  digitador: "Digitador",
  profissional_saude: "Profissional de Saúde",
  coordenador: "Coordenador",
  operador_remessa: "Operador de remessa",
  secretario_municipal: "Secretário municipal",
};
export const nomeCargo = (p: string) => LABEL_CARGO[p] ?? p;

// Descrição curta do que o cargo FAZ (o nome diz o que ele É). Ex.: Coordenador "só visualiza".
export const DESC_CARGO: Record<string, string> = {
  coordenador: "só visualiza",
};

// Escopo de cada cargo. O "Dono do sistema" (super-admin) não é um papel de papel_permissoes —
// é Global e não atribuível pela tela.
export type Escopo = "cnes" | "organizacao" | "global";
export const ESCOPO_CARGO: Record<string, Escopo> = {
  digitador: "cnes",
  profissional_saude: "cnes",
  coordenador: "cnes",
  operador_remessa: "cnes",
  secretario_municipal: "organizacao",
};
export const LABEL_ESCOPO: Record<Escopo, string> = {
  cnes: "CNES",
  organizacao: "Organização",
  global: "Global",
};
export const escopoDoCargo = (p: string): Escopo => ESCOPO_CARGO[p] ?? "cnes";

// Rótulos legíveis das permissões (o código cru vai no tooltip, p/ suporte). Fallback: descrição
// do banco e, na falta dela, o próprio código — nunca fica em branco.
export const LABEL_PERM: Record<string, string> = {
  gerir_pacientes: "Cadastrar/editar pacientes",
  gerir_tfd: "Registrar e gerir TFD",
  criar_ficha: "Criar ficha",
  editar_ficha_propria: "Editar a própria ficha",
  conferir_ficha: "Conferir/assinar ficha",
  ver_fichas_da_unidade: "Ver fichas da unidade",
  gerar_producao: "Fechar e gerar produção",
  reabrir_producao: "Reabrir produção",
  retificar_ficha_exportada: "Retificar ficha exportada",
  gerenciar_vinculos: "Gerenciar usuários e acessos",
  ver_fichas_do_municipio: "Ver fichas do município",
};
export const nomePerm = (p: PermissaoCat) => LABEL_PERM[p.codigo] ?? p.descricao ?? p.codigo;
// Rótulo curto dentro do grupo (tira o prefixo "Menu · " / "Relatório · ").
export const rotuloCurto = (p: PermissaoCat) =>
  nomePerm(p)
    .replace(/^Menu\s·\s/, "")
    .replace(/^Relatório\s·\s/, "");

// Grupo de uma permissão de ORGANIZAÇÃO: menu, relatório ou gestão/acessos.
export const MENU_PERMS = new Set([
  "ver_dashboard",
  "ver_minhas_fichas",
  "ver_relatorios",
  "ver_fpo",
  "ver_exportar",
  "ver_importar",
  "ver_formularios",
]);
export function grupoOrg(codigo: string): "menu" | "relatorio" | "gestao" {
  if (codigo.startsWith("emitir_rel_")) return "relatorio";
  if (MENU_PERMS.has(codigo)) return "menu";
  return "gestao";
}

// Estado de uma permissão numa pessoa, derivado de quantos vínculos a têm vs. o total.
export type EstadoPerm = {
  ativa: boolean; // todos os vínculos têm
  parcial: boolean; // alguns têm
  padrao: boolean; // faz parte do pacote do cargo
  override: boolean; // difere do padrão do cargo (ou é parcial)
  quantos?: number; // vínculos que têm (p/ "Parcial · X de Y")
  total?: number;
};

export function estadoPermissao(
  codigo: string,
  perms: Record<string, number>,
  total: number,
  defaults: Set<string>,
): EstadoPerm {
  const c = perms[codigo] ?? 0;
  const ativa = total > 0 && c >= total;
  const parcial = c > 0 && c < total;
  const padrao = defaults.has(codigo);
  const override = parcial || ativa !== padrao;
  return { ativa, parcial, padrao, override, quantos: c, total };
}

// Alvo de um clique no Switch: o que o usuário quer VER depois; igual ao padrão → remove override.
export function alvoDoClique(est: EstadoPerm): boolean | null {
  const desejado = est.parcial ? true : !est.ativa;
  return desejado === est.padrao ? null : desejado;
}

export const iniciais = (texto: string) => {
  const base = (texto || "")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();
  const partes = base.split(/\s+/).filter((p) => p && !/^(de|da|do|dos|das|e|—|-)$/i.test(p));
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
};

export const fmtDataHora = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
};

// "SECRETARIA MUNICIPAL DE SAUDE DE RUY BARBOSA" → "RUY BARBOSA" (a org não guarda o nome do
// município; o IBGE fica ao lado). Sem prefixo conhecido, devolve o nome inteiro.
export const municipioDoNome = (nome: string) =>
  nome
    .replace(
      /^(FMS|FUNDO MUNICIPAL DE SA[UÚ]DE|SECRETARIA MUNICIPAL DE SA[UÚ]DE|PREFEITURA MUNICIPAL)\s*(DE|DO|DA|—|-)?\s*/i,
      "",
    )
    .trim() || nome;
