// ---------- Color helpers (opaque “transparent” fill) ----------
export const parseRGB = (s: string): [number, number, number] | null => {
  const m = s.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = s.match(/^#([0-9a-f]{6})$/i);
  if (h) {
    const n = parseInt(h[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return null;
};
export const toRGB = (r: [number, number, number]) => `rgb(${r[0]}, ${r[1]}, ${r[2]})`;
export const blend = (fg: [number, number, number], bg: [number, number, number], a: number): [number, number, number] => (
  [Math.round(fg[0] * a + bg[0] * (1 - a)), Math.round(fg[1] * a + bg[1] * (1 - a)), Math.round(fg[2] * a + bg[2] * (1 - a))]
);