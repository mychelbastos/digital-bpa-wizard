// Paleta de destaque dos relatórios (PDF). Cada organização pode escolher uma cor
// (config no admin); o padrão do sistema é verde. A partir da cor-base derivamos:
//   accent      — banda do cabeçalho / cabeçalho das tabelas (texto branco por cima)
//   accentClaro — fundo suave das linhas de total (base clareada ~90% com branco)
export type RGB = [number, number, number];

export const COR_PADRAO: RGB = [16, 122, 87]; // verde padrão do sistema

export function hexToRgb(hex?: string | null): RGB | null {
  if (!hex) return null;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function clarear(rgb: RGB, fator = 0.9): RGB {
  return rgb.map((c) => Math.round(c + (255 - c) * fator)) as unknown as RGB;
}

// Recebe a cor da org (hex ou RGB) e devolve accent + accentClaro. Sem cor válida → verde padrão.
export function paletaRelatorio(cor?: string | RGB | null): { accent: RGB; accentClaro: RGB } {
  const base = Array.isArray(cor) ? cor : (hexToRgb(cor) ?? COR_PADRAO);
  return { accent: base, accentClaro: clarear(base) };
}
