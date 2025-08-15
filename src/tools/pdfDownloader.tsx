import jsPDF from 'jspdf'
import type React from 'react'
import {getSvgNode, serializeSvg} from '@/tools/svgDownloader'

/**
 * Export the first `<svg>` inside the given container to a vector PDF.
 * Uses svg2pdf.js to preserve text and shapes without rasterization.
 */
export async function downloadPdf(
  containerRef: React.RefObject<HTMLDivElement | null>,
  fileName = 'diagram.pdf'
) {
  const data = getSvgNode(containerRef)
  if (!data) throw new Error('downloadPdf: missing SVG root')

  // Wait for fonts so measurements and wrapping are stable
  try {
    if (document.fonts?.ready) await document.fonts.ready
  } catch {}

  const pxToPt = 72 / 96
  const widthPt = data.width * pxToPt
  const heightPt = data.height * pxToPt

  const doc = new jsPDF({
    unit: 'pt',
    format: [widthPt, heightPt],
    putOnlyUsedFonts: true,
    compress: true,
  })

  // Lazy-load svg2pdf to keep bundle small and satisfy TypeScript
  const {svg2pdf}: any = await import('svg2pdf.js')
  svg2pdf(data.element, doc, {x: 0, y: 0, width: widthPt, height: heightPt})

  doc.save(fileName)
}
