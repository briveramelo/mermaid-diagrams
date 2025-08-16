import React, {useState} from "react";
import MermaidWrapper from "@/components/MermaidWrapper.tsx";
import db from "@/diagrams/databricks_concepts.md?raw";
import med from "@/diagrams/medallion.md?raw";
import db_mind from "@/diagrams/databricks_concepts_mindmap.md?raw";
import simple_mind from "@/diagrams/simple_mindmap.md?raw";
import DrawIoViewer from "@/components/DrawIoViewer.tsx";

export default function App() {
  const [drawIoXml, setDrawIoXml] = useState<string>('');

  return (
    <div className="app">
      <MermaidWrapper
        rawMermaidFileText={simple_mind}
        onDrawIoXml={setDrawIoXml}
      />
      {drawIoXml && (
        <DrawIoViewer xmlData={drawIoXml}/>
      )}
    </div>
  );
}