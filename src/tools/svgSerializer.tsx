import {
  bboxFromViewBoxAttr,
  cloneWithNamespaces,
  ensureTextVisibility,
  getRootAndSvg, injectBackgroundFromContainer,
  inlineComputedStyles, normalizeCoordinateSystem, persistTextAlignment,
  PreparedSvg, replaceForeignObjectsWithText, serializeClone
} from "@/tools/svgUtils.tsx";
import React from "react";

export function serializeSvgFrom(
  containerRef: React.RefObject<HTMLDivElement | null>
): PreparedSvg | null {
  const found = getRootAndSvg(containerRef)
  if (!found) return null
  const { root, svg } = found

  const clone = cloneWithNamespaces(svg)

  // Styling & text fidelity
  inlineComputedStyles(svg, clone)
  ensureTextVisibility(svg, clone)
  persistTextAlignment(svg, clone)

  // Replace foreignObject with SVG text
  replaceForeignObjectsWithText(svg, clone)

  let bbox = svg.viewBox.baseVal
  const { width, height } = normalizeCoordinateSystem(clone, bbox)
  injectBackgroundFromContainer(root, clone, width, height)

  const xml = serializeClone(clone)
  return { xml, width, height, element: clone, offsetX: 0, offsetY: 0 }
}