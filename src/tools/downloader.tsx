import React from 'react'
import jsPDF from 'jspdf'
const svg2pdf = await import('svg2pdf.js');
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
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  // Compute tight bbox on the ORIGINAL svg (must be in DOM)
  let bbox = { x: 0, y: 0, width: 0, height: 0 };
  try {
    const b = (svg as any).getBBox?.();
    if (b && b.width && b.height) {
      bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
  } catch {}

  // Fallback to viewBox if needed
  if (!bbox.width || !bbox.height) {
    const vb = svg.getAttribute('viewBox') || clone.getAttribute('viewBox');
    if (vb) {
      const parts = vb.trim().split(/[ ,]+/);
      if (parts.length === 4) {
        bbox = {
          x: Number(parts[0]) || 0,
          y: Number(parts[1]) || 0,
          width: Number(parts[2]) || 1,
          height: Number(parts[3]) || 1,
        };
      }
    }
  }

  const width = Math.max(1, Math.round(bbox.width));
  const height = Math.max(1, Math.round(bbox.height));

  // Normalize the clone's coordinate system to [0,0,width,height]
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  while (clone.firstChild) g.appendChild(clone.firstChild);
  g.setAttribute('transform', `translate(${-bbox.x}, ${-bbox.y})`);
  clone.appendChild(g);
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  // Inject background to match container bg (so light text stays visible on white PDF)
  try {
    const bgColor = getComputedStyle(root).backgroundColor;
    const isTransparent = !bgColor || /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(bgColor) || bgColor === 'transparent';
    if (!isTransparent) {
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', '0');
      bg.setAttribute('y', '0');
      bg.setAttribute('width', String(width));
      bg.setAttribute('height', String(height));
      bg.setAttribute('fill', bgColor);
      clone.insertBefore(bg, clone.firstChild);
    }
  } catch {}

  // Now serialize the adjusted clone
  const xml = new XMLSerializer().serializeToString(clone);

  return { xml, width, height, element: clone, offsetX: 0, offsetY: 0 };
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

  const { element, width, height } = data as any;
  const orientation = width >= height ? 'l' : 'p';
  const pdf = new jsPDF({ orientation, unit: 'pt', format: [width, height] });

  const mod = await import('svg2pdf.js');
  const svg2pdfFn: any = (mod as any).default ?? (mod as any).svg2pdf ?? (mod as any);
  await svg2pdfFn(element as any, pdf as any, { xOffset: 0, yOffset: 0, scale: 1 });

  pdf.save(options?.fileName ?? 'diagram.pdf')
}