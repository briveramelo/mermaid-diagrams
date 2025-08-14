import { useEffect, useRef } from "react";
import mermaid from "@/lib/mermaidSetup";

export interface MermaidBlockProps {
  rawMermaidFileText: string;
  className?: string;
}

export default function MermaidBlock({ rawMermaidFileText, className }: MermaidBlockProps) {
  const ref = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mermaid_text = extractMermaid(rawMermaidFileText);
    // Give each render a stable-ish id (if you render multiple blocks, make it unique per block)
    const id = `m-${Math.random().toString(36).slice(2)}`;

    (async () => {
      try {
        // Clear any previous content
        el.removeAttribute("data-processed");
        // Render to SVG and insert
        const { svg, bindFunctions } = await mermaid.render(id, mermaid_text);
        el.innerHTML = svg;
        bindFunctions?.(el);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [rawMermaidFileText]);

  return <pre className={`mermaid ${className || ""}`} ref={ref} />;
}

// Extract only the Mermaid diagram from Markdown. Supports ```mermaid fences,
// generic ```flowchart/graph fences, and strips YAML front matter if present.
function extractMermaid(input: string): string {
  const src = (input || "").trim();
  const mermaidFence = src.match(/```mermaid\s*([\s\S]*?)```/i);
  if (mermaidFence) {
    return mermaidFence[1].trim();
  }
  const genericFence = src.match(/```(?:flowchart|graph)[^\n]*\n([\s\S]*?)```/i);
  if (genericFence) return genericFence[1].trim();
  // Strip YAML front matter if the file starts with it
  if (src.startsWith("---")) {
    const end = src.indexOf("\n---", 3);
    if (end !== -1) return src.slice(end + 4).trim();
  }
  // Otherwise assume the entire string is a diagram
  return src;
}

