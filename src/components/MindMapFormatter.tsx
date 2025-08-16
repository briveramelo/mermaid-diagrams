// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ELK from 'elkjs/lib/elk.bundled.js';
import React, {RefObject, useEffect, useImperativeHandle, forwardRef, useCallback} from 'react';

// ---------- Types ----------
type LayerConfig = { nodeFontSize: number; nodePadding: number; edgeStrokeWidth: number; boxScale: number; };
export type MindMapFormatterHandle = { refresh: () => void };
export type MindMapFormatterProps = {
  containerRef: RefObject<HTMLElement | null>;
  layerCount: number;
  minConfig: LayerConfig;
  maxConfig: LayerConfig;
  colors: string[];
};

type GInfo = { g: SVGGElement; id: string; parent?: string | null; section?: number; w: number; h: number };

// ---------- Small SVG helpers ----------
const qs = <T extends Element>(root: ParentNode, sel: string) => Array.from(root.querySelectorAll<T>(sel));
const bbox = (el: SVGGraphicsElement) => el.getBBox();
const by = (cls: string, re: RegExp) => Array.from(cls.match(re) || [])[1];

const unionBBox = (bs: DOMRect[]) => {
  if (!bs.length) return null;
  const xs = bs.map(b => b.x), ys = bs.map(b => b.y);
  const xe = bs.map(b => b.x + b.width), ye = bs.map(b => b.y + b.height);
  const x = Math.min(...xs), y = Math.min(...ys);
  return {x, y, width: Math.max(...xe) - x, height: Math.max(...ye) - y};
};

const updateViewBox = (svg: SVGSVGElement) => {
  const nodesRoot = svg.querySelector('.mindmap-nodes') as SVGGElement | null;
  const elkEdges = svg.querySelector('.elk-edges') as SVGGElement | null;
  const b = unionBBox([nodesRoot, elkEdges].filter(Boolean).map(e => (e as any).getBBox()));
  if (!b) return;
  const pad = 32, x = Math.floor(b.x - pad), y = Math.floor(b.y - pad);
  const w = Math.ceil(b.width + 2 * pad), h = Math.ceil(b.height + 2 * pad);
  if (!svg.hasAttribute('data-mmf-base-viewBox') && svg.getAttribute('viewBox'))
    svg.setAttribute('data-mmf-base-viewBox', svg.getAttribute('viewBox')!);
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
};

// ---------- Color helpers (opaque “transparent” fill) ----------
const parseRGB = (s: string): [number, number, number] | null => {
  const m = s.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = s.match(/^#([0-9a-f]{6})$/i);
  if (h) {
    const n = parseInt(h[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return null;
};
const toRGB = (r: [number, number, number]) => `rgb(${r[0]}, ${r[1]}, ${r[2]})`;
const blend = (fg: [number, number, number], bg: [number, number, number], a: number): [number, number, number] => (
  [Math.round(fg[0] * a + bg[0] * (1 - a)), Math.round(fg[1] * a + bg[1] * (1 - a)), Math.round(fg[2] * a + bg[2] * (1 - a))]
);

// ---------- Data collection ----------
const collectInfos = (svg: SVGSVGElement): { infos: GInfo[]; rootId?: string } => {
  const gs = qs<SVGGElement>(svg, '.mindmap-nodes > g.mindmap-node');
  const infos = gs.map(g => {
    const b = bbox(g as any), id = (g as any).dataset.mmId as string | undefined;
    const parent = ((g as any).dataset.mmParent as string | undefined) ?? null;
    const sec = Array.from(g.classList).find(c => /^section-(\d+)$/.test(c));
    const section = sec ? parseInt(by(sec, /^section-(\d+)$/)!, 10) : undefined;
    return {g, id: id || '', parent, section, w: b.width || 10, h: b.height || 10};
  }).filter(i => i.id);
  const root = infos.find(i => i.id.startsWith('root-')) || infos.find(i => !i.parent);
  return {infos, rootId: root?.id};
};

// ---------- Section bucketing (LEFT/RIGHT, balanced by size) ----------
const buildBuckets = (infos: GInfo[]) => {
  const sections = Array.from(new Set(infos.map(i => i.section).filter((s): s is number => typeof s === 'number' && s >= 0)));
  const counts = new Map<number, number>();
  sections.forEach(s => counts.set(s, 0));
  infos.forEach(i => {
    if (typeof i.section === 'number' && i.section >= 0) counts.set(i.section, (counts.get(i.section) || 0) + 1);
  });
  type Bucket = { dir: 'RIGHT' | 'LEFT'; total: number; sections: number[] };
  const buckets: Bucket[] = [{dir: 'RIGHT', total: 0, sections: []}, {dir: 'LEFT', total: 0, sections: []}];
  sections.sort((a, b) => (counts.get(b)! - counts.get(a)!)).forEach(sec => {
    buckets.sort((a, b) => a.total - b.total);
    buckets[0].sections.push(sec);
    buckets[0].total += counts.get(sec)!;
  });
  const sectionToDir = new Map<number, Bucket['dir']>();
  buckets.forEach(b => b.sections.forEach(s => sectionToDir.set(s, b.dir)));
  return {buckets, sectionToDir};
};

// ---------- ELK layered per-side, vertically aligned ----------
const layoutLeftRight = async (svg: SVGSVGElement, infos: GInfo[], rootId: string) => {
  const elk = new ELK();
  type Pos = { x: number; y: number; w: number; h: number };
  const positions = new Map<string, Pos>();
  const {buckets} = buildBuckets(infos);

  const per: { mid: number; map: Map<string, Pos> }[] = [];
  for (const b of buckets) {
    const allowed = new Set(b.sections);
    const sub = infos.filter(i => i.id === rootId || (typeof i.section === 'number' && allowed.has(i.section)));
    const ids = new Set(sub.map(i => i.id));
    const children = sub.map(n => ({id: n.id, width: Math.max(1, n.w), height: Math.max(1, n.h)}));
    const edges = sub.filter(n => n.parent && ids.has(n.parent!) && n.id !== rootId).map(n => ({
      id: `${n.parent}->${n.id}`,
      sources: [n.parent!],
      targets: [n.id]
    }));

    const laid = await elk.layout({
      id: `g-${b.dir}`, layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': b.dir,
        'spacing.nodeNodeBetweenLayers': '40',
        'spacing.nodeNode': '28',
        'org.eclipse.elk.padding': '{top:12,left:12,bottom:12,right:12}'
      }, children, edges
    } as any);

    const r = (laid.children || []).find(c => c.id === rootId);
    const offX = r ? -(r.x || 0) : 0;
    const offY = r ? -(r.y || 0) : 0;
    let minY = Infinity, maxY = -Infinity;
    const map = new Map<string, Pos>();
    for (const c of (laid.children || [])) {
      if (c.id === rootId) continue;
      const p = {x: (c.x || 0) + offX, y: (c.y || 0) + offY, w: c.width || 0, h: c.height || 0};
      map.set(c.id, p);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + p.h);
    }
    per.push({mid: (minY + maxY) / 2, map});
  }
  const weightedMid = per.reduce((s, p) => s + p.mid * p.map.size, 0) / Math.max(1, per.reduce((s, p) => s + p.map.size, 0));
  per.forEach(p => {
    const dy = weightedMid - p.mid;
    p.map.forEach((v, k) => positions.set(k, {x: v.x, y: v.y + dy, w: v.w, h: v.h}));
  });
  const rootY = weightedMid; // center the root vertically
  return {positions, rootTranslate: {x: 0, y: rootY}};
};

// ---------- Edges rendering ----------
const drawEdges = (svg: SVGSVGElement, infos: GInfo[], positions: Map<string, {
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
  updateViewBox(svg);
};

// ---------- Styling ----------
const getDepth = (g: SVGGElement) => {
  const d = (g as any).dataset?.depth;
  if (d != null && !Number.isNaN(+d)) return +d;
  const cls = Array.from(g.classList).find(c => /^mm-depth-(\d+)$/.test(c));
  return cls ? +cls.split('-').pop()! : 1;
};

const colorizeEdges = (svg: SVGSVGElement, sectionNums: number[], colors: string[], layerCount: number) => {
  const actual = Math.min(layerCount, sectionNums.length);
  for (let i = 0; i < actual; i++) qs<SVGGraphicsElement>(svg, `.mindmap-edges .section-edge-${sectionNums[i]}`).forEach(e => {
    e.style.stroke = colors[i];
    if (e.tagName.toLowerCase() === 'path') (e as SVGPathElement).style.fill = 'none';
  });
};

const applyCenteredScaleAligned = (target: Element | null, anchor: Element | null, layerScale: number) => {
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

const styleDiagram = (svg: SVGSVGElement, layerCount: number, colors: string[], min: LayerConfig, max: LayerConfig) => {
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

// ---------- Component ----------
const MindMapFormatter = forwardRef<MindMapFormatterHandle, MindMapFormatterProps>(
  ({containerRef, layerCount, minConfig, maxConfig, colors}, ref) => {
    const applyFormatting = useCallback(async () => {
      const svg = containerRef.current?.querySelector('svg') as SVGSVGElement | null;
      if (!svg) return;

      // Collect data and run layout
      const {infos, rootId} = collectInfos(svg);
      if (!infos.length || !rootId) return;
      const {positions, rootTranslate} = await layoutLeftRight(svg, infos, rootId);

      // Place nodes (root is vertically centered; others use ELK positions)
      const rootInfo = infos.find(i => i.id === rootId)!;
      infos.forEach(info => {
        const base = info.g.getAttribute('data-elk-base-transform') ?? (info.g.getAttribute('transform') || '');
        if (!info.g.hasAttribute('data-elk-base-transform')) info.g.setAttribute('data-elk-base-transform', base);
        if (info.id === rootId) info.g.setAttribute('transform', `translate(${rootTranslate.x},${rootTranslate.y})`);
        else {
          const p = positions.get(info.id);
          if (p) info.g.setAttribute('transform', `translate(${p.x},${p.y})`);
        }
      });

      // Draw edges & fit viewBox
      drawEdges(svg, infos, positions, rootTranslate, rootId);

      // Styling pass
      styleDiagram(svg, layerCount, colors, minConfig, maxConfig);
    }, [containerRef, layerCount, minConfig, maxConfig, colors]);

    useImperativeHandle(ref, () => ({refresh: () => applyFormatting()}), [applyFormatting]);

    useEffect(() => {
      if (!containerRef.current) return;
      let obs: MutationObserver | null = null;
      let raf = 0;
      const schedule = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => applyFormatting());
      };
      const svg = containerRef.current.querySelector('svg');
      if (svg) applyFormatting();
      obs = new MutationObserver(schedule);
      obs.observe(containerRef.current, {childList: true, subtree: true});
      return () => {
        cancelAnimationFrame(raf);
        obs?.disconnect();
      };
    }, [containerRef, applyFormatting]);

    return null;
  }
);

MindMapFormatter.displayName = 'MindMapFormatter';
export {MindMapFormatter};
