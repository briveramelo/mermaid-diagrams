import { serializeSvgFrom } from "@/tools/svgSerializer.tsx"
import React from "react";

const escapeXml = (str: string) =>
  (str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

// Helpers for geometry + styles -------------------------------------------------
const toNum = (n: number) => Number.isFinite(n) ? Number(n.toFixed(2)) : 0

const getComputedFillStroke = (el: Element): { fill: string; stroke: string } => {
  // Prefer explicit attributes, fall back to computed style
  const cs = (el as HTMLElement) ? window.getComputedStyle(el as Element) : ({} as CSSStyleDeclaration)
  const fill = (el.getAttribute("fill") || (cs as any).fill || "none").toString()
  const stroke = (el.getAttribute("stroke") || (cs as any).stroke || "#000000").toString()
  return { fill, stroke }
}

const getAbsoluteBBox = (el: SVGGraphicsElement) => {
  // getBBox + CTM -> axis-aligned box in the root SVG coordinate space
  const bbox = el.getBBox()
  const ctm = el.getCTM()
  if (!ctm) {
    return { x: toNum(bbox.x), y: toNum(bbox.y), width: toNum(bbox.width), height: toNum(bbox.height) }
  }
  const points = [
    new DOMPoint(bbox.x, bbox.y),
    new DOMPoint(bbox.x + bbox.width, bbox.y),
    new DOMPoint(bbox.x, bbox.y + bbox.height),
    new DOMPoint(bbox.x + bbox.width, bbox.y + bbox.height),
  ].map(p => p.matrixTransform(ctm))
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return { x: toNum(minX), y: toNum(minY), width: toNum(maxX - minX), height: toNum(maxY - minY) }
}

const textFrom = (root: Element): string => {
  // Collect visible text content under this subtree
  const chunks: string[] = []
  root.querySelectorAll("text").forEach(t => {
    const s = (t.textContent || "").replace(/\s+/g, " ").trim()
    if (s) chunks.push(s)
  })
  return chunks.join("\n")
}

/**
 * Converts an SVG diagram into a draw.io compatible mxfile XML string.
 *
 * IMPORTANT: We now operate on the live SVG element returned by serializeSvgFrom
 * so that we can use getBBox()/getCTM() to compute absolute positions that
 * include all nested <g transform="..."> chains. This fixes the previous
 * behavior where x/y/width/height defaulted to 0 when attributes were missing.
 */
export const serializeDrawIoFrom = (
  containerRef: React.RefObject<HTMLDivElement | null>,
): string | null => {
  const data = serializeSvgFrom(containerRef)
  if (!data) return null

  const svgEl = (data as any).element as SVGSVGElement
  const width = Number((data as any).width) || Number((svgEl?.getAttribute("width") || 1000))
  const height = Number((data as any).height) || Number((svgEl?.getAttribute("height") || 1000))

  let id = 1
  const cells: string[] = ["<mxCell id=\"0\"/>", "<mxCell id=\"1\" parent=\"0\"/>"]

  // 1) Vertices: treat each mindmap node group as a single vertex using its bbox
  const nodeGroups = svgEl.querySelectorAll("g.mindmap-node")
  nodeGroups.forEach((g) => {
    const group = g as unknown as SVGGraphicsElement
    // Preferred background primitive to infer style (rect/path/circle)
    const bg = (g.querySelector(".node-bkg, rect.background, rect, circle, path") as SVGGraphicsElement) || group
    const { fill, stroke } = getComputedFillStroke(bg as Element)
    const { x, y, width: w, height: h } = getAbsoluteBBox(group)
    const label = textFrom(g)
    const cellId = ++id
    const style = `rounded=0;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};`
    cells.push(
      `
<mxCell id=\"${cellId}\" value=\"${escapeXml(label)}\" style=\"${style}\" vertex=\"1\" parent=\"1\">
  <mxGeometry x=\"${x}\" y=\"${y}\" width=\"${w}\" height=\"${h}\" as=\"geometry\"/>
</mxCell>`
    )
  })

  // 2) Edges: map each visible edge path to a draw.io edge using its endpoints
  const edgePaths = svgEl.querySelectorAll("g.mindmap-edges path")
  edgePaths.forEach((p) => {
    const path = p as unknown as SVGPathElement
    try {
      const total = path.getTotalLength()
      const p0 = path.getPointAtLength(0)
      const p1 = path.getPointAtLength(total)
      const { stroke } = getComputedFillStroke(path)
      const cellId = ++id
      const style = `edgeStyle=none;rounded=0;html=1;strokeColor=${stroke};`
      cells.push(
        `
<mxCell id=\"${cellId}\" value=\"\" style=\"${style}\" edge=\"1\" parent=\"1\">
  <mxGeometry relative=\"1\" as=\"geometry\">
    <mxPoint x=\"${toNum(p0.x)}\" y=\"${toNum(p0.y)}\" as=\"sourcePoint\"/>
    <mxPoint x=\"${toNum(p1.x)}\" y=\"${toNum(p1.y)}\" as=\"targetPoint\"/>
  </mxGeometry>
</mxCell>`
      )
    } catch (e) {
      // Some paths (e.g., with no length) can throw; skip them gracefully
    }
  })

  const xml = `
<mxfile host=\"mermaid\">
  <diagram name=\"Page-1\">
    <mxGraphModel dx=\"${toNum(width)}\" dy=\"${toNum(height)}\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"${toNum(width)}\" pageHeight=\"${toNum(height)}\" math=\"0\" shadow=\"0\">
      <root>${cells.join("")}</root>
    </mxGraphModel>
  </diagram>
</mxfile>`
  return xml
}

export default serializeDrawIoFrom
