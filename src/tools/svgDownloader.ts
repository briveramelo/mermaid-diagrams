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
  const svg = containerRef.current?.querySelector('svg') as SVGSVGElement | null
  if (!svg) return

  const clone = svg.cloneNode(true) as SVGSVGElement
  // Ensure the cloned SVG is standalone
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  }

  const xml = new XMLSerializer().serializeToString(clone)
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
