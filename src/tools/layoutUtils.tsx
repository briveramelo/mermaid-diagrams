import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, forceRadial } from 'd3-force';
import type { GInfo } from '@/tools/mindMapTypes.tsx';

export type Pos = { x: number; y: number; w: number; h: number };

export type ForceConfig = {
  enabled?: boolean;           // gate
  iterations?: number;         // 100–300
  charge?: number;             // -10..-40
  collidePadding?: number;     // 6..14
  linkStrength?: number;       // 0.1..0.3
  linkDistanceScale?: number;  // global multiplier for link distance
  firstLevelDistanceScale?: number; // < 1 to shorten only depth-1 edges
  radialStrength?: number;     // 0..0.15
  sideStrength?: number;       // 0..0.2
  bandYStrength?: number;      // 0..0.1
};

const DEF: Required<ForceConfig> = {
  enabled: true,
  iterations: 160,
  charge: -20,
  collidePadding: 8,
  linkStrength: 0.15,
  linkDistanceScale: 1.0,
  firstLevelDistanceScale: 0.7,  // pull first layer closer by default
  radialStrength: 0.06,
  sideStrength: 0.08,
  bandYStrength: 0.03,
};

function depthOf(info: GInfo): number {
  const d = (info.g as any).dataset?.depth; if (d != null && !Number.isNaN(+d)) return +d;
  const cls = Array.from(info.g.classList).find(c => /^mm-depth-(\d+)$/.test(c));
  return cls ? +cls.split('-').pop()! : 1;
}

/**
 * Run a short d3-force simulation starting from ELK positions.
 * Returns a NEW positions map (top-left x,y) for non-root nodes.
 */
export function runForcePolish(
  infos: GInfo[],
  positions: Map<string, Pos>,
  rootTranslate: { x: number; y: number },
  rootId: string,
  cfg?: ForceConfig,
): Map<string, Pos> {
  const C = { ...DEF, ...(cfg || {}) };
  if (!C.enabled) return positions;

  const nodes = infos.map((i) => ({ ...i, depth: depthOf(i) }));
  const rootInfo = nodes.find(n => n.id === rootId);
  if (!rootInfo) return positions;

  // Centers from current top-left positions
  const centerOf = (id: string) => {
    if (id === rootId) {
      return { x: rootTranslate.x + rootInfo.w / 2, y: rootTranslate.y + rootInfo.h / 2, w: rootInfo.w, h: rootInfo.h };
    }
    const p = positions.get(id);
    if (!p) return undefined;
    return { x: p.x + p.w / 2, y: p.y + p.h / 2, w: p.w, h: p.h };
  };

  type FNode = { id: string; x: number; y: number; vx?: number; vy?: number; w: number; h: number; depth: number; side: 'LEFT'|'RIGHT'; fx?: number; fy?: number };
  type FLink = { source: string; target: string };

  const rootC = centerOf(rootId)!;

  // Build force nodes
  const fNodes: FNode[] = nodes.map(n => {
    const c = centerOf(n.id)!;
    const side: 'LEFT' | 'RIGHT' = (c.x >= rootC.x) ? 'RIGHT' : 'LEFT';
    return { id: n.id, x: c.x, y: c.y, w: c.w, h: c.h, depth: n.depth, side };
  });

  // Links: parent -> child
  const fLinks: FLink[] = nodes
    .filter(n => n.parent && n.id !== rootId)
    .map(n => ({ source: String(n.parent), target: n.id }));

  // Target distances from current layout
  const dist = new Map<string, number>();
  fLinks.forEach(l => {
    const a = fNodes.find(n => n.id === String(l.source))!;
    const b = fNodes.find(n => n.id === String(l.target))!;
    const d = Math.hypot(a.x - b.x, a.y - b.y) * C.linkDistanceScale;
    // Shorten only parent->child where child is depth 1
    const child = nodes.find(n => n.id === String(l.target));
    const scale = (child && child.depth === 1) ? C.firstLevelDistanceScale : 1;
    dist.set(`${l.source}->${l.target}`, d * scale);
  });

  // Pin root
  const root = fNodes.find(n => n.id === rootId)!; root.fx = root.x; root.fy = root.y;

  // Derive a ring spacing from median depth-1 link distance (fallback to 40)
  const d1 = fLinks
    .map(l => ({ a: fNodes.find(n => n.id === String(l.source))!, b: fNodes.find(n => n.id === String(l.target))!, t: nodes.find(n => n.id === String(l.target))! }))
    .filter(x => x.t.depth === 1)
    .map(x => Math.hypot(x.a.x - x.b.x, x.a.y - x.b.y));
  const sorted = d1.slice().sort((a,b)=>a-b);
  const ring = sorted.length ? sorted[Math.floor(sorted.length/2)] : 40;

  const iters = C.iterations;
  const sim = forceSimulation(fNodes)
    .alpha(0.9)
    .alphaDecay(1 - Math.pow(0.001, 1 / iters))
    .velocityDecay(0.5)
    .force('link', forceLink<FNode, FLink>(fLinks)
      .id(d => d.id)
      .distance(l => dist.get(`${l.source}->${l.target}`) ?? 60)
      .strength(C.linkStrength)
    )
    .force('charge', forceManyBody().strength(C.charge))
    .force('collide', forceCollide<FNode>(d => Math.max(d.w, d.h) / 2 + C.collidePadding).iterations(2))
    .force('radial', forceRadial<FNode>(d => ring * (d.depth || 1), rootC.x, rootC.y).strength(C.radialStrength))
    .force('side-x', forceX<FNode>(d => d.side === 'LEFT' ? (rootC.x - ring * (d.depth || 1)) : (rootC.x + ring * (d.depth || 1))).strength(C.sideStrength))
    .force('band-y', forceY<FNode>(rootC.y).strength(C.bandYStrength));

  for (let k = 0; k < iters; k++) sim.tick();
  sim.stop();

  // Write back top-left positions (non-root only)
  const out = new Map<string, Pos>();
  fNodes.forEach(n => {
    if (n.id === rootId) return;
    out.set(n.id, { x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h });
  });
  return out;
}
