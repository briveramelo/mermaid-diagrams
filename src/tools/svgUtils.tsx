import React from 'react'

// ---------- Types ----------

export type PreparedSvg = {
  xml: string
  width: number
  height: number
  element: SVGSVGElement
  offsetX: number
  offsetY: number
}

// ---------- Low-level helpers ----------

const SVG_NS = 'http://www.w3.org/2000/svg'

export function getRootAndSvg(containerRef: React.RefObject<HTMLDivElement | null>):
  | { root: HTMLDivElement; svg: SVGSVGElement }
  | null {
  const root = containerRef.current
  if (!root) return null
  const svg = root.querySelector('svg') as SVGSVGElement | null
  if (!svg) return null
  return { root, svg }
}

export function cloneWithNamespaces(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  return clone
}

/** Inline computed styles so svg2pdf doesn't miss CSS-defined colors/fonts */
export function inlineComputedStyles(srcSvg: SVGSVGElement, clone: SVGSVGElement) {
  try {
    const srcNodes = srcSvg.querySelectorAll('*')
    const dstNodes = clone.querySelectorAll('*')
    srcNodes.forEach((srcEl, i) => {
      const dstEl = dstNodes[i] as Element | undefined
      if (!dstEl) return
      const cs = getComputedStyle(srcEl as Element)
      const pairs: Array<[string, string | null]> = [
        ['fill', cs.fill],
        ['stroke', cs.stroke],
        ['stroke-width', cs.strokeWidth],
        ['font-size', cs.fontSize],
        ['font-family', cs.fontFamily],
        ['font-weight', cs.fontWeight],
        ['color', cs.color], // for currentColor-based fills
        ['opacity', cs.opacity],
      ]
      for (const [k, v] of pairs) {
        if (v) (dstEl as Element).setAttribute(k, v)
      }
    })
  } catch {}
}

/** Ensure text remains visible even if CSS made fill transparent, by using computed color */
export function ensureTextVisibility(srcSvg: SVGSVGElement, clone: SVGSVGElement) {
  try {
    const srcText = srcSvg.querySelectorAll('text, tspan')
    const dstText = clone.querySelectorAll('text, tspan')
    const isNoneOrTransparent = (v: string | null) =>
      !v || v === 'none' || /rgba\([^)]*,\s*0\s*\)/i.test(v) || v === 'transparent'

    srcText.forEach((srcEl, i) => {
      const dstEl = dstText[i] as Element | undefined
      if (!dstEl) return
      const cs = getComputedStyle(srcEl as Element)
      const fill = cs.fill
      const color = cs.color
      if (isNoneOrTransparent(fill) && color) {
        dstEl.setAttribute('fill', color)
      }
    })
  } catch {}
}

/** Persist text alignment from CSS to attributes so svg2pdf honors it */
export function persistTextAlignment(srcSvg: SVGSVGElement, clone: SVGSVGElement) {
  try {
    const srcText = srcSvg.querySelectorAll('text, tspan')
    const dstText = clone.querySelectorAll('text, tspan')
    srcText.forEach((srcEl, i) => {
      const dstEl = dstText[i] as Element | undefined
      if (!dstEl) return
      const cs: any = getComputedStyle(srcEl as Element)
      const ta = cs.textAnchor || (srcEl as Element).getAttribute('text-anchor')
      const db = cs.dominantBaseline || (srcEl as Element).getAttribute('dominant-baseline')
      if (ta) dstEl.setAttribute('text-anchor', ta)
      if (db) dstEl.setAttribute('dominant-baseline', db)
    })
  } catch {}
}

/**
 * Replace <foreignObject> labels with centered <text>/<tspan> blocks (word-wrapped)
 * so that svg2pdf can render them.
 */
export function replaceForeignObjectsWithText(srcSvg: SVGSVGElement, clone: SVGSVGElement) {
  try {
    const fos = Array.from(srcSvg.querySelectorAll('foreignObject'))
    const fosClone = Array.from(clone.querySelectorAll('foreignObject'))

    const wrapToWidth = (text: string, maxWidth: number, font: string): string[] => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return [text]
      ctx.font = font
      const words = text.replace(/\s+/g, ' ').trim().split(' ')
      const lines: string[] = []
      let line = ''
      for (const w of words) {
        const test = line ? line + ' ' + w : w
        const width = ctx.measureText(test).width
        if (width <= maxWidth || !line) {
          line = test
        } else {
          lines.push(line)
          line = w
        }
      }
      if (line) lines.push(line)
      return lines
    }

    fos.forEach((fo, idx) => {
      const foClone = fosClone[idx] as SVGForeignObjectElement | undefined
      if (!foClone) return

      const rawHTML = (fo as any).innerHTML || ''
      const htmlForBreaks = rawHTML
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
      const textStr = (htmlForBreaks || (fo as any).textContent || '')
        .replace(/\u00A0/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .trim()
      if (!textStr) return

      // Geometry
      let bb: DOMRect | undefined
      try {
        bb = (fo as any).getBBox?.()
      } catch {}
      const x = bb?.x ?? Number(fo.getAttribute('x')) ?? 0
      const y = bb?.y ?? Number(fo.getAttribute('y')) ?? 0
      const w = bb?.width ?? Number(fo.getAttribute('width')) ?? 0
      const h = bb?.height ?? Number(fo.getAttribute('height')) ?? 0

      // Typography
      const cs = getComputedStyle(fo as Element)
      const fontSizePx = parseFloat(cs.fontSize || '14') || 14
      const lineHeight = (() => {
        const lh = cs.lineHeight
        const n = parseFloat(lh || '0')
        return !lh || lh === 'normal' || !isFinite(n) ? fontSizePx * 1.2 : n
      })()
      const fontWeight = cs.fontWeight || 'normal'
      const fontFamily = cs.fontFamily || 'sans-serif'
      const fillColor = cs.color || '#111'
      const font = `${fontWeight} ${fontSizePx}px ${fontFamily}`

      // Inspect inner label element for wrapping rules and alignment
      let inner = fo.querySelector('*') as HTMLElement | null
      const csInner = inner ? getComputedStyle(inner) : (cs as CSSStyleDeclaration)
      const whiteSpace = (csInner.whiteSpace || cs.whiteSpace || '').toLowerCase()
      const textAlign = (csInner.textAlign || cs.textAlign || 'center').toLowerCase()
      const wrapAllowed = !(whiteSpace.includes('nowrap') || whiteSpace === 'pre')

      // Compute wrapped lines to the available width inside FO
      const maxTextWidth = Math.max(1, Math.round(w || 0))
      let lines: string[]
      const explicit = textStr
        .split(/\r?\n/)
        .map((s: string) => s.trim())
        .filter(Boolean)
      if (!wrapAllowed) {
        lines = explicit.length > 0 ? explicit : [textStr]
      } else {
        const toWrap =
          explicit.length > 1 ? explicit.join(' ') : textStr.replace(/\r?\n/g, ' ')
        lines = wrapToWidth(toWrap, maxTextWidth, font)
      }

      // Center horizontally and vertically within the foreignObject bbox
      const xCenter = x + maxTextWidth / 2
      const blockHeight = lines.length * lineHeight
      const yStart = y + Math.max(fontSizePx, (h || blockHeight) / 2 - blockHeight / 2 + fontSizePx * 0.8)

      const text = document.createElementNS(SVG_NS, 'text')
      const anchor =
        textAlign === 'center' ? 'middle' : textAlign === 'right' ? 'end' : 'start'
      text.setAttribute('text-anchor', anchor)
      text.setAttribute('font-family', fontFamily)
      text.setAttribute('font-size', String(fontSizePx))
      text.setAttribute('font-weight', fontWeight)
      text.setAttribute('fill', fillColor)

      lines.forEach((line, iLine) => {
        const tspan = document.createElementNS(SVG_NS, 'tspan')
        tspan.setAttribute('x', String(xCenter))
        if (iLine === 0) tspan.setAttribute('y', String(yStart))
        else tspan.setAttribute('dy', String(lineHeight))
        tspan.textContent = line
        text.appendChild(tspan)
      })

      foClone.parentNode?.replaceChild(text, foClone)
    })
  } catch {}
}

export function bboxFromViewBoxAttr(el: SVGSVGElement): { x: number; y: number; width: number; height: number } | null {
  const vb = el.getAttribute('viewBox')
  if (!vb) return null
  const parts = vb.trim().split(/[ ,]+/)
  if (parts.length === 4) {
    return {
      x: Number(parts[0]) || 0,
      y: Number(parts[1]) || 0,
      width: Number(parts[2]) || 1,
      height: Number(parts[3]) || 1,
    }
  }
  return null
}

export function normalizeCoordinateSystem(
  clone: SVGSVGElement,
  bbox: { x: number; y: number; width: number; height: number }
): { width: number; height: number } {
  const g = document.createElementNS(SVG_NS, 'g')
  while (clone.firstChild) g.appendChild(clone.firstChild)
  g.setAttribute('transform', `translate(${-bbox.x}, ${-bbox.y})`)
  clone.appendChild(g)
  clone.setAttribute('viewBox', `0 0 ${Math.round(bbox.width)} ${Math.round(bbox.height)}`)
  const width = Math.max(1, Math.round(bbox.width))
  const height = Math.max(1, Math.round(bbox.height))
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  return { width, height }
}

export function injectBackgroundFromContainer(
  root: HTMLElement,
  clone: SVGSVGElement,
  width: number,
  height: number
) {
  try {
    const bgColor = getComputedStyle(root).backgroundColor
    const isTransparent =
      !bgColor || /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(bgColor) || bgColor === 'transparent'
    if (!isTransparent) {
      const bg = document.createElementNS(SVG_NS, 'rect')
      bg.setAttribute('x', '0')
      bg.setAttribute('y', '0')
      bg.setAttribute('width', String(width))
      bg.setAttribute('height', String(height))
      bg.setAttribute('fill', bgColor)
      clone.insertBefore(bg, clone.firstChild)
    }
  } catch {}
}

export function serializeClone(clone: SVGSVGElement) {
  const xml = new XMLSerializer().serializeToString(clone)
  return xml
}