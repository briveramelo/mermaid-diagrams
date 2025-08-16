import ELK from 'elkjs/lib/elk.bundled.js';
import React, {RefObject, useEffect, useCallback} from 'react';
import {bbox, by, qs} from "@/tools/svgHelpers.tsx";
import {GInfo, LayerConfig} from "@/tools/mindMapTypes.tsx";
import {drawEdges, styleDiagram} from "@/tools/mindMapUtils.tsx";

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

export type MindMapFormatterProps = {
  containerRef: RefObject<HTMLElement | null>;
  layerCount: number;
  minConfig: LayerConfig;
  maxConfig: LayerConfig;
  colors: string[];
};

// ---------- Component ----------
const MindMapFormatter: React.FC<MindMapFormatterProps> = (
  {
    containerRef,
    layerCount,
    minConfig,
    maxConfig,
    colors
  }) => {
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

export {MindMapFormatter};
