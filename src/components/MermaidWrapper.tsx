import React, {useRef, useState} from "react";
import MermaidBlock from "@/components/MermaidBlock";
import {TransformWrapper, TransformComponent} from "react-zoom-pan-pinch";
import type {ReactZoomPanPinchRef, ReactZoomPanPinchContentRef} from "react-zoom-pan-pinch";
import {downloadSvg} from "@/tools/downloader";

export interface MermaidWrapperProps {
  rawMermaidFileText: string;
}

export default function MermaidWrapper({rawMermaidFileText}: MermaidWrapperProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [scale, setScale] = useState(1);
  const [config, setConfig] = useState({
    minScale: 0.25,
    maxScale: 10,
    step: .3,
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
      centerOnInit={true}
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
                  resetTransform(200);
                  setTransform(
                    420,
                    15,
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
              wrapperStyle={{width: '100%', height: '100%', flex: 1, overflow: 'visible'}}
              contentStyle={{width: '100%', height: '100%', overflow: 'visible'}}
            >
              <div ref={containerRef}>
                <MermaidBlock rawMermaidFileText={rawMermaidFileText}/>
              </div>
            </TransformComponent>
        </>
      )}
    </TransformWrapper>
  );
}