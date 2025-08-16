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