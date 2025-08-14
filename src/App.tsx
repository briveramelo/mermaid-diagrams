import React, {useRef, useState} from "react";
import db from "@/diagrams/databricks_concepts.md?raw";
import type {ReactZoomPanPinchRef, ReactZoomPanPinchContentRef} from "react-zoom-pan-pinch";
import MermaidWrapper from "@/components/MermaidWrapper.tsx";

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [scale, setScale] = useState(1);
  const [config, setConfig] = useState({
    minScale: 0.25,
    maxScale: 10,
    step: .3,
  })

  return (
    <div className="app" style={{display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'visible'}}>
      <h1>Mermaid + ELK (React)</h1>

      <MermaidWrapper rawMermaidFileText={db} />
    </div>
  );
}