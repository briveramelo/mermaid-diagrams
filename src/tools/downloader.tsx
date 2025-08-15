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
    // Ensure text remains visible in export: if computed text fill is none/transparent, use computed color
    try {
      const srcText = svg.querySelectorAll('text, tspan');
      const dstText = clone.querySelectorAll('text, tspan');
      const isNoneOrTransparent = (v: string | null) => !v || v === 'none' || /rgba\([^)]*,\s*0\s*\)/i.test(v) || v === 'transparent';
      srcText.forEach((srcEl, i) => {
        const dstEl = dstText[i] as Element | undefined;
        if (!dstEl) return;
        const cs = getComputedStyle(srcEl as Element);
        const fill = cs.fill;
        const color = cs.color;
        if (isNoneOrTransparent(fill) && color) {
          dstEl.setAttribute('fill', color);
        }
      });
    } catch {}

    // Persist text alignment from CSS to attributes so svg2pdf honors it
    try {
      const srcText2 = svg.querySelectorAll('text, tspan');
      const dstText2 = clone.querySelectorAll('text, tspan');
      srcText2.forEach((srcEl, i) => {
        const dstEl = dstText2[i] as Element | undefined;
        if (!dstEl) return;
        const cs: any = getComputedStyle(srcEl as Element);
        const ta = cs.textAnchor || (srcEl as Element).getAttribute('text-anchor');
        const db = cs.dominantBaseline || (srcEl as Element).getAttribute('dominant-baseline');
        if (ta) dstEl.setAttribute('text-anchor', ta);
        if (db) dstEl.setAttribute('dominant-baseline', db);
      });
    } catch {}

  } catch {}

  // Best-effort: replace <foreignObject> labels with centered <text>/<tspan> lines (word-wrapped)
  try {
    const fos = Array.from(svg.querySelectorAll('foreignObject'));
    const fosClone = Array.from(clone.querySelectorAll('foreignObject'));

    // Helper to compute lines using canvas text metrics
    const wrapToWidth = (text: string, maxWidth: number, font: string): string[] => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return [text];
      ctx.font = font;
      const words = text.replace(/\s+/g, ' ').trim().split(' ');
      const lines: string[] = [];
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        const width = ctx.measureText(test).width;
        if (width <= maxWidth || !line) {
          line = test;
        } else {
          lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    fos.forEach((fo, idx) => {
      const foClone = fosClone[idx] as SVGForeignObjectElement | undefined;
      if (!foClone) return;

      const rawHTML = (fo as any).innerHTML || '';
      // Extract plain text (keep manual <br> as breaks)
      const htmlForBreaks = rawHTML
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '');
      const textStr = (htmlForBreaks || (fo as any).textContent || '')
        .replace(/\u00A0/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .trim();
      if (!textStr) return;

      // Geometry
      let bb: DOMRect | undefined;
      try { bb = (fo as any).getBBox?.(); } catch {}
      const x = bb?.x ?? Number(fo.getAttribute('x')) ?? 0;
      const y = bb?.y ?? Number(fo.getAttribute('y')) ?? 0;
      const w = bb?.width ?? Number(fo.getAttribute('width')) ?? 0;
      const h = bb?.height ?? Number(fo.getAttribute('height')) ?? 0;

      // Typography
      const cs = getComputedStyle(fo as Element);
      const fontSizePx = parseFloat(cs.fontSize || '14') || 14;
      const lineHeight = (() => {
        const lh = cs.lineHeight;
        const n = parseFloat(lh || '0');
        return !lh || lh === 'normal' || !isFinite(n) ? fontSizePx * 1.2 : n;
      })();
      const fontWeight = cs.fontWeight || 'normal';
      const fontFamily = cs.fontFamily || 'sans-serif';
      const fillColor = cs.color || '#111';
      const font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;

      // Inspect inner label element for wrapping rules and alignment
      let inner = fo.querySelector('*') as HTMLElement | null;
      const csInner = inner ? getComputedStyle(inner) : (cs as CSSStyleDeclaration);
      const whiteSpace = (csInner.whiteSpace || cs.whiteSpace || '').toLowerCase();
      const textAlign = (csInner.textAlign || cs.textAlign || 'center').toLowerCase();
      const wrapAllowed = !(whiteSpace.includes('nowrap') || whiteSpace === 'pre');

      // Compute wrapped lines to the available width inside FO
      const maxTextWidth = Math.max(1, Math.round(w || 0));
      let lines: string[];
      const explicit = textStr.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (!wrapAllowed) {
        lines = explicit.length > 0 ? explicit : [textStr];
      } else {
        const toWrap = explicit.length > 1 ? explicit.join(' ') : textStr.replace(/\r?\n/g, ' ');
        lines = wrapToWidth(toWrap, maxTextWidth, font);
      }

      // Center horizontally and vertically within the foreignObject bbox
      const xCenter = x + maxTextWidth / 2;
      const blockHeight = lines.length * lineHeight;
      const yStart = y + Math.max(fontSizePx, (h || blockHeight) / 2 - blockHeight / 2 + fontSizePx * 0.8);

      const ns = 'http://www.w3.org/2000/svg';
      const text = document.createElementNS(ns, 'text');
      const anchor = textAlign === 'center' ? 'middle' : textAlign === 'right' ? 'end' : 'start';
      text.setAttribute('text-anchor', anchor);
      text.setAttribute('font-family', fontFamily);
      text.setAttribute('font-size', String(fontSizePx));
      text.setAttribute('font-weight', fontWeight);
      text.setAttribute('fill', fillColor);

      lines.forEach((line, iLine) => {
        const tspan = document.createElementNS(ns, 'tspan');
        tspan.setAttribute('x', String(xCenter));
        if (iLine === 0) tspan.setAttribute('y', String(yStart));
        else tspan.setAttribute('dy', String(lineHeight));
        tspan.textContent = line;
        text.appendChild(tspan);
      });

      foClone.parentNode?.replaceChild(text, foClone);
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