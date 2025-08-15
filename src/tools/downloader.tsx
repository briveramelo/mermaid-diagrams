import jsPDF from "jspdf";
import {serializeSvgFrom} from "@/tools/svgSerializer.tsx";

/**
 * Exported: Download as SVG (vector, original XML)
 */
export const downloadSvg = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  fileName = 'diagram.svg'
) => {
  const data = serializeSvgFrom(containerRef)
  if (!data) return
  const blob = new Blob([data.xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Exported: Download as PDF. Uses svg2pdf.js to convert SVG directly to vector PDF.
 */
export const downloadPdf = async (
  containerRef: React.RefObject<HTMLDivElement | null>,
  options?: { fileName?: string }
) => {
  const data = serializeSvgFrom(containerRef)
  if (!data) return

  const { element, width, height } = data as any
  const orientation = width >= height ? 'l' : 'p'
  const pdf = new jsPDF({ orientation, unit: 'pt', format: [width, height] })

  const mod = await import('svg2pdf.js')
  const svg2pdfFn: any = (mod as any).default ?? (mod as any).svg2pdf ?? (mod as any)
  await svg2pdfFn(element as any, pdf as any, { xOffset: 0, yOffset: 0, scale: 1 })

  pdf.save(options?.fileName ?? 'diagram.pdf')
}