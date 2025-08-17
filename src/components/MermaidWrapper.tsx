import React, {useEffect, useRef, useState} from "react";
import MermaidBlock from "@/components/MermaidBlock";
import {TransformWrapper, TransformComponent} from "react-zoom-pan-pinch";
import type {ReactZoomPanPinchRef, ReactZoomPanPinchContentRef} from "react-zoom-pan-pinch";
import {downloadSvg, downloadPdf, downloadDrawIo, getDrawIo} from "@/tools/downloader";
import {MindMapFormatter} from "@/components/MindMapFormatter.tsx";

export interface MermaidWrapperProps {
  rawMermaidFileText: string;
  onDrawIoXml?: (xml: string) => void;
}

export default function MermaidWrapper({rawMermaidFileText, onDrawIoXml}: MermaidWrapperProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [scale, setScale] = useState(1);
  const colors = [
    "#ef4444", // red
    "#38bdf8", // sky
    "#f97316", // orange
    "#6d28d9", // ultraviolet
    "#10b981", // emerald
    "#eab308", // yellow
    "#ec4899", // pink
    "#84cc16", // lime
    "#2563eb", // blue
    "#14b8a6", // teal
    "#c026d3", // magenta
    "#06b6d4", // cyan
    "#7c3aed", // violet
    "#4f46e5", // indigo
    "#d946ef", // fuchsia
  ];
  const [layerCount, setLayerCount] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const computeDepthCount = () => {
      const svg = container.querySelector("svg");
      if (!svg) return;
      const level1Nodes = Array.from(
        svg.querySelectorAll<SVGGElement>('.mindmap-node.mm-depth-1'),
      )
      const count = level1Nodes.length;
      if (colors.length < count) {
        console.warn(
          `Not enough colors: expected at least ${count}, but got ${colors.length}.`,
        );
      }
      setLayerCount(Math.min(count, colors.length));
    };

    const svg = container.querySelector("svg");
    let observer: MutationObserver | null = null;
    if (svg) {
      computeDepthCount();
    } else {
      observer = new MutationObserver(() => {
        const svgEl = container.querySelector("svg");
        if (svgEl) {
          computeDepthCount();
          observer?.disconnect();
        }
      });
      observer.observe(container, {childList: true, subtree: true});
    }

    return () => observer?.disconnect();
  }, [rawMermaidFileText, colors.length]);
  const [config, setConfig] = useState({
    minScale: 0.25,
    maxScale: 10,
    step: .3,
    startX: 0,
    startY: 0,
    drawIo: {
      scalingFactor: 2,
      shapeScaleFactor: 1,
    }
  })
  const [controlsVisible, setControlsVisible] = useState(true);

  return (
    <TransformWrapper
      ref={wrapperRef}
      initialScale={1}
      minScale={config.minScale}
      maxScale={config.maxScale}
      wheel={{step: config.step}}
      onInit={(ref) => setScale(ref.state.scale)}
      onTransformed={(ref, state) => setScale(state.scale)}
      limitToBounds={false}
      initialPositionX={config.startX}
      initialPositionY={config.startY}
    >
      {({zoomIn, zoomOut, resetTransform, setTransform}: ReactZoomPanPinchContentRef) => (
        <>
          {controlsVisible && (
            <div style={{position: 'fixed', top: 12, left: 12, display: 'flex', flexDirection: 'column', zIndex: 100}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <button
                  type="button"
                  onClick={() => setControlsVisible(false)}
                  aria-label="Hide controls"
                  title="Hide controls"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    padding: 0,
                    lineHeight: 1,
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: 'rgba(0,0,0,0.4)',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >×
                </button>
                <h1 style={{margin: 0, lineHeight: 1}}>Mermaid + ELK (React)</h1>
              </div>
              <div style={{display: "flex", gap: 8, alignItems: "center", marginBottom: 12}}>
                <button type="button" aria-label="Reset zoom" onClick={() => {
                  resetTransform(100);
                  setTransform(
                    config.startX,
                    config.startY,
                    1,
                    100,
                    "easeInOutCubic"
                  );
                }}
                >
                  Reset
                </button>
                <button type="button" onClick={() => zoomOut()} aria-label="Zoom out">−</button>
                <input
                  type="range"
                  min={config.minScale}
                  max={config.maxScale}
                  step={config.step}
                  value={scale}
                  onChange={(e) => {
                    const next = parseFloat(e.target.value);
                    const current = wrapperRef.current?.state;
                    setTransform(current?.positionX ?? 0, current?.positionY ?? 0, next);
                  }}
                  aria-label="Zoom level"
                  style={{width: 200}}
                />
                <button type="button" onClick={() => zoomIn()} aria-label="Zoom in">+</button>
              </div>
              <div style={{display: "flex", gap: 8, alignItems: "left", marginBottom: 12}}>
                <button type="button" onClick={() => downloadSvg(containerRef)} aria-label="Download SVG">Download SVG
                </button>
                <button type="button" onClick={() => downloadPdf(containerRef)} aria-label="Download PDF">Download PDF
                </button>
                <button type="button"
                        onClick={() => downloadDrawIo(containerRef, config.drawIo.scalingFactor, config.drawIo.scalingFactor, config.drawIo.scalingFactor)}
                        aria-label="Download draw.io">
                  Download draw.io
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const xml = getDrawIo(containerRef, config.drawIo.scalingFactor, config.drawIo.scalingFactor, config.drawIo.scalingFactor);
                    onDrawIoXml?.(xml);
                  }}
                  aria-label="Download draw.io"
                >
                  Render draw.io
                </button>
              </div>
            </div>
          )}
          {!controlsVisible && (
            <button
              type="button"
              onClick={() => setControlsVisible(true)}
              aria-label="Show controls"
              title="Show controls"
              style={{
                position: 'fixed',
                top: 12, left: 12,
                zIndex: 100,
                padding: 6,
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(0,0,0,0.4)',
                color: '#fff',
                lineHeight: 1,
                cursor: 'pointer'
              }}
            >☰</button>
          )}

          <TransformComponent
            wrapperStyle={{width: '100%', height: '100%', flex: 1, overflow: 'visible', cursor: 'move'}}
            contentStyle={{width: '100%', height: '100%', overflow: 'visible', cursor: 'move'}}
          >
            <div ref={containerRef}>
              <MermaidBlock rawMermaidFileText={rawMermaidFileText}/>
            </div>
          </TransformComponent>
          <MindMapFormatter
            containerRef={containerRef}
            layerCount={layerCount}
            maxConfig={{nodeFontSize: 24, nodePadding: 20, edgeStrokeWidth: 6, boxScale: 1.5, rootNodeScale: 1.2}}
            minConfig={{nodeFontSize: 12, nodePadding: 4, edgeStrokeWidth: 1, boxScale: .75, rootNodeScale: 1.2}}
            bucketConfig={
              {
                buckets: [
                  {dir: 'RIGHT', weight: 0.5},
                  {dir: 'LEFT', weight: 0.5},
                  // {dir: 'UP', weight: 0.05},
                  // {dir: 'DOWN', weight: 0.05},
                ]
              }}
            colors={colors}
            elkLayoutOptions={{
              'elk.algorithm': 'layered',
              'spacing.nodeNodeBetweenLayers': '20',
              'spacing.nodeNode': '10',
              'org.eclipse.elk.padding': '{top:12,left:12,bottom:12,right:12}',
            }}
            forceConfig={{
              enabled: true,
              iterations: 20,
              charge: -1500,
              collidePadding: 10,
              linkStrength: 0.3,
              linkDistanceScale: .1,
              firstLevelDistanceScale: .1, // shorten only level-1 edges
              radialStrength: 0.01,
              sideStrength: 0.001,
              bandYStrength: 0.215,
            }}
          />
        </>
      )}
    </TransformWrapper>
  );
}
