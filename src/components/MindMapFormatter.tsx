import React, {RefObject, useEffect} from 'react';

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

export const MindMapFormatter: React.FC<MindMapFormatterProps> = (
  {
    containerRef,
    layerCount,
    minConfig,
    maxConfig,
    colors,
    scaleFactor = 0.3,
  }
) => {
  useEffect(() => {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return;

    // Find top-level branch groups (levels)
    const level1Nodes = Array.from(svg.querySelectorAll<SVGGElement>('g[class*="node"]'))
      .filter((g) => {
        // Heuristic: top-level nodes often have a specific transform or small depth
        return g.querySelector('text')?.getAttribute('text-anchor') === 'middle';
      })
      .slice(1); // skip the root node

    const actualCount = Math.min(layerCount, level1Nodes.length);
    for (let i = 0; i < actualCount; i++) {
      const nodeGroup = level1Nodes[i];
      const ratio = i / (actualCount - 1 || 1);
      const config: LayerConfig = {
        ...minConfig,
        nodeFontSize: minConfig.nodeFontSize + ratio * (maxConfig.nodeFontSize - minConfig.nodeFontSize),
        nodePadding: minConfig.nodePadding + ratio * (maxConfig.nodePadding - minConfig.nodePadding),
        edgeStrokeWidth: minConfig.edgeStrokeWidth + ratio * (maxConfig.edgeStrokeWidth - minConfig.edgeStrokeWidth),
        layerScale: 1 - ratio * scaleFactor,
        color: colors[i],
      };

      // Apply styles to the subtree of this branch
      nodeGroup.querySelectorAll('text').forEach((txt) => {
        (txt as SVGTextElement).style.fill = config.color ?? '';
        (txt as SVGTextElement).style.fontSize = `${config.nodeFontSize}px`;
      });

      nodeGroup.querySelectorAll('path, line').forEach((edge) => {
        (edge as SVGGraphicsElement).style.stroke = config.color ?? '';
        (edge as SVGGraphicsElement).style.strokeWidth = `${config.edgeStrokeWidth}px`;
      });

      // Apply transform scale to the entire branch
      const prev = nodeGroup.getAttribute('transform') || '';
      nodeGroup.setAttribute('transform', `${prev} scale(${config.layerScale})`);
    }
  }, [containerRef, layerCount, minConfig, maxConfig, colors]);

  return null;
};