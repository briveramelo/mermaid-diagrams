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

// Helpers for consistent label handling
function normalizeLabel(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

// Extract a display label from a Mermaid mindmap source line.
// Handles shapes like `root((Label))` and strips trailing class tags `:::class`.
function extractLabelFromSource(rawLine: string): string {
  const line = rawLine.replace(/:::.*$/, '').trim();
  // root((Label)) / ((Label)) pattern
  const m = line.match(/^(?:[^:(\[]+)?\s*\(\((.*?)\)\)\s*$/);
  if (m) return normalizeLabel(m[1]);
  return normalizeLabel(line);
}

// 1) Parse depths from Mermaid text, keyed by `{section}-{label}` (root = depth 0, but we skip tagging it)
function parseMindmapDepths(raw: string): Map<string, number> {
  const depthByKey = new Map<string, number>();

  const lines = raw.split(/\r?\n/).map(l => l.replace(/\t/g, '  '));
  const content = lines.filter(l => l.trim() && !/^%%/.test(l.trim()));

  let i = 0;
  if (/^mindmap\s*$/i.test(content[0]?.trim() ?? '')) i = 1;
  if (i >= content.length) return depthByKey;

  const rootIndent = (content[i].match(/^\s*/)?.[0].length ?? 0);

  type StackItem = { depth: number; section: number };
  const stack: StackItem[] = [];
  let currentSection = -1;

  for (let j = i; j < content.length; j++) {
    const rawLine = content[j];
    const indent = (rawLine.match(/^\s*/)?.[0].length ?? 0);
    const rel = Math.max(0, indent - rootIndent);
    const depth = Math.floor(rel / 2); // assumes 2 spaces per level
    const label = extractLabelFromSource(rawLine);

    // First content line after `mindmap` is the root (skip tagging it)
    if (j === i) {
      stack[0] = { depth: 0, section: -1 };
      continue;
    }

    // Maintain ancestor stack up to this depth
    if (stack.length > depth) stack.length = depth;

    // Determine section: depth 1 defines a new section in source order
    let section: number;
    if (depth === 1) {
      currentSection += 1;
      section = currentSection;
    } else {
      section = stack[depth - 1]?.section ?? currentSection;
    }

    stack[depth] = { depth, section };

    const key = `${section}-${normalizeLabel(label)}`;
    depthByKey.set(key, depth);
  }

  return depthByKey;
}

// 2) Tag rendered SVG nodes based on parsed depths keyed by `{section}-{label}`
function tagMindmapNodesByDepth(container: HTMLElement, raw: string) {
  const svg = container.querySelector('svg');
  if (!svg) return;

  const nodeEls = Array.from(svg.querySelectorAll<SVGGElement>('.mindmap-nodes > g.mindmap-node'));
  const rootIdx = nodeEls.findIndex(g => g.classList.contains('section-root'));
  const nodes = nodeEls.filter((_, idx) => idx !== rootIdx);

  const depthByKey = parseMindmapDepths(raw);

  const clean = (elm: SVGGElement) => {
    Array.from(elm.classList)
      .filter(c => /^mm-(depth|branch)-\d+$/.test(c))
      .forEach(c => elm.classList.remove(c));
    delete (elm as any).dataset.depth;
    delete (elm as any).dataset.branch;
  };

  nodes.forEach((node) => {
    const cls = node.getAttribute('class') || '';
    const secMatch = cls.match(/section-(\d+)/);
    if (!secMatch) return;
    const section = parseInt(secMatch[1], 10);

    // Extract the visible label text from the node
    const label = normalizeLabel(
      Array.from(node.querySelectorAll('text'))
        .map(t => t.textContent || '')
        .join(' ')
    );

    const key = `${section}-${label}`;
    const depth = depthByKey.get(key);

    clean(node);
    if (depth != null) {
      node.classList.add(`mm-depth-${depth}`);
      (node as any).dataset.depth = String(depth);
    }
  });
}
