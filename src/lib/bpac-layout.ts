// Coordinates for BPA-C form. All units are % of the page.

export const ROW_HEIGHT = 1.78;
export const HEADER_HEIGHT_DIGIT = 1.83;
export const UF_HEIGHT = 1.61;

export const CNES_BOXES = [3.25, 6.5, 9.76, 13.01, 16.26, 19.51, 22.76].map((left) => ({
  left,
  width: 3.25,
}));

export const NAME_FIELD = { top: 12.12, left: 26.5, width: 70, height: HEADER_HEIGHT_DIGIT };

export const UF_BOXES = [3.25, 6.5].map((left) => ({ left, width: 3.25 }));

export const MES_BOXES = [39.02, 42.28].map((left) => ({ left, width: 3.25 }));
export const ANO_BOXES = [45.53, 48.78, 52.03, 55.28].map((left) => ({ left, width: 3.25 }));
export const FOLHA_BOXES = [85.37, 88.62, 91.87].map((left) => ({ left, width: 3.25 }));

// Row tops (1..20)
export const ROW_TOPS = [
  26.2, 29.07, 31.93, 34.79, 37.65, 40.51, 43.37, 46.23, 49.1, 51.96,
  54.82, 57.68, 60.54, 63.4, 66.27, 69.13, 71.99, 74.85, 77.71, 80.57,
];

export const PROC_LEFTS = [17.39, 19.89, 22.4, 24.9, 27.4, 29.91, 32.41, 34.92, 37.42, 39.92];
export const PROC_WIDTH = 2.504;

export const CBO_LEFTS = [47.29, 49.72, 52.16, 54.6, 57.04, 59.48, 61.92];
export const CBO_WIDTH = 2.439;

export const IDADE_LEFTS = [69.23, 71.66, 74.1];
export const IDADE_WIDTH = 2.439;

export const QTD_LEFTS = [83.73, 86.71, 89.69, 92.67, 95.65, 98.63];
export const QTD_WIDTH = 2.981;

export const TOTAL_TOP = 83.5;

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
