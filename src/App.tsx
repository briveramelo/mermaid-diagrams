import React from "react";
import MermaidWrapper from "@/components/MermaidWrapper.tsx";
import db from "@/diagrams/databricks_concepts.md?raw";
import med from "@/diagrams/medallion.md?raw";

export default function App() {
  return (
    <div className="app">
      <MermaidWrapper rawMermaidFileText={db} />
    </div>
  );
}