import type { Point } from './types'

/**
 * The part of a route still ahead of `from`: the walker's position, the point on the route nearest to it,
 * then the rest of the route. Drawing only this part makes the line shrink as you walk along it.
 */
export function remainingRoute(points: Point[], from: Point): Point[] {
  if (points.length < 2) return points
  let best = { d: Infinity, i: 0, q: points[0] }
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    const vx = b.x - a.x
    const vy = b.y - a.y
    const len2 = vx * vx + vy * vy
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((from.x - a.x) * vx + (from.y - a.y) * vy) / len2))
    const q = { x: a.x + t * vx, y: a.y + t * vy }
    const d = Math.hypot(from.x - q.x, from.y - q.y)
    if (d < best.d) best = { d, i, q }
  }
  // Start at the walker's own position, so the line stays attached to them even when they are off the route.
  return [from, best.q, ...points.slice(best.i + 1)]
}
