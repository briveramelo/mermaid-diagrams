import { serializeSvgFrom } from "@/tools/svgSerializer.tsx"
import React from "react";

const escapeXml = (str: string) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

/**
 * Converts an SVG diagram into a draw.io compatible mxfile XML string.
 */
export const serializeDrawIoFrom = (
  containerRef: React.RefObject<HTMLDivElement | null>,
): string | null => {
  const data = serializeSvgFrom(containerRef)
  if (!data) return null

  const parser = new DOMParser()
  const doc = parser.parseFromString(data.xml, "image/svg+xml")
  const svg = doc.documentElement
  const width = parseFloat(svg.getAttribute("width") || "1000")
  const height = parseFloat(svg.getAttribute("height") || "1000")

  let id = 1
  const cells: string[] = ["<mxCell id=\"0\"/>", "<mxCell id=\"1\" parent=\"0\"/>"]

  svg.querySelectorAll("rect").forEach((rect) => {
    const x = rect.getAttribute("x") || "0"
    const y = rect.getAttribute("y") || "0"
    const w = rect.getAttribute("width") || "0"
    const h = rect.getAttribute("height") || "0"
    const fill = rect.getAttribute("fill") || "none"
    const stroke = rect.getAttribute("stroke") || "#000000"
    const label = rect.parentElement?.querySelector("text")?.textContent || ""
    const cellId = ++id
    const style = `rounded=0;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};`
    cells.push(
      `<mxCell id=\"${cellId}\" value=\"${escapeXml(label)}\" style=\"${style}\" vertex=\"1\" parent=\"1\"><mxGeometry x=\"${x}\" y=\"${y}\" width=\"${w}\" height=\"${h}\" as=\"geometry\"/></mxCell>`
    )
  })

  svg.querySelectorAll("path").forEach((path) => {
    const d = path.getAttribute("d")
    if (!d) return
    const match = d.match(/M\s*([\d.-]+)[, ]([\d.-]+).*L\s*([\d.-]+)[, ]([\d.-]+)/)
    if (!match) return
    const [, x1, y1, x2, y2] = match
    const stroke = path.getAttribute("stroke") || "#000000"
    const cellId = ++id
    const style = `edgeStyle=none;rounded=0;html=1;strokeColor=${stroke};`
    cells.push(
      `<mxCell id=\"${cellId}\" value=\"\" style=\"${style}\" edge=\"1\" parent=\"1\"><mxGeometry relative=\"1\" as=\"geometry\"><mxPoint x=\"${x1}\" y=\"${y1}\" as=\"sourcePoint\"/><mxPoint x=\"${x2}\" y=\"${y2}\" as=\"targetPoint\"/></mxGeometry></mxCell>`
    )
  })

  svg.querySelectorAll("text").forEach((text) => {
    const label = text.textContent || ""
    const x = text.getAttribute("x") || "0"
    const y = text.getAttribute("y") || "0"
    const fontSize = text.getAttribute("font-size") || "12"
    const cellId = ++id
    const style = `shape=text;whiteSpace=wrap;html=1;fontSize=${fontSize};`
    cells.push(
      `<mxCell id=\"${cellId}\" value=\"${escapeXml(label)}\" style=\"${style}\" vertex=\"1\" parent=\"1\"><mxGeometry x=\"${x}\" y=\"${y}\" width=\"0\" height=\"0\" as=\"geometry\"/></mxCell>`
    )
  })

  const xml = `<mxfile host=\"mermaid\"><diagram name=\"Page-1\"><mxGraphModel dx=\"${width}\" dy=\"${height}\" grid=\"1\" gridSize=\"10\" guides=\"1\" tooltips=\"1\" connect=\"1\" arrows=\"1\" fold=\"1\" page=\"1\" pageScale=\"1\" pageWidth=\"${width}\" pageHeight=\"${height}\" math=\"0\" shadow=\"0\"><root>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`

  return xml
}

export default serializeDrawIoFrom
