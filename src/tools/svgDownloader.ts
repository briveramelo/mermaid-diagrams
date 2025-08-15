import type React from 'react'

/**
 * Download the first <svg> element found inside the given container as a file.
 * The exported SVG is a direct clone of the on-screen markup so the downloaded
 * file matches what the user sees.
 */
export function downloadSvg(
  containerRef: React.RefObject<HTMLElement | null>,
  fileName = 'diagram.svg'
) {
  const xml = serializeSvg(containerRef)
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function serializeSvg(containerRef: React.RefObject<HTMLElement | null>): string{
  const svg = getSvgNode(containerRef)
  if(!svg) return ""

  return new XMLSerializer().serializeToString(svg as SVGSVGElement)
}

export function getSvgNode(containerRef: React.RefObject<HTMLElement | null>): Node | null{
  const svg = containerRef.current?.querySelector('svg') as Node | null
  if (!svg) return null

  const clone = svg.cloneNode(true)
  // Ensure the cloned SVG is standalone
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  }

  return clone;
}