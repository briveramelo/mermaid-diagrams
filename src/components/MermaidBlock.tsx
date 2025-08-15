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
        tagMindmapNodesByDepth(el, mermaid_text);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [rawMermaidFileText]);

  return (
    <pre className={`mermaid ${className || ""}`} ref={ref} />
  );
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

// 1) Parse depths from Mermaid text (root = 0)
function parseMindmapDepths(raw: string): number[] {
  const lines = raw.split(/\r?\n/).map(l => l.replace(/\t/g, '  '));
  const content = lines.filter(l => l.trim() && !/^%%/.test(l.trim()));
  let i = 0;
  if (/^mindmap\s*$/i.test(content[0]?.trim() ?? '')) i = 1;
  if (i >= content.length) return [];
  const rootIndent = (content[i].match(/^\s*/)?.[0].length ?? 0);
  const depths: number[] = [];
  for (let j = i; j < content.length; j++) {
    const line = content[j];
    const indent = (line.match(/^\s*/)?.[0].length ?? 0);
    const rel = Math.max(0, indent - rootIndent);
    const depth = Math.floor(rel / 2); // assumes 2 spaces per level
    if (j === i) continue;            // skip the root line
    depths.push(depth);
  }
  return depths;
}

// 2) Tag rendered SVG nodes based on parsed depths
function tagMindmapNodesByDepth(container: HTMLElement, raw: string) {
  const svg = container.querySelector('svg');
  if (!svg) return;
  const elms = Array.from(svg.querySelectorAll<SVGGElement>('.mindmap-nodes > g.mindmap-node'));
  const rootIdx = elms.findIndex(g => g.classList.contains('section-root'));
  const nodes = elms.filter((_, idx) => idx !== rootIdx);
  const depths = parseMindmapDepths(raw);
  const n = Math.min(nodes.length, depths.length);

  const clean = (elm: SVGGElement) => {
    Array.from(elm.classList)
      .filter(c => /^mm-(depth|branch)-\d+$/.test(c))
      .forEach(c => elm.classList.remove(c));
    delete (elm as any).dataset.depth;
    delete (elm as any).dataset.branch;
  };

  for (let k = 0; k < n; k++) {
    const depth = depths[k];
    const node = nodes[k];
    clean(node);
    node.classList.add(`mm-depth-${depth}`);
    (node as any).dataset.depth = String(depth);
  }
}
