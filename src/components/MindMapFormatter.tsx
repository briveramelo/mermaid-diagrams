// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ELK from 'elkjs/lib/elk.bundled.js';
import React, {RefObject, useEffect, useImperativeHandle, forwardRef, useCallback} from 'react';

type LayerConfig = {
  nodeFontSize: number;
  nodePadding: number;
  edgeStrokeWidth: number;
  boxScale: number;
  layerScale: number;
  color: string;
};

type MindMapFormatterProps = {
  containerRef: RefObject<HTMLElement | null>;
  layerCount: number; // maximum top-level branches
  minConfig: Omit<LayerConfig, 'layerScale' | 'color'>;
  maxConfig: Omit<LayerConfig, 'layerScale' | 'color'>;
  colors: string[]; // length should be >= layerCount
};

export type MindMapFormatterHandle = {
  /** Manually re-apply the formatting rules to the current SVG */
  refresh: () => void;
};

const MindMapFormatter = forwardRef<MindMapFormatterHandle, MindMapFormatterProps>(
  (
    {
      containerRef,
      layerCount,
      minConfig,
      maxConfig,
      colors,
    },
    ref
  ) => {
    const applyFormatting = useCallback(async () => {
      if (!containerRef.current) return;
      const svg = containerRef.current.querySelector('svg');
      if (!svg) return;

      // ===== ELK RADIAL LAYOUT (positions only; keep our styling) =====
      const doElkLayout = async () => {
        const elk = new ELK();
        const allNodeGroups = Array.from(svg.querySelectorAll<SVGGElement>('.mindmap-nodes > g.mindmap-node'));
        if (allNodeGroups.length === 0) return;

        // Build node/edge sets from data attributes tagged in MermaidBlock.tsx
        type GInfo = { g: SVGGElement; id: string; parent?: string | null; section?: number; w: number; h: number };
        const infos: GInfo[] = allNodeGroups.map(g => {
          const bbox = (g as unknown as SVGGraphicsElement).getBBox();
          const id = (g as any).dataset.mmId as string | undefined;
          const parent = ((g as any).dataset.mmParent as string | undefined) ?? null;
          const secMatch = Array.from(g.classList).find(c => /^section-(\d+)$/.test(c));
          const section = secMatch ? parseInt(secMatch!.match(/^section-(\d+)$/)![1], 10) : undefined;
          return { g, id: id || '', parent, section, w: bbox.width || 10, h: bbox.height || 10 };
        }).filter(i => i.id);

        if (!infos.length) return;

        const root = infos.find(i => i.id.startsWith('root-')) || infos.find(i => !i.parent);
        if (!root) return;

        const elkGraph = {
          id: 'mind-root',
          layoutOptions: {
            'elk.algorithm': 'layered',
            // Sibling spacing along the same ring
            'org.eclipse.elk.spacing.nodeNode': '28',
            // Outer padding
            'org.eclipse.elk.padding': '{top:16,left:16,bottom:16,right:16}',
          },
          children: infos.map(n => ({ id: n.id, width: Math.max(1, n.w), height: Math.max(1, n.h) })),
          edges: infos
            .filter(n => n.parent && !n.id.startsWith('root-'))
            .map(n => ({ id: `${n.parent}->${n.id}` , sources: [n.parent!], targets: [n.id] })),
        } as const;

        const laidOut = await elk.layout(elkGraph as any);
        const posById = new Map<string, { x: number; y: number; w: number; h: number }>();
        for (const c of (laidOut.children || [])) {
          posById.set(c.id, { x: c.x || 0, y: c.y || 0, w: c.width || 0, h: c.height || 0 });
        }

        // Place nodes: override outer <g> transform with ELK coordinates
        infos.forEach(info => {
          const p = posById.get(info.id);
          if (!p) return;
          // preserve original transform if needed
          const base = info.g.getAttribute('data-elk-base-transform') ?? (info.g.getAttribute('transform') || '');
          if (!info.g.hasAttribute('data-elk-base-transform')) {
            info.g.setAttribute('data-elk-base-transform', base);
          }
          info.g.setAttribute('transform', `translate(${p.x},${p.y})`);
        });

        // Redraw edges to match ELK positions
        const edgesGroup = svg.querySelector('.mindmap-edges');
        if (edgesGroup) {
          edgesGroup.innerHTML = '';
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.setAttribute('class', 'elk-edges');
          (laidOut.edges || []).forEach(e => {
            const src = posById.get(e.sources[0]);
            const tgt = posById.get(e.targets[0]);
            if (!src || !tgt) return;
            const x1 = src.x + src.w / 2;
            const y1 = src.y + src.h / 2;
            const x2 = tgt.x + tgt.w / 2;
            const y2 = tgt.y + tgt.h / 2;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            // simple curved edge (quadratic)
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            path.setAttribute('d', `M ${x1},${y1} Q ${mx},${my} ${x2},${y2}`);
            // try to color by child section if available
            const childInfo = infos.find(i => i.id === e.targets[0]);
            if (childInfo?.section != null) path.setAttribute('class', `edge section-edge-${childInfo.section}`);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('vector-effect', 'non-scaling-stroke');
            g.appendChild(path);
          });
          edgesGroup.appendChild(g);
          // --- Expand root SVG viewport to fit new layout (prevents cropping) ---
          try {
            const nodesRoot = svg.querySelector('.mindmap-nodes') as SVGGElement | null;
            const elkEdges = svg.querySelector('.elk-edges') as SVGGElement | null;
            const bboxes: { x: number; y: number; width: number; height: number }[] = [];
            if (nodesRoot && (nodesRoot as any).getBBox) bboxes.push((nodesRoot as any).getBBox());
            if (elkEdges && (elkEdges as any).getBBox) bboxes.push((elkEdges as any).getBBox());
            if (bboxes.length) {
              const minX = Math.min(...bboxes.map(b => b.x));
              const minY = Math.min(...bboxes.map(b => b.y));
              const maxX = Math.max(...bboxes.map(b => b.x + b.width));
              const maxY = Math.max(...bboxes.map(b => b.y + b.height));
              const pad = 48; // viewport padding
              const vbX = Math.floor(minX - pad);
              const vbY = Math.floor(minY - pad);
              const vbW = Math.ceil((maxX - minX) + 2 * pad);
              const vbH = Math.ceil((maxY - minY) + 2 * pad);

              // Preserve original viewBox once for resets/debugging
              const baseVB = svg.getAttribute('viewBox') || '';
              if (!svg.hasAttribute('data-mmf-base-viewBox') && baseVB) {
                svg.setAttribute('data-mmf-base-viewBox', baseVB);
              }

              svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
              svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

              // Optional: make sure width/height do not force cropping; prefer responsive size
              // If you want a flexible container, keep width/height as-is or set to 100% in CSS.
              // Here we leave width/height untouched to avoid unintended layout shifts.
            }
          } catch { /* ignore viewBox update errors */ }
        }
      };

      // Run ELK layout once before styling; ignore errors to keep UI resilient
      try { await doElkLayout(); } catch (e) { /* noop */ }

      // --- Color helpers for stroke-aware opaque fills that mimic transparency ---
      const parseRGB = (str: string): [number, number, number] | null => {
        // Supports: rgb(r, g, b) and rgba(r, g, b, a)
        const m = str.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (m) return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
        // Supports: #rrggbb
        const mh = str.match(/^#([0-9a-f]{6})$/i);
        if (mh) {
          const n = parseInt(mh[1], 16);
          return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }
        return null;
      };

      const toRGBString = (rgb: [number, number, number]) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

      const blendOver = (fg: [number, number, number], bg: [number, number, number], alpha: number): [number, number, number] => {
        const a = Math.max(0, Math.min(1, alpha));
        return [
          Math.round(fg[0] * a + bg[0] * (1 - a)),
          Math.round(fg[1] * a + bg[1] * (1 - a)),
          Math.round(fg[2] * a + bg[2] * (1 - a)),
        ];
      };

      // Determine the canvas background color to blend against
      const containerEl = containerRef.current as HTMLElement;
      const computedBg = getComputedStyle(containerEl).backgroundColor || '#0b1220';
      const bgRGB = parseRGB(computedBg) ?? [11, 18, 32];

      // Gather all nodes (flat list) excluding the root
      const allNodeGroups = Array.from(svg.querySelectorAll<SVGGElement>('.mindmap-nodes > g.mindmap-node'));
      const nodes = allNodeGroups.filter(g => !g.classList.contains('section-root'));
      if (nodes.length === 0) return;

      // Build section ordering and map to color index using existing .section-N classes
      const sectionRe = /^section-(\d+)$/;
      const sectionNums: number[] = [];
      nodes.forEach(n => {
        const sc = Array.from(n.classList).find(c => sectionRe.test(c));
        if (sc) {
          const s = parseInt(sc.match(sectionRe)![1], 10);
          if (!sectionNums.includes(s)) sectionNums.push(s);
        }
      });
      sectionNums.sort((a, b) => a - b);

      const sectionToColorIndex = new Map<number, number>();
      const actualCount = Math.min(layerCount, sectionNums.length);
      for (let i = 0; i < actualCount; i++) {
        sectionToColorIndex.set(sectionNums[i], i);
      }

      // Helper: depth from data attribute or class
      const getDepth = (g: SVGGElement) => {
        const d = (g as any).dataset?.depth;
        if (d != null) {
          const v = parseInt(d as string, 10);
          if (!Number.isNaN(v)) return v;
        }
        const cls = Array.from(g.classList).find(c => /^mm-depth-(\d+)$/.test(c));
        if (cls) return parseInt(cls.split('-').pop()!, 10);
        return 1; // default
      };

      const depths = nodes.map(getDepth);
      const maxDepth = Math.max(1, ...depths);

      // Style edges per section color (optional but useful for visual grouping)
      sectionNums.slice(0, actualCount).forEach((secNum, idx) => {
        const color = colors[idx];

        // Mermaid/renderer seems to use both `section-*` wrappers and `section-edge-*` directly on edges.
        // Cover both patterns robustly.
        const selector = `.mindmap-edges .section-edge-${secNum}`;

        svg.querySelectorAll<SVGGraphicsElement>(selector).forEach(edge => {
          edge.style.stroke = color ?? '';
          // Ensure fills on paths are not visible for edges
          if ((edge as SVGPathElement).tagName.toLowerCase() === 'path') {
            (edge as SVGPathElement).style.fill = 'none';
          }
        });
      });

      // Apply per-node styles based on SECTION (color) and DEPTH (size/scale)
      nodes.forEach((node) => {
        const sc = Array.from(node.classList).find(c => sectionRe.test(c));
        if (!sc) return;
        const secNum = parseInt(sc.match(sectionRe)![1], 10);
        const colorIndex = sectionToColorIndex.get(secNum);
        const color = colorIndex != null ? colors[colorIndex] : colors[secNum % colors.length];

        const depth = getDepth(node);
        const depthRatio = maxDepth <= 1 ? 0 : (depth - 1) / (maxDepth - 1); // 0 at depth 1, 1 at deepest

        const nodeFontSize =
          maxConfig.nodeFontSize - depthRatio * (maxConfig.nodeFontSize - minConfig.nodeFontSize);
        const edgeStrokeWidth =
          maxConfig.edgeStrokeWidth - depthRatio * (maxConfig.edgeStrokeWidth - minConfig.edgeStrokeWidth);
        const layerScale = maxConfig.boxScale - depthRatio * (maxConfig.boxScale - minConfig.boxScale);

        // Box/background styling: colorize shapes to match section color
        // and sync stroke width with depth. We now use an opaque fill that visually mimics the old transparency.
        const shapes = node.querySelectorAll<SVGGraphicsElement>('path, rect, polygon, circle, line');
        // Previous semi-transparent feel, now baked into an opaque color
        const desiredAlpha = Math.max(0, Math.min(1, 0.12 + (1 - depthRatio) * 0.08));

        // Convert the section color to RGB; if parsing fails, fall back to using the raw color string
      const fgRGB = color ? parseRGB(color) : null;
        const blendedFill = fgRGB ? toRGBString(blendOver(fgRGB, bgRGB, desiredAlpha)) : (color ?? '');

        shapes.forEach((shape) => {
          // Keep strokes at the original vivid section color
          shape.style.stroke = color ?? '';
          shape.style.strokeWidth = `${edgeStrokeWidth}px`;

          // Use an **opaque** fill that visually matches the old transparent look
          shape.style.fill = blendedFill;
          shape.style.fillOpacity = '1';
        });

        // Text styling
        node.querySelectorAll('text').forEach((txt) => {
          (txt as SVGTextElement).style.fill = color ?? '';
          (txt as SVGTextElement).style.fontSize = `${nodeFontSize}px`;
        });

        // Optional: if shapes exist inside this node group, set stroke width to reflect depth
        node.querySelectorAll('path, line').forEach((edge) => {
          (edge as SVGGraphicsElement).style.strokeWidth = `${edgeStrokeWidth}px`;
        });

        // Align SHAPES to TEXT by centers, then scale around the TEXT center
        const applyCenteredScaleAligned = (target: Element | null, anchor: Element | null) => {
          if (!target || !anchor) return;
          const t = target as unknown as SVGGraphicsElement;
          const a = anchor as unknown as SVGGraphicsElement;
          const svg = t.ownerSVGElement;
          if (!svg || !t.getBBox || !a.getBBox) return;

          // Compute local centers for target and anchor
          const tb = t.getBBox();
          const ab = a.getBBox();
          const tCenterLocal = { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 };
          const aCenterLocal = { x: ab.x + ab.width / 2, y: ab.y + ab.height / 2 };

          // Preserve the element's original (Mermaid) transform once and reuse it
          const current = t.getAttribute('transform') || '';
          const base = t.getAttribute('data-mmf-base-transform') ?? current;
          if (!t.hasAttribute('data-mmf-base-transform')) {
            t.setAttribute('data-mmf-base-transform', base);
          }

          // Temporarily reset to base before measuring matrices to avoid compounding
          if (current !== base) t.setAttribute('transform', base);

          const tCTM = t.getCTM();
          const aCTM = a.getCTM();
          if (!tCTM || !aCTM) {
            // Restore base just in case and bail
            t.setAttribute('transform', base);
            return;
          }

          const toScreen = (x: number, y: number, m: DOMMatrix) => {
            if (typeof (window as any).DOMPoint === 'function') {
              const p = new DOMPoint(x, y).matrixTransform(m as any);
              return { x: p.x, y: p.y };
            }
            const p = (svg as any).createSVGPoint();
            p.x = x; p.y = y;
            const r = p.matrixTransform(m as any);
            return { x: r.x, y: r.y };
          };

          const invT = tCTM.inverse();
          const toTargetLocal = (sx: number, sy: number) => {
            if (typeof (window as any).DOMPoint === 'function') {
              const p = new DOMPoint(sx, sy).matrixTransform(invT as any);
              return { x: p.x, y: p.y };
            }
            const p = (svg as any).createSVGPoint();
            p.x = sx; p.y = sy;
            const r = p.matrixTransform(invT as any);
            return { x: r.x, y: r.y };
          };

          // Convert each center to screen space, then into TARGET-LOCAL space
          const tCenterScreen = toScreen(tCenterLocal.x, tCenterLocal.y, tCTM as any);
          const aCenterScreen = toScreen(aCenterLocal.x, aCenterLocal.y, aCTM as any);
          const tCenterInTarget = toTargetLocal(tCenterScreen.x, tCenterScreen.y);
          const aCenterInTarget = toTargetLocal(aCenterScreen.x, aCenterScreen.y);

          // Delta required to align centers in TARGET-LOCAL coordinates
          const dx = aCenterInTarget.x - tCenterInTarget.x;
          const dy = aCenterInTarget.y - tCenterInTarget.y;

          // Rightmost op runs first in SVG. We want: align first, then scale around anchor.
          const composed = `${base} ` +
            `translate(${dx},${dy})` +
            `scale(${layerScale})`
          ;

          t.setAttribute('transform', composed.trim());
          (t as any).style.transformOrigin = 'center';
          (t as any).style.transformBox = 'fill-box';
        };

        // Mermaid structure: <g.mindmap-node>
        //   ├─ <g>  (shapes: rect/line/path)
        //   └─ <g>  (text container: may contain <rect.background> + <text>)
        const childGroups = Array.from(node.querySelectorAll(':scope > g')) as SVGGElement[];
        const shapesGroup = childGroups[0] ?? null;
        const textGroup = childGroups[1] ?? null;

        // Prefer aligning+scaling the SHAPES group to the TEXT group's center
        if (shapesGroup && textGroup) {
          applyCenteredScaleAligned(shapesGroup, textGroup);
        } else if (shapesGroup) {
          // Fallback: align to its own center
          applyCenteredScaleAligned(shapesGroup, shapesGroup);
        } else {
          // Last resort: scale the whole node to its own center
          applyCenteredScaleAligned(node, node);
        }
      });
    }, [containerRef, layerCount, minConfig, maxConfig, colors]);

    // Expose an imperative handle so parents can refresh on demand
    useImperativeHandle(
      ref,
      () => ({
        refresh: () => applyFormatting(),
      }),
      [applyFormatting]
    );

    useEffect(() => {
      if (!containerRef.current) return;

      let observer: MutationObserver | null = null;
      let rafId = 0;

      const scheduleApply = () => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => applyFormatting());
      };

      // Try immediately (in case the SVG is already present)
      const svg = containerRef.current.querySelector('svg');
      if (svg) {
        applyFormatting();
      }

      // Always observe for subsequent Mermaid DOM updates
      observer = new MutationObserver(scheduleApply);
      observer.observe(containerRef.current, {childList: true, subtree: true});

      return () => {
        cancelAnimationFrame(rafId);
        observer?.disconnect();
      };
    }, [containerRef, applyFormatting]);

    return null;
  }
);

MindMapFormatter.displayName = 'MindMapFormatter';

export {MindMapFormatter};
