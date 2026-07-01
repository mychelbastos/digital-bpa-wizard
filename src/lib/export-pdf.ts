import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";

// Render a form-sheet element to an A4 PDF.
//
// html2canvas-pro does not render <input> text at the same vertical position as the
// browser — it baselines the glyph near the bottom of the box, so the exported PDF
// looks shifted down versus the on-screen preview (which is correct). Tweaking the
// input's line-height isn't enough because the canvas renderer treats <input> text
// specially. So inside the cloned DOM that html2canvas captures (the live UI is
// untouched) we REPLACE each <input> with a plain <div> carrying the same value and
// position: a block element's single line of text is centered reliably by
// `line-height = box height` in both the browser and the canvas renderer.
export async function exportSheetPdf(sheet: HTMLElement, filename: string) {
  const canvas = await html2canvas(sheet, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    onclone: (clonedDoc, clonedSheet) => {
      const liveInputs = sheet.querySelectorAll("input");
      const cloneInputs = Array.from(clonedSheet.querySelectorAll("input"));
      cloneInputs.forEach((el, i) => {
        const src = liveInputs[i] as HTMLInputElement | undefined;
        if (!src) return;
        const rect = src.getBoundingClientRect();
        const cs = window.getComputedStyle(src);
        const div = clonedDoc.createElement("div");
        div.textContent = src.value;
        const s = div.style;
        s.position = "absolute";
        s.top = (el as HTMLElement).style.top;
        s.left = (el as HTMLElement).style.left;
        s.width = (el as HTMLElement).style.width;
        s.height = (el as HTMLElement).style.height;
        s.lineHeight = `${rect.height}px`; // centers the single text line in the box
        s.fontFamily = cs.fontFamily;
        s.fontSize = cs.fontSize; // explicit px — sidesteps the 1.1cqw container units
        s.fontWeight = cs.fontWeight;
        s.color = cs.color;
        s.textAlign = cs.textAlign === "center" ? "center" : "left";
        s.paddingLeft = cs.paddingLeft;
        s.paddingRight = cs.paddingRight;
        s.boxSizing = "border-box";
        s.whiteSpace = "nowrap";
        s.overflow = "hidden";
        el.parentNode?.replaceChild(div, el);
      });

      // Camada extra de segurança (depois do mapeamento de inputs, p/ não afetar índices):
      // remove do clone todo overlay marcado p/ ignorar — botão-lixeira "limpar campo",
      // controles do Responsável etc. Garante que NUNCA saiam no PDF, mesmo se estivessem
      // visíveis/focados no momento da exportação. (html2canvas-pro já os ignora; isto é
      // um cinto-e-suspensório determinístico.)
      clonedSheet.querySelectorAll('[data-html2canvas-ignore="true"]').forEach((el) => el.remove());
    },
  });
  const img = canvas.toDataURL("image/jpeg", 0.95);
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  pdf.addImage(img, "JPEG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
  pdf.save(filename);
}
