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
      >
        {({zoomIn, zoomOut, resetTransform, setTransform}: ReactZoomPanPinchContentRef) => (
          <>
            <div style={{display: "flex", gap: 8, alignItems: "center", marginBottom: 12, overflow: 'visible'}}>
              <div>{scale.toFixed(1)}</div>
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
              <button type="button" onClick={() => resetTransform()} aria-label="Reset zoom">Reset</button>
              <button type="button" onClick={() => downloadSvg(containerRef)} aria-label="Download SVG">Download SVG
              </button>
            </div>

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