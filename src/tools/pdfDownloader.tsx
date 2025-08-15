import jsPDF from "jspdf";

/**
 * Export a DOM node to a tightly-sized PDF (no excess boundaries).
 * - Preserves text wrapping & relative font sizing
 * - Avoids cropping by sizing the page to the content
 * - Adds a small, configurable margin
 */
export async function downloadPDF(
  node: HTMLElement | null,
  filename = "export.pdf",
  marginPt = 12
) {
  if (!node) throw new Error("downloadPDF: missing node");

  // Ensure fonts are ready so wrapping/metrics are stable
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch {}

  // Measure the element in CSS pixels
  const rect = node.getBoundingClientRect();

  // Convert CSS px -> points (1pt = 1/72in, 1px = 1/96in)
  const pxToPt = 72 / 96;
  const pageWidthPt = Math.ceil(rect.width * pxToPt) + marginPt * 2;
  const pageHeightPt = Math.ceil(rect.height * pxToPt) + marginPt * 2;

  // Create a custom-sized PDF that fits the content + margin
  const doc = new jsPDF({
    unit: "pt",
    format: [pageWidthPt, pageHeightPt],
    putOnlyUsedFonts: true,
    compress: true,
  });

  // Render HTML into the PDF at native scale
  await doc.html(node, {
    x: marginPt,
    y: marginPt,
    width: pageWidthPt - marginPt * 2,      // rendering width in pt
    windowWidth: Math.ceil(rect.width),      // matches on-screen layout/wrap
    html2canvas: {
      scale: Math.min(2, window.devicePixelRatio || 2), // crisp, not bloated
      useCORS: true,
      backgroundColor: null,
    },
  });

  doc.save(filename);
}