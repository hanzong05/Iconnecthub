import type { Point } from './types'

const EARTH_RADIUS_M = 6371000

export const toRad = (deg: number) => (deg * Math.PI) / 180

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** Signed shortest rotation from `from` to `to`, in degrees (-180..180). */
export function shortestDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

/** Exponential smoothing of an angle that never takes the long way round 0°/360°. */
export function smoothAngle(prev: number, next: number, alpha: number): number {
  return normalizeDeg(prev + shortestDelta(prev, next) * alpha)
}

export function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Compass-style bearing (0 = up on the map, clockwise) between two image-pixel points. */
export function pixelBearing(from: Point, to: Point): number {
  return normalizeDeg((Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI)
}
