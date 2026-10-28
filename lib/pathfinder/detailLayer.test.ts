import { describe, expect, it } from 'vitest'
import { applyHomography, convexOverlap, detailVisible, homography, DETAIL_HIDE_MARGIN_PX } from './detailLayer'

const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
]

describe('homography', () => {
  it('maps the image corners onto the placed corners', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ]
    const dst = [
      { x: 100, y: 50 },
      { x: 300, y: 60 },
      { x: 290, y: 200 },
      { x: 90, y: 190 },
    ]
    const h = homography(src, dst)!
    expect(h).not.toBeNull()
    src.forEach((p, i) => {
      const q = applyHomography(h, p)
      expect(q.x).toBeCloseTo(dst[i].x, 6)
      expect(q.y).toBeCloseTo(dst[i].y, 6)
    })
  })

  it('handles a plain scaled and moved rectangle', () => {
    const src = square(0, 0, 100)
    const dst = square(10, 20, 200)
    const h = homography(src, dst)!
    const q = applyHomography(h, { x: 50, y: 50 })
    expect(q.x).toBeCloseTo(110, 6)
    expect(q.y).toBeCloseTo(120, 6)
  })

  it('returns null for degenerate corners', () => {
    const src = square(0, 0, 100)
    const dst = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]
    expect(homography(src, dst)).toBeNull()
  })
})

describe('convexOverlap', () => {
  it('detects overlapping squares', () => {
    expect(convexOverlap(square(0, 0, 10), square(5, 5, 10))).toBe(true)
  })

  it('detects separated squares', () => {
    expect(convexOverlap(square(0, 0, 10), square(20, 0, 10))).toBe(false)
  })

  it('detects a diagonal overlap that the bounding boxes alone would miss', () => {
    const diamond = [
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 10 },
    ]
    // The square's corner pokes into the diamond's edge.
    expect(convexOverlap(diamond, square(14, 14, 4))).toBe(true)
    // The square sits in the diamond's empty corner: bounding boxes overlap, shapes do not.
    expect(convexOverlap(diamond, square(0, 0, 4))).toBe(false)
  })
})

describe('detailVisible hysteresis', () => {
  const footprint = square(100, 100, 200)
  // A view just outside the footprint, on its left side, by a few pixels.
  const justOutside = square(70, 150, 20)

  it('does not show when the view is just outside', () => {
    expect(detailVisible(false, footprint, justOutside)).toBe(false)
  })

  it('stays shown inside the hysteresis band, so the edge does not flicker', () => {
    expect(detailVisible(true, footprint, justOutside)).toBe(true)
  })

  it('hides once the view is clear of the band', () => {
    const far = square(100 - DETAIL_HIDE_MARGIN_PX - 60, 150, 20)
    expect(detailVisible(true, footprint, far)).toBe(false)
  })
})
