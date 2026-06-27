// Coordinates for BPA-C form. All units are % of the page.
// Measured from the 1654x2339 background PNG.

export const HEADER_HEIGHT_DIGIT = 1.68;
export const UF_HEIGHT = 2.0;
export const ROW_HEIGHT = 2.65;

const CELL_W = 3.02;

export const CNES_BOXES = [6.77, 9.79, 12.82, 15.84, 18.86, 21.89, 24.91].map((left) => ({
  left,
  width: CELL_W,
}));

// CNES digit box: top ~14.40%, bottom ~16.08%
export const CNES_TOP = 14.4;

// Name field: same vertical band as CNES (the NOME box is the same height).
// Inset so text doesn't overlap the "NOME DO ESTABELECIMENTO DE SAÚDE" label.
export const NAME_FIELD = { top: 14.4, left: 36.5, width: 57, height: HEADER_HEIGHT_DIGIT };

// UF/MES/ANO/FOLHA share the same row: top ~18.13%, bottom ~20.14%
export const UF_TOP = 18.15;

export const UF_BOXES = [6.77, 9.79].map((left) => ({ left, width: CELL_W }));
export const MES_BOXES = [40.02, 43.05].map((left) => ({ left, width: CELL_W }));
export const ANO_BOXES = [46.07, 49.09, 52.12, 55.14].map((left) => ({ left, width: CELL_W }));
export const FOLHA_BOXES = [83.13, 86.15, 89.18].map((left) => ({ left, width: CELL_W }));

// Row tops measured from horizontal grid lines in the background.
export const ROW_TOPS = [
  29.16, 31.94, 34.59, 37.28, 39.93, 42.63, 45.28, 47.97, 50.62, 53.31,
  56.18, 58.87, 61.52, 64.22, 66.89, 69.56, 72.34, 74.90, 77.56, 80.25,
];

// Cell column lefts — kept from previous layout (these match the original PDF columns)
export const PROC_LEFTS = [17.39, 19.89, 22.4, 24.9, 27.4, 29.91, 32.41, 34.92, 37.42, 39.92];
export const PROC_WIDTH = 2.504;

export const CBO_LEFTS = [47.29, 49.72, 52.16, 54.6, 57.04, 59.48, 61.92];
export const CBO_WIDTH = 2.439;

export const IDADE_LEFTS = [69.23, 71.66, 74.1];
export const IDADE_WIDTH = 2.439;

export const QTD_LEFTS = [83.73, 86.71, 89.69, 92.67, 95.65, 98.63];
export const QTD_WIDTH = 2.981;

export const TOTAL_TOP = 86.7;

export const procBoxes = PROC_LEFTS.map((left) => ({ left, width: PROC_WIDTH }));
export const cboBoxes = CBO_LEFTS.map((left) => ({ left, width: CBO_WIDTH }));
export const idadeBoxes = IDADE_LEFTS.map((left) => ({ left, width: IDADE_WIDTH }));
export const qtdBoxes = QTD_LEFTS.map((left) => ({ left, width: QTD_WIDTH }));

export interface RowData {
  procedimento: string[];
  cbo: string[];
  idade: string[];
  quantidade: string[];
}

export function emptyRow(): RowData {
  return {
    procedimento: Array(10).fill(""),
    cbo: Array(7).fill(""),
    idade: Array(3).fill(""),
    quantidade: Array(6).fill(""),
  };
}
