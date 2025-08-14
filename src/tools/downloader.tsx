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
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  // Inline computed styles so svg2pdf doesn't miss CSS-defined colors/fonts
  try {
    const srcNodes = svg.querySelectorAll('*');
    const dstNodes = clone.querySelectorAll('*');
    srcNodes.forEach((srcEl, i) => {
      const dstEl = dstNodes[i] as Element | undefined;
      if (!dstEl) return;
      const cs = getComputedStyle(srcEl as Element);
      const pairs: Array<[string, string | null]> = [
        ['fill', cs.fill],
        ['stroke', cs.stroke],
        ['stroke-width', cs.strokeWidth],
        ['font-size', cs.fontSize],
        ['font-family', cs.fontFamily],
        ['font-weight', cs.fontWeight],
        ['color', cs.color], // for currentColor-based fills
        ['opacity', cs.opacity],
      ];
      for (const [k, v] of pairs) {
        if (v) (dstEl as Element).setAttribute(k, v);
      }
    });
  } catch {}

  // Best-effort: replace <foreignObject> labels with plain <text>
  try {
    const fos = Array.from(svg.querySelectorAll('foreignObject'));
    const fosClone = Array.from(clone.querySelectorAll('foreignObject'));
    fos.forEach((fo, idx) => {
      const foClone = fosClone[idx] as SVGForeignObjectElement | undefined;
      const textStr = (fo as any).textContent?.trim();
      if (!foClone || !textStr) return;
      let bb: DOMRect | undefined;
      try { bb = (fo as any).getBBox?.(); } catch {}
      const baseY = (bb?.y ?? Number(fo.getAttribute('y')) ?? 0) + (bb?.height ?? 16) * 0.75;
      const x = bb?.x ?? Number(fo.getAttribute('x')) ?? 0;
      const y = baseY;
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', String(x));
      t.setAttribute('y', String(y));
      const cs = getComputedStyle(fo as Element);
      if (cs.fontFamily) t.setAttribute('font-family', cs.fontFamily);
      if (cs.fontSize) t.setAttribute('font-size', cs.fontSize);
      if (cs.fontWeight) t.setAttribute('font-weight', cs.fontWeight);
      if (cs.color) t.setAttribute('fill', cs.color);
      t.textContent = textStr;
      foClone.parentNode?.replaceChild(t, foClone);
    });
  } catch {}

  // Compute tight bbox by unioning visible primitives (ignore defs)
  let bbox = { x: 0, y: 0, width: 0, height: 0 };
  try {
    const targets = svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon,text,foreignObject');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    targets.forEach((el) => {
      try {
        const b = (el as any).getBBox?.();
        if (b && b.width >= 0 && b.height >= 0) {
          minX = Math.min(minX, b.x);
          minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.width);
          maxY = Math.max(maxY, b.y + b.height);
        }
      } catch {}
    });
    if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
      bbox = { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
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