import React from "react";
import MermaidWrapper from "@/components/MermaidWrapper.tsx";
import db from "@/diagrams/databricks_concepts.md?raw";
import med from "@/diagrams/medallion.md?raw";
import db_mind from "@/diagrams/databricks_concepts_mindmap.md?raw";
import simple_mind from "@/diagrams/simple_mindmap.md?raw";

export default function App() {
  return (
    <div className="app">
      <MermaidWrapper rawMermaidFileText={db_mind} />
    </div>
  );
}