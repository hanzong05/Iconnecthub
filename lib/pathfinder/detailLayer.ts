import type { Point } from './types'

/**
 * A second, independently calibrated image that covers part of the campground.
 * Its four corners (top-left, top-right, bottom-right, bottom-left) are placed in the overview's
 * image-pixel space, so routes, pins and roads stay on one coordinate system.
 */
export interface DetailLayer {
  imageUrl: string
  /** Pixel size of the detail image itself. */
  width: number
  height: number
  /** Where the detail image's corners sit in overview pixels, in tl, tr, br, bl order. */
  corners: [Point, Point, Point, Point]
  /** Zoom at which the detail image appears, as a multiple of the full-view (fit) scale. */
  zoomFactor: number
}

/** Corners for an image of its own pixel size, centred on a point. Keeps the picked size: no scaling. */
export function centredCorners(centre: Point, w: number, h: number): DetailLayer['corners'] {
  return [
    { x: centre.x - w / 2, y: centre.y - h / 2 },
    { x: centre.x + w / 2, y: centre.y - h / 2 },
    { x: centre.x + w / 2, y: centre.y + h / 2 },
    { x: centre.x - w / 2, y: centre.y + h / 2 },
  ]
}

/** Starting corners for a new back image: its own size, centred on the first image. */
export function startingDetailCorners(overviewW: number, overviewH: number, detailW: number, detailH: number): DetailLayer['corners'] {
  return centredCorners({ x: overviewW / 2, y: overviewH / 2 }, detailW, detailH)
}

/** Derives the fourth corner from the three the editor moves, so the shape stays a parallelogram. */
export function affineCorners(tl: Point, tr: Point, bl: Point): DetailLayer['corners'] {
  return [tl, tr, { x: tr.x + bl.x - tl.x, y: tr.y + bl.y - tl.y }, bl]
}

/**
 * The second map image: the first image with surrounding artwork added on every side. It is shown
 * whenever the view reaches past the first image's edges. Its size is the first image plus equal margins.
 */
export interface ExtendedImage {
  imageUrl: string
  /** Pixel size of the image itself. */
  width: number
  height: number
  /** Where its corners sit in map pixels (tl, tr, br, bl). Its size on the map comes from these. */
  corners: [Point, Point, Point, Point]
}

/** Extra distance (in overview pixels) the view must move past the footprint before the detail image hides. */
export const DETAIL_HIDE_MARGIN_PX = 40

/**
 * Projective transform (homography) that maps the four source points onto the four destination points.
 * Returns the 3×3 matrix as [h0..h7, 1] in row-major order, so it can be turned into a CSS matrix3d.
 * Returns null when the points are degenerate (for example three of them lie on one line).
 */
export function homography(src: Point[], dst: Point[]): number[] | null {
  // Solve the 8×8 linear system for h0..h7 with h8 = 1.
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: X, y: Y } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X])
    b.push(X)
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y])
    b.push(Y)
  }
  const h = solve(A, b)
  if (!h) return null
  return [...h, 1]
}

/** Gaussian elimination with partial pivoting. Null when the system is singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

/** Applies a homography (as returned by homography) to a point. */
export function applyHomography(h: number[], p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8]
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  }
}

/**
 * CSS matrix3d for a 2D homography, for use with transform-origin 0 0. Maps the detail image's
 * own pixel coordinates straight onto the overview's pixel coordinates.
 */
export function homographyCss(h: number[]): string {
  // CSS matrix3d takes column-major values. The z row and column stay identity.
  const v = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]]
  return `matrix3d(${v.map((n) => (Math.abs(n) < 1e-12 ? 0 : n)).join(',')})`
}

/** The four corners of the detail image in overview pixels, in tl, tr, br, bl order. */
export function footprintOf(layer: DetailLayer): Point[] {
  return layer.corners.map((c) => ({ x: c.x, y: c.y }))
}

/**
 * Whether two convex quadrilaterals overlap, by the separating axis test.
 * `margin` grows the first shape outward by that many pixels, so the test can use a hysteresis band.
 */
export function convexOverlap(a: Point[], b: Point[], margin = 0): boolean {
  const grown = margin > 0 ? growConvex(a, margin) : a
  for (const poly of [grown, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      // Edge normal: a valid separating axis for a convex polygon, whatever its winding.
      const nx = q.y - p.y
      const ny = p.x - q.x
      const [minA, maxA] = project(grown, nx, ny)
      const [minB, maxB] = project(b, nx, ny)
      if (maxA < minB || maxB < minA) return false
    }
  }
  return true
}

function project(poly: Point[], nx: number, ny: number): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const p of poly) {
    const d = p.x * nx + p.y * ny
    if (d < min) min = d
    if (d > max) max = d
  }
  return [min, max]
}

/** Pushes each vertex away from the centroid. Approximate, but enough for a small hysteresis band. */
function growConvex(poly: Point[], margin: number): Point[] {
  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length
  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length
  return poly.map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    const len = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / len) * margin, y: p.y + (dy / len) * margin }
  })
}

/**
 * Whether the detail image should be showing. Enters when the visible area touches the footprint,
 * and only leaves once the visible area is clear of it by DETAIL_HIDE_MARGIN_PX. That band stops flicker at the edge.
 */
export function detailVisible(wasShown: boolean, footprint: Point[], visibleArea: Point[]): boolean {
  return convexOverlap(footprint, visibleArea, wasShown ? DETAIL_HIDE_MARGIN_PX : 0)
}
