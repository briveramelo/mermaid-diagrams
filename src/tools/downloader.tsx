import React from 'react'
import jsPDF from 'jspdf'
/**
 * Internal helper: clone & serialize the first <svg> found in the container.
 * Returns SVG XML and intrinsic width/height derived from the viewBox or attributes.
 */
function serializeSvgFrom(containerRef: React.RefObject<HTMLDivElement | null>) {
  const root = containerRef.current
  if (!root) return null
  const svg = root.querySelector('svg') as SVGSVGElement | null
  if (!svg) return null

  const clone = svg.cloneNode(true) as SVGSVGElement

  // Inline computed styles so svg2pdf doesn't miss CSS-defined colors/fonts
  try {
    const srcNodes = svg.querySelectorAll('*');
    const dstNodes = clone.querySelectorAll('*');
    srcNodes.forEach((srcEl, i) => {
      const dstEl = dstNodes[i] as Element | undefined;
      if (!dstEl) return;
      const cs = getComputedStyle(srcEl as Element);
      const fill = cs.fill; if (fill) (dstEl as Element).setAttribute('fill', fill);
      const stroke = cs.stroke; if (stroke) (dstEl as Element).setAttribute('stroke', stroke);
      const sw = cs.strokeWidth; if (sw) (dstEl as Element).setAttribute('stroke-width', sw);
      const fs = cs.fontSize; if (fs) (dstEl as Element).setAttribute('font-size', fs);
      const ff = cs.fontFamily; if (ff) (dstEl as Element).setAttribute('font-family', ff);
      const fw = cs.fontWeight; if (fw) (dstEl as Element).setAttribute('font-weight', fw);
      const op = cs.opacity; if (op) (dstEl as Element).setAttribute('opacity', op);
    });
  } catch {}

  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  const xml = new XMLSerializer().serializeToString(clone)

  // Use geometry of actual drawn content to size/crop the export
  let bbox = { x: 0, y: 0, width: 0, height: 0 };
  try {
    // getBBox requires the element to be in the DOM; the original svg is.
    const b = (svg as any).getBBox?.();
    if (b && b.width && b.height) {
      bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
  } catch {}

  // Fallback to viewBox if getBBox is unavailable
  if (!bbox.width || !bbox.height) {
    const vb = clone.getAttribute('viewBox');
    if (vb) {
      const parts = vb.trim().split(/[ ,]+/);
      if (parts.length === 4) {
        bbox = { x: Number(parts[0]) || 0, y: Number(parts[1]) || 0, width: Number(parts[2]) || 1, height: Number(parts[3]) || 1 };
      }
    }
  }

  const width = Math.max(1, Math.round(bbox.width));
  const height = Math.max(1, Math.round(bbox.height));

  return { xml, width, height, element: clone, offsetX: bbox.x, offsetY: bbox.y }
}

/**
 * Exported: Download as SVG (vector, original XML)
 */
export const downloadSvg = (containerRef: React.RefObject<HTMLDivElement | null>, fileName = 'diagram.svg') => {
  const data = serializeSvgFrom(containerRef)
  if (!data) return
  const blob = new Blob([data.xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Exported: Download as PDF. Uses svg2pdf.js to convert SVG directly to vector PDF.
 */
export const downloadPdf = async (
  containerRef: React.RefObject<HTMLDivElement | null>,
  options?: { fileName?: string }
) => {
  const data = serializeSvgFrom(containerRef)
  if (!data) return

  const { element, width, height, offsetX, offsetY } = data as any;
  const orientation = width >= height ? 'l' : 'p';
  const pdf = new jsPDF({ orientation, unit: 'pt', format: [width, height] });

  const mod = await import('svg2pdf.js');
  const svg2pdfFn: any = (mod as any).default ?? (mod as any).svg2pdf ?? (mod as any);
  await svg2pdfFn(element as any, pdf as any, { xOffset: -offsetX || 0, yOffset: -offsetY || 0, scale: 1 });

  pdf.save(options?.fileName ?? 'diagram.pdf')
}