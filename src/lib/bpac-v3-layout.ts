// Layout do BPA-C V3 — imagem "bpa-c (profissional).png".
// Idêntico ao V2 (bpac-layout) em TUDO, exceto a 2ª linha do cabeçalho: MÊS/ANO
// foram deslocados para a esquerda (junto ao UF) e há um novo campo NOME DO
// PROFISSIONAL entre ANO e FOLHA. As coordenadas abaixo foram medidas por varredura
// dos tick marks da PNG (a diff das duas imagens só muda a faixa y 16%..22%).
//
// IMPORTANTE: o NOME DO PROFISSIONAL é controle interno do painel — NÃO é exportado
// para o .txt / BPA Magnético (o gerador só lê cnes/ano/mes/folha/rows).
export * from "./bpac-layout";
import { UF_HEIGHT } from "./bpac-layout";

const CELL_W = 3.02;

// Dividers impressos (varredura): 15.24 · 18.26 · 21.28 · 24.30 · 27.33 · 30.35 · 33.37
// (e 35.19 = borda da caixa do NOME). Conferido desenhando os dígitos sobre a imagem:
//   MÊS = 2 células [15.24-18.26], [18.26-21.28]
//   ANO = 4 células a partir de 21.28 (logo após o MÊS): [21.28],[24.30],[27.33],[30.35]
// O ANO começa em 21.28 (não 24.30) — senão a 1ª célula fica vazia e o 4º dígito vaza.
export const MES_BOXES = [15.24, 18.26].map((left) => ({ left, width: CELL_W }));
export const ANO_BOXES = [21.28, 24.30, 27.33, 30.35].map((left) => ({ left, width: CELL_W }));

// Caixa (retângulo aberto) NOME DO PROFISSIONAL — bordas medidas em 35.19%..80.3%.
// Texto alinhado à linha do UF/MÊS/ANO (mesmo topo/altura do restante da 2ª linha).
export const NOME_PROFISSIONAL_FIELD = {
  top: 17.7,
  left: 36.2,
  width: 43.3,
  height: UF_HEIGHT + 0.2,
};
