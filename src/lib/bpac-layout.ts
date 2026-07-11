// Coordinates for BPA-C form. All units are % of the 1654x2339 background PNG.
// Row tops/heights and column lefts were measured directly from the image
// (horizontal grid lines and vertical tick marks).

export const HEADER_HEIGHT_DIGIT = 2.57;
export const UF_HEIGHT = 2.27;

const CELL_W = 3.02;

// ---------- Header ----------
// Box rectangles measured from PNG vertical scan:
//   CNES digit cells: y 13.51% → 16.08% (h=2.57%)
//   UF/MES/ANO/FOLHA cells: y 17.87% → 20.14% (h=2.27%)
export const CNES_BOXES = [6.77, 9.79, 12.82, 15.84, 18.86, 21.89, 24.91].map((left) => ({
  left,
  width: CELL_W,
}));
export const CNES_TOP = 13.51;

export const NAME_FIELD = { top: 13.51, left: 36.5, width: 57, height: HEADER_HEIGHT_DIGIT };

export const UF_TOP = 17.87;
export const UF_BOXES = [6.77, 9.79].map((left) => ({ left, width: CELL_W }));
export const MES_BOXES = [40.02, 43.05].map((left) => ({ left, width: CELL_W }));
export const ANO_BOXES = [46.07, 49.09, 52.12, 55.14].map((left) => ({ left, width: CELL_W }));
export const FOLHA_BOXES = [83.13, 86.15, 89.18].map((left) => ({ left, width: CELL_W }));




// ---------- Grid: 20 rows ----------
// Top of each row's input band (i.e. the top horizontal line of that row).
export const ROW_TOPS = [
  26.51, 29.16, 31.94, 34.59, 37.28, 39.93, 42.63, 45.28, 47.97, 50.62,
  53.31, 56.18, 58.87, 61.52, 64.22, 66.65, 69.56, 72.34, 74.90, 77.56,
];
// Height per row (bottom-of-row minus top), in %.
export const ROW_HEIGHTS = [
  2.65, 2.78, 2.65, 2.69, 2.65, 2.69, 2.65, 2.69, 2.65, 2.69,
  2.86, 2.69, 2.65, 2.69, 2.44, 2.91, 2.78, 2.57, 2.65, 2.69,
];
export const ROW_HEIGHT = 2.65; // legacy fallback

// ---------- Columns (measured from vertical tick marks) ----------
// PROCEDIMENTO — 10 digits. Tick centers: 17.90, 19.89, 22.19, 24.55, 26.97, 29.32, 31.74, 34.10, 36.40, 38.63, 40.93
export const PROC_LEFTS = [17.90, 19.89, 22.19, 24.55, 26.97, 29.32, 31.74, 34.10, 36.40, 38.63];
export const PROC_WIDTHS = [1.99, 2.30, 2.36, 2.42, 2.35, 2.42, 2.36, 2.30, 2.23, 2.30];

// CBO — 6 digits. Ticks: 45.41, 47.70, 49.94, 52.24, 54.47, 56.77, 59.01
export const CBO_LEFTS = [45.41, 47.70, 49.94, 52.24, 54.47, 56.77];
export const CBO_WIDTHS = [2.29, 2.24, 2.30, 2.23, 2.30, 2.24];

// IDADE — 3 digits. Ticks: 65.60, 68.08, 70.38, 72.61
export const IDADE_LEFTS = [65.60, 68.08, 70.38];
export const IDADE_WIDTHS = [2.48, 2.30, 2.24];

// QUANTIDADE — 5 cells in the main bracket + 1 isolated cell on the far right = 6 digits total.
export const QTD_LEFTS = [78.72, 81.56, 84.34, 87.24, 89.96];
export const QTD_WIDTHS = [2.84, 2.78, 2.90, 2.72, 2.42];

export const TOTAL_TOP = 81.6;
export const TOTAL_HEIGHT = 2.31;

const zipBoxes = (lefts: number[], widths: number[]) =>
  lefts.map((left, i) => ({ left, width: widths[i] }));

export const procBoxes = zipBoxes(PROC_LEFTS, PROC_WIDTHS);
export const cboBoxes = zipBoxes(CBO_LEFTS, CBO_WIDTHS);
export const idadeBoxes = zipBoxes(IDADE_LEFTS, IDADE_WIDTHS);
export const qtdBoxes = zipBoxes(QTD_LEFTS, QTD_WIDTHS);

export interface RowData {
  procedimento: string[];
  cbo: string[];
  idade: string[];
  quantidade: string[];
}

export function emptyRow(): RowData {
  return {
    procedimento: Array(10).fill(""),
    cbo: Array(6).fill(""),
    idade: Array(3).fill(""),
    quantidade: Array(5).fill(""),
  };
}
