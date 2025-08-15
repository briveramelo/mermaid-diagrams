import React, { RefObject, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';

type LayerConfig = {
  nodeFontSize: number;
  nodePadding: number;
  edgeStrokeWidth: number;
  layerScale: number;
  color: string;
};

type MindMapFormatterProps = {
  containerRef: RefObject<HTMLElement | null>;
  layerCount: number; // maximum top-level branches
  minConfig: Omit<LayerConfig, 'layerScale' | 'color'>;
  maxConfig: Omit<LayerConfig, 'layerScale' | 'color'>;
  colors: string[]; // length should be >= layerCount
  scaleFactor: number;
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
      scaleFactor = 0.3,
    },
    ref
  ) => {
    const applyFormatting = useCallback(() => {
      if (!containerRef.current) return;
      const svg = containerRef.current.querySelector('svg');
      if (!svg) return;

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
        svg
          .querySelectorAll<SVGGraphicsElement>(`.mindmap-edges .section-${secNum} path, .mindmap-edges .section-${secNum} line`)
          .forEach(edge => {
            edge.style.stroke = color ?? '';
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
        const layerScale = 1 - depthRatio * scaleFactor;

        // Text styling
        node.querySelectorAll('text').forEach((txt) => {
          (txt as SVGTextElement).style.fill = color ?? '';
          (txt as SVGTextElement).style.fontSize = `${nodeFontSize}px`;
        });

        // Optional: if shapes exist inside this node group, set stroke width to reflect depth
        node.querySelectorAll('path, line').forEach((edge) => {
          (edge as SVGGraphicsElement).style.strokeWidth = `${edgeStrokeWidth}px`;
        });

        // Scale node (strip any prior scale() to avoid accumulation)
        const prev = node.getAttribute('transform') || '';
        const cleaned = prev.replace(/\s*scale\([^)]*\)/g, '');
        node.setAttribute('transform', `${cleaned} scale(${layerScale})`.trim());
      });
    }, [containerRef, layerCount, minConfig, maxConfig, colors, scaleFactor]);

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
      observer.observe(containerRef.current, { childList: true, subtree: true });

      return () => {
        cancelAnimationFrame(rafId);
        observer?.disconnect();
      };
    }, [containerRef, applyFormatting]);

    return null;
  }
);

MindMapFormatter.displayName = 'MindMapFormatter';

export { MindMapFormatter };
