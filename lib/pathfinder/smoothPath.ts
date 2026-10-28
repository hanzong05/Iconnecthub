import type { Point } from './types'

/**
 * Centripetal Catmull-Rom curve through the points, sampled densely. The curve passes through every
 * point, so the path still follows the drawn roads, but corners are rounded instead of sharp.
 */
export function smoothPolyline(input: Point[], perSegment = 8): Point[] {
  // Drop repeated points: they make the curve parameter degenerate.
  const pts: Point[] = []
  for (const p of input) {
    const last = pts[pts.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) pts.push(p)
  }
  if (pts.length < 3) return pts
  const out: Point[] = [pts[0]]
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let s = 1; s <= perSegment; s++) {
      out.push(curvePoint(p0, p1, p2, p3, s / perSegment))
    }
  }
  return out
}

function curvePoint(p0: Point, p1: Point, p2: Point, p3: Point, u: number): Point {
  const gap = (a: Point, b: Point) => Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1e-6) ** 0.5
  const t0 = 0
  const t1 = t0 + gap(p0, p1)
  const t2 = t1 + gap(p1, p2)
  const t3 = t2 + gap(p2, p3)
  const t = t1 + (t2 - t1) * u
  const mix = (a: Point, b: Point, ta: number, tb: number, at: number): Point => ({
    x: ((tb - at) * a.x + (at - ta) * b.x) / (tb - ta),
    y: ((tb - at) * a.y + (at - ta) * b.y) / (tb - ta),
  })
  const a1 = mix(p0, p1, t0, t1, t)
  const a2 = mix(p1, p2, t1, t2, t)
  const a3 = mix(p2, p3, t2, t3, t)
  const b1 = mix(a1, a2, t0, t2, t)
  const b2 = mix(a2, a3, t1, t3, t)
  return mix(b1, b2, t1, t2, t)
}

/** Distance from p to the segment a-b. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len2 = vx * vx + vy * vy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2))
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy))
}

/**
 * Removes points that lie within `tolerance` pixels of the straight line between their neighbours
 * (Douglas-Peucker). A nearly straight stretch becomes a straight line; real bends are kept.
 */
export function simplifyPolyline(pts: Point[], tolerance = 3): Point[] {
  if (pts.length < 3) return pts
  const keep = pts.map(() => false)
  keep[0] = true
  keep[pts.length - 1] = true
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [number, number]
    let worst = -1
    let worstDist = 0
    for (let i = a + 1; i < b; i++) {
      const d = distanceToSegment(pts[i], pts[a], pts[b])
      if (d > worstDist) {
        worstDist = d
        worst = i
      }
    }
    if (worst >= 0 && worstDist > tolerance) {
      keep[worst] = true
      stack.push([a, worst], [worst, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}
