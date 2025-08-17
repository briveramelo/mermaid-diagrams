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
        // Tag tree structure (adds depth data attributes) before
        // applying mm-depth-* classes so deeper nodes are handled
        tagMindmapTree(el, mermaid_text);
        tagMindmapNodesByDepth(el);
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

// Tag rendered SVG nodes with `mm-depth-*` classes using existing `data-depth` attributes
function tagMindmapNodesByDepth(container: HTMLElement) {
  const svg = container.querySelector('svg');
  if (!svg) return;

  const nodeEls = Array.from(svg.querySelectorAll<SVGGElement>('g.mindmap-node'));
  const rootIdx = nodeEls.findIndex(g => g.classList.contains('section-root'));
  const nodes = nodeEls.filter((_, idx) => idx !== rootIdx);

  const clean = (elm: SVGGElement) => {
    Array.from(elm.classList)
      .filter(c => /^mm-(depth|branch)-\d+$/.test(c))
      .forEach(c => elm.classList.remove(c));
    delete (elm as any).dataset.branch;
  };

  nodes.forEach((node) => {
    const depthAttr = (node as any).dataset?.depth;
    clean(node);
    if (depthAttr != null) {
      const depth = parseInt(depthAttr, 10);
      if (!Number.isNaN(depth)) {
        node.classList.add(`mm-depth-${depth}`);
        (node as any).dataset.depth = String(depth);
      }
    }
  });
}


// --- ELK helpers for mindmap tree tagging ---
type MMItem = { key: string; label: string; section: number; depth: number; parentKey: string | null };

// Parse the Mermaid mindmap into a simple tree with stable keys and parents
function parseMindmapTree(raw: string): MMItem[] {
  const items: MMItem[] = [];
  const lines = raw.split(/\r?\n/).map(l => l.replace(/\t/g, '  '));
  const mmIdx = lines.findIndex(l => /^\s*mindmap\s*$/i.test(l.trim()));
  if (mmIdx === -1) return items;
  let start = mmIdx + 1;
  while (start < lines.length && (!lines[start].trim() || /^%%/.test(lines[start].trim()))) start++;
  if (start >= lines.length) return items;

  const rootIndent = (lines[start].match(/^\s*/)?.[0].length ?? 0);

  type StackItem = { depth: number; section: number; key: string };
  const stack: StackItem[] = [];
  let currentSection = -1;

  for (let j = start; j < lines.length; j++) {
    const rawLine = lines[j];
    const trimmed = rawLine.trim();
    if (!trimmed || /^%%/.test(trimmed)) continue;
    if (trimmed === '---') continue;

    const indent = (rawLine.match(/^\s*/)?.[0].length ?? 0);
    const rel = Math.max(0, indent - rootIndent);
    const depth = Math.floor(rel / 2);

    const label = extractLabelFromSource(rawLine);

    if (j === start) {
      const key = `root-${normalizeLabel(label)}`;
      items.push({ key, label: normalizeLabel(label), section: -1, depth: 0, parentKey: null });
      stack[0] = { depth: 0, section: -1, key };
      continue;
    }

    if (stack.length > depth) stack.length = depth;

    let section: number;
    if (depth === 1) {
      currentSection += 1;
      section = currentSection;
    } else {
      section = stack[depth - 1]?.section ?? currentSection;
    }

    const parentKey = depth === 0 ? null : stack[depth - 1]?.key ?? `root-${normalizeLabel(items[0]?.label ?? '')}`;
    const key = `${section}-${normalizeLabel(label)}`;

    items.push({ key, label: normalizeLabel(label), section, depth, parentKey: parentKey ?? null });
    stack[depth] = { depth, section, key };
  }

  return items;
}

// After rendering, tag each DOM node with a stable id and parent id for ELK
function tagMindmapTree(container: HTMLElement, raw: string) {
  const svg = container.querySelector('svg');
  if (!svg) return;

  const items = parseMindmapTree(raw);
  if (!items.length) return;

  const itemsByLabelDepth = new Map<string, MMItem[]>();
  for (const it of items) {
    const k = `${it.label}|${it.depth}`;
    const arr = itemsByLabelDepth.get(k);
    if (arr) arr.push(it); else itemsByLabelDepth.set(k, [it]);
  }

  // Helper to extract the visible label text from a node group
  const labelFromNode = (g: SVGGElement): string => {
    const textEl = g.querySelector('text');
    if (textEl) {
      const allTspans = Array.from(textEl.querySelectorAll('tspan')) as SVGTSpanElement[];
      const leaf = allTspans.filter(ts => !ts.querySelector('tspan'));
      const parts = (leaf.length ? leaf : allTspans).map(ts => (ts.textContent ?? '').trim()).filter(Boolean);
      if (parts.length) return normalizeLabel(parts.join(' '));
      const tc = (textEl.textContent ?? '').trim();
      if (tc) return normalizeLabel(tc);
    }
    return '';
  };

  // Tag root first
  const rootGroup = svg.querySelector<SVGGElement>('g.mindmap-node.section-root');
  if (rootGroup) {
    const rootLabel = labelFromNode(rootGroup);
    const rootKey = `root-${rootLabel}`;
    (rootGroup as any).dataset.mmId = rootKey;
    (rootGroup as any).dataset.mmParent = '';
    (rootGroup as any).dataset.depth = '0';
  }

  // Tag non-root nodes
  const allNodeGroups = Array.from(svg.querySelectorAll<SVGGElement>('g.mindmap-node'));
  const nodes = allNodeGroups.filter(g => !g.classList.contains('section-root'));
  nodes.forEach((node) => {
    const depthAttr = (node as any).dataset?.depth;
    const depth = depthAttr != null ? parseInt(depthAttr, 10) : NaN;
    const label = labelFromNode(node);
    const candidates = itemsByLabelDepth.get(`${label}|${depth}`) ?? [];
    const item = candidates.shift();
    if (!item) return;
    (node as any).dataset.mmId = item.key;
    (node as any).dataset.mmParent = item.parentKey ?? '';
    (node as any).dataset.depth = String(item.depth);
  });
}