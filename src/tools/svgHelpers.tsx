// ---------- Small SVG helpers ----------
export const qs = <T extends Element>(root: ParentNode, sel: string) => Array.from(root.querySelectorAll<T>(sel));
export const bbox = (el: SVGGraphicsElement) => el.getBBox();
export const by = (cls: string, re: RegExp) => Array.from(cls.match(re) || [])[1];

const unionBBox = (bs: DOMRect[]) => {
  if (!bs.length) return null;
  const xs = bs.map(b => b.x), ys = bs.map(b => b.y);
  const xe = bs.map(b => b.x + b.width), ye = bs.map(b => b.y + b.height);
  const x = Math.min(...xs), y = Math.min(...ys);
  return {x, y, width: Math.max(...xe) - x, height: Math.max(...ye) - y};
};

export const updateViewBox = (svg: SVGSVGElement) => {
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

export const toScreen = (svg: SVGSVGElement, m: DOMMatrix, x: number, y: number, ) => {
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
export const toLocal = (svg: SVGSVGElement, invT: DOMMatrix, sx: number, sy: number) => {
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