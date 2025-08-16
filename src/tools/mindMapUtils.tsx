import {blend, parseRGB, toRGB} from "@/tools/colorHelpers.tsx";
import {by, qs, updateViewBox} from "@/tools/svgHelpers";
import {GInfo, LayerConfig} from "@/tools/mindMapTypes.tsx";

export const drawEdges = (svg: SVGSVGElement, infos: GInfo[], positions: Map<string, {
  x: number;
  y: number;
  w: number;
  h: number
}>, rootTranslate: { x: number; y: number }, rootId?: string) => {
  const grp = svg.querySelector('.mindmap-edges');
  if (!grp) return;
  grp.innerHTML = '';
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'elk-edges');
  const rootInfo = infos.find(i => i.id === rootId);
  const pos = (id: string) => id === rootId && rootInfo ? {
    x: rootTranslate.x,
    y: rootTranslate.y,
    w: rootInfo.w,
    h: rootInfo.h
  } : positions.get(id);
  infos.filter(n => n.parent && n.id !== rootId).forEach(e => {
    const s = pos(e.parent!);
    const t = pos(e.id);
    if (!s || !t) return;
    const x1 = s.x + s.w / 2, y1 = s.y + s.h / 2, x2 = t.x + t.w / 2, y2 = t.y + t.h / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1},${y1} Q ${(x1 + x2) / 2},${(y1 + y2) / 2} ${x2},${y2}`);
    if (typeof e.section === 'number') path.setAttribute('class', `edge section-edge-${e.section}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    g.appendChild(path);
  });
  grp.appendChild(g);
};

// ---------- Styling ----------
export const getDepth = (g: SVGGElement) => {
  const d = (g as any).dataset?.depth;
  if (d != null && !Number.isNaN(+d)) return +d;
  const cls = Array.from(g.classList).find(c => /^mm-depth-(\d+)$/.test(c));
  return cls ? +cls.split('-').pop()! : 1;
};

export const colorizeEdges = (svg: SVGSVGElement, sectionNums: number[], colors: string[], layerCount: number) => {
  const actual = Math.min(layerCount, sectionNums.length);
  for (let i = 0; i < actual; i++) qs<SVGGraphicsElement>(svg, `.mindmap-edges .section-edge-${sectionNums[i]}`).forEach(e => {
    e.style.stroke = colors[i];
    if (e.tagName.toLowerCase() === 'path') (e as SVGPathElement).style.fill = 'none';
  });
};

export const applyCenteredScaleAligned = (target: Element | null, anchor: Element | null, layerScale: number) => {
  if (!target || !anchor) return;
  const t = target as unknown as SVGGraphicsElement;
  const a = anchor as unknown as SVGGraphicsElement;
  const svg = t.ownerSVGElement;
  if (!svg || !t.getBBox || !a.getBBox) return;
  const tb = t.getBBox(), ab = a.getBBox();
  const tC = {x: tb.x + tb.width / 2, y: tb.y + tb.height / 2};
  const aC = {x: ab.x + ab.width / 2, y: ab.y + ab.height / 2};
  const base = t.getAttribute('data-mmf-base-transform') ?? (t.getAttribute('transform') || '');
  if (!t.hasAttribute('data-mmf-base-transform')) t.setAttribute('data-mmf-base-transform', base);
  t.setAttribute('transform', base);
  const tCTM = t.getCTM(), aCTM = a.getCTM();
  if (!tCTM || !aCTM) {
    t.setAttribute('transform', base);
    return;
  }
  const toScreen = (x: number, y: number, m: DOMMatrix) => {
    if ((window as any).DOMPoint) {
      const p = new DOMPoint(x, y).matrixTransform(m as any);
      return {x: p.x, y: p.y};
    }
    const p = (svg as any).createSVGPoint();
    p.x = x;
    p.y = y;
    const r = p.matrixTransform(m as any);
    return {x: r.x, y: r.y};
  };
  const invT = tCTM.inverse();
  const toLocal = (sx: number, sy: number) => {
    if ((window as any).DOMPoint) {
      const p = new DOMPoint(sx, sy).matrixTransform(invT as any);
      return {x: p.x, y: p.y};
    }
    const p = (svg as any).createSVGPoint();
    p.x = sx;
    p.y = sy;
    const r = p.matrixTransform(invT as any);
    return {x: r.x, y: r.y};
  };
  const tS = toScreen(tC.x, tC.y, tCTM as any), aS = toScreen(aC.x, aC.y, aCTM as any);
  const tL = toLocal(tS.x, tS.y), aL = toLocal(aS.x, aS.y);
  const dx = aL.x - tL.x, dy = aL.y - tL.y;
  t.setAttribute('transform', `${base} translate(${dx},${dy}) scale(${layerScale})`.trim());
  (t as any).style.transformOrigin = 'center';
  (t as any).style.transformBox = 'fill-box';
};

export const styleDiagram = (svg: SVGSVGElement, layerCount: number, colors: string[], min: LayerConfig, max: LayerConfig) => {
  const bgRGB = parseRGB(getComputedStyle((svg.parentElement as HTMLElement) || document.body).backgroundColor || '#0b1220') ?? [11, 18, 32];
  const all = qs<SVGGElement>(svg, '.mindmap-nodes > g.mindmap-node').filter(g => !g.classList.contains('section-root'));
  if (!all.length) return;
  const sectionRe = /^section-(\d+)$/;
  const sectionNums: number[] = [];
  all.forEach(n => {
    const sc = Array.from(n.classList).find(c => sectionRe.test(c));
    if (sc) {
      const s = +by(sc, sectionRe)!;
      if (!sectionNums.includes(s)) sectionNums.push(s);
    }
  });
  sectionNums.sort((a, b) => a - b);
  colorizeEdges(svg, sectionNums, colors, layerCount);

  const getDepths = all.map(getDepth);
  const maxDepth = Math.max(1, ...getDepths);
  const secToIdx = new Map<number, number>();
  const actual = Math.min(layerCount, sectionNums.length);
  for (let i = 0; i < actual; i++) secToIdx.set(sectionNums[i], i);

  all.forEach(node => {
    const sc = Array.from(node.classList).find(c => sectionRe.test(c));
    if (!sc) return;
    const secNum = +by(sc, sectionRe)!;
    const idx = secToIdx.get(secNum) ?? (secNum % colors.length);
    const color = colors[idx];
    const d = getDepth(node);
    const r = maxDepth <= 1 ? 0 : (d - 1) / (maxDepth - 1);
    const nodeFont = max.nodeFontSize - r * (max.nodeFontSize - min.nodeFontSize);
    const strokeW = max.edgeStrokeWidth - r * (max.edgeStrokeWidth - min.edgeStrokeWidth);
    const layerScale = max.boxScale - r * (max.boxScale - min.boxScale);
    const alpha = Math.max(0, Math.min(1, 0.12 + (1 - r) * 0.08));
    const fg = parseRGB(color) ?? [255, 255, 255];
    const blended = toRGB(blend(fg, bgRGB, alpha));

    qs<SVGGraphicsElement>(node, 'path, rect, polygon, circle, line').forEach(s => {
      s.style.stroke = color;
      s.style.strokeWidth = `${strokeW}px`;
      s.style.fill = blended;
      (s as any).style.vectorEffect = 'non-scaling-stroke';
    });
    qs<SVGTextElement>(node, 'text').forEach(t => {
      t.style.fill = color;
      t.style.fontSize = `${nodeFont}px`;
    });

    const groups = qs<SVGGElement>(node, ':scope > g');
    const shapes = groups[0] ?? null;
    const text = groups[1] ?? null;
    if (shapes && text) applyCenteredScaleAligned(shapes, text, layerScale); else if (shapes) applyCenteredScaleAligned(shapes, shapes, layerScale); else applyCenteredScaleAligned(node, node, layerScale);
  });
};