'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Point } from '@/lib/pathfinder/types'
import { normalizeDeg, shortestDelta } from '@/lib/pathfinder/geo'
import { detailVisible, footprintOf, homography, homographyCss, type DetailLayer, type ExtendedImage } from '@/lib/pathfinder/detailLayer'

export interface MapViewerHandle {
  zoomBy: (factor: number) => void
  fitAll: () => void
  /** Zooms to a point in image space at a multiple of the fit scale, and keeps it in view. */
  focus: (p: Point, factor: number) => void
  /** Frames the points so they all show, clear of the header (top) and the card (bottom), in screen pixels. */
  fitRoute: (points: Point[], insets: { top: number; bottom: number }) => void
  /** Centres the view on an image point, keeping the current zoom. */
  centreOn: (p: Point) => void
}

/** Screen padding around a framed route, in pixels. */
const FIT_PAD_PX = 24
/** Smallest framed area in image pixels, so one site is not zoomed past what is useful. */
const MIN_FIT_IMAGE_PX = 160

interface Props {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  /** Latest heading in degrees clockwise from north (null when unknown). Read every frame, never stored in React state. */
  headingRef: RefObject<number | null>
  /** Heading-up: the map turns so the heading points up the screen. North-up otherwise. */
  rotatingMode: boolean
  /** Default rotation of the image in degrees clockwise, used whenever the map is not heading-up. */
  orientation?: number
  /** The heading arrow's rotating group. The viewer writes its rotation every frame, so the arrow glides with the map. */
  arrowRef: RefObject<SVGGElement | null>
  /** Where the map centre is pinned on the viewport, as fractions of width/height. */
  anchor: { x: number; y: number }
  /** When set, the viewer keeps this image point at the anchor. */
  followPoint: Point | null
  /** While navigating, pinch and wheel zoom and the zoom buttons do nothing; the camera only follows. */
  zoomLocked?: boolean
  /** Optional second image, placed by its corners in overview pixels. Shown only zoomed in, over its footprint. */
  detail?: DetailLayer
  /** Second image with surrounding artwork, shown whenever the view reaches past the first image's edges. */
  extended?: ExtendedImage
  onUserInteract: () => void
  /** The map sits inside a scrolling page: the wheel scrolls the page instead of zooming. */
  pageScroll?: boolean
  onTap: (p: Point) => void
  children: (scale: number) => ReactNode
}

const TAP_TOLERANCE_PX = 6
/** How quickly the shown heading catches up with the latest reading (seconds). Smaller is snappier. */
const GLIDE_SECONDS = 0.08

/**
 * Pan / zoom / rotate viewer for the flat PNG. The image and every overlay share one
 * image-pixel coordinate system, so overlays cannot drift.
 *
 * Layers: translate(anchor) → rotate(heading) → scale(s) translate(-centre).
 * Rotation is animated with requestAnimationFrame and written straight to the DOM, so the map
 * glides between compass readings without React re-rendering on every frame.
 */
const MapViewer = forwardRef<MapViewerHandle, Props>(function MapViewer(
  { imageUrl, imageWidth, imageHeight, headingRef, rotatingMode, orientation = 0, arrowRef, anchor, followPoint, zoomLocked = false, detail, extended, onUserInteract, pageScroll = false, onTap, children },
  ref,
) {
  const IMAGE_WIDTH = imageWidth
  const IMAGE_HEIGHT = imageHeight
  const rootRef = useRef<HTMLDivElement>(null)
  const rotateLayer = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ cx: IMAGE_WIDTH / 2, cy: IMAGE_HEIGHT / 2, scale: 0.3 })
  const [dragging, setDragging] = useState(false)
  const viewRef = useRef(view)
  viewRef.current = view
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ moved: 0, pinchDist: 0, interacted: false, mid: { x: 0, y: 0 } })
  const fitted = useRef(false)

  // Heading animation state. Read and written by the animation loop, never by React rendering.
  const shownHeading = useRef<number | null>(null)
  const shownRotation = useRef(0) // degrees currently applied to the map, used for tap and drag maths
  const modeRef = useRef(rotatingMode)
  useEffect(() => {
    modeRef.current = rotatingMode
  }, [rotatingMode])
  const orientationRef = useRef(orientation)
  useEffect(() => {
    orientationRef.current = orientation
  }, [orientation])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let lastRot = Number.NaN
    let lastArrow = Number.NaN
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const target = headingRef.current
      if (target !== null) {
        if (shownHeading.current === null) {
          shownHeading.current = normalizeDeg(target)
        } else {
          // Frame-rate independent glide along the shortest arc, so 359° → 1° turns 2°, not 358°.
          const k = 1 - Math.exp(-dt / GLIDE_SECONDS)
          shownHeading.current = normalizeDeg(shownHeading.current + shortestDelta(shownHeading.current, target) * k)
        }
      }
      const h = shownHeading.current
      // Not heading-up: the map keeps its default orientation and only turns while navigating.
      const rot = h === null || !modeRef.current ? orientationRef.current : -h
      shownRotation.current = rot
      if (rotateLayer.current && rot !== lastRot) {
        rotateLayer.current.style.transform = `rotate(${rot}deg)`
        // Overlays read this to turn their labels back upright (see DestinationMarkers).
        rotateLayer.current.style.setProperty('--map-rot', `${rot}deg`)
        lastRot = rot
      }
      // The arrow turns the same amount in both modes, so it always shows the true heading.
      const arrowAngle = h ?? 0
      if (arrowRef.current && arrowAngle !== lastArrow) {
        arrowRef.current.setAttribute('transform', `rotate(${arrowAngle})`)
        lastArrow = arrowAngle
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [arrowRef, headingRef])

  // Full view: the largest scale at which the whole map image fits on screen. This is the default and the smallest zoom.
  // Full view: the whole map fits on screen. This is the smallest zoom (fully zoomed out).
  const fitScale = viewport.w ? Math.min(viewport.w / IMAGE_WIDTH, viewport.h / IMAGE_HEIGHT) : 0.3
  // Default view: the map fills the screen, cropping the edges that do not fit. Zoom out to see all of it.
  const coverScale = viewport.w ? Math.max(viewport.w / IMAGE_WIDTH, viewport.h / IMAGE_HEIGHT) : 0.3
  // Second image: placed by its corners in map pixels, at its own size.
  const ext = extended
  const extMatrix = useMemo(() => {
    if (!extended) return null
    const src = [
      { x: 0, y: 0 },
      { x: extended.width, y: 0 },
      { x: extended.width, y: extended.height },
      { x: 0, y: extended.height },
    ]
    const h = homography(src, extended.corners)
    return h ? homographyCss(h) : null
  }, [extended])
  // The area the view may show: the first image and the second image together.
  const xs = ext ? ext.corners.map((p) => p.x).concat(0, IMAGE_WIDTH) : [0, IMAGE_WIDTH]
  const ys = ext ? ext.corners.map((p) => p.y).concat(0, IMAGE_HEIGHT) : [0, IMAGE_HEIGHT]
  const bx0 = Math.min(...xs)
  const bx1 = Math.max(...xs)
  const by0 = Math.min(...ys)
  const by1 = Math.max(...ys)
  // With a second image, zooming out stops where the rotated screen still fits inside it, so no blank edge shows at any angle.
  // With a second image, zooming out stops where the screen, at any rotation, still lies inside the back image: no blank edge.
  const diagonal = Math.hypot(viewport.w, viewport.h)
  const minScale = ext && viewport.w ? Math.max(diagonal / (bx1 - bx0), diagonal / (by1 - by0)) : fitScale
  // Load view: with a second image, the whole extended map is shown (second layer only). Without one, the map fills the screen.
  const defaultScale = ext ? minScale : Math.max(coverScale, minScale)
  const clampScale = (s: number) => Math.min(8, Math.max(minScale, s))
  /** Keeps the visible area inside the image, so panning and zooming never show the empty space around it. */
  function keepInImage<T extends { cx: number; cy: number; scale: number }>(v: T): T {
    const r = rad()
    const hw = viewport.w / 2
    const hh = viewport.h / 2
    // Half-size of the visible area in image pixels, including the rotation.
    const hx = (hw * Math.abs(Math.cos(r)) + hh * Math.abs(Math.sin(r))) / v.scale
    const hy = (hw * Math.abs(Math.sin(r)) + hh * Math.abs(Math.cos(r))) / v.scale
    const cx = hx * 2 >= bx1 - bx0 ? (bx0 + bx1) / 2 : Math.min(bx1 - hx, Math.max(bx0 + hx, v.cx))
    const cy = hy * 2 >= by1 - by0 ? (by0 + by1) / 2 : Math.min(by1 - hy, Math.max(by0 + hy, v.cy))
    return { ...v, cx, cy }
  }

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewport({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setViewport({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Fit the whole image to the screen. If the screen size changes while the view is still at the fit
  // scale (the user has not zoomed), refit to the new size, so the map never stays small after a resize.
  const lastFit = useRef(0)
  useEffect(() => {
    if (!viewport.w || !viewport.h) return
    const atFit = !fitted.current || Math.abs(viewRef.current.scale - lastFit.current) < 1e-9
    fitted.current = true
    lastFit.current = defaultScale
    if (atFit) setView({ cx: IMAGE_WIDTH / 2, cy: IMAGE_HEIGHT / 2, scale: defaultScale })
  }, [viewport.w, viewport.h, defaultScale])

  const zoomLockedRef = useRef(zoomLocked)
  zoomLockedRef.current = zoomLocked

  useEffect(() => {
    if (followPoint) setView((v) => keepInImage({ ...v, cx: followPoint.x, cy: followPoint.y }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followPoint?.x, followPoint?.y])

  useImperativeHandle(
    ref,
    () => ({
      zoomBy: (f) => {
        if (zoomLockedRef.current) return
        setView((v) => keepInImage({ ...v, scale: Math.min(8, Math.max(minScale, v.scale * f)) }))
      },
      fitAll: () => setView({ cx: IMAGE_WIDTH / 2, cy: IMAGE_HEIGHT / 2, scale: defaultScale }),
      focus: (p, factor) => setView(() => keepInImage({ cx: p.x, cy: p.y, scale: Math.min(8, Math.max(minScale, fitScale * factor)) })),
      centreOn: (p) => setView((v) => keepInImage({ ...v, cx: p.x, cy: p.y })),
      fitRoute: (points, insets) => {
        if (!points.length || !viewport.w || !viewport.h) return
        // Work in the rotated frame, so the framed box is the one on screen at the current rotation.
        const r = rad()
        const c = Math.cos(r)
        const s = Math.sin(r)
        const rotated = points.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }))
        const xs2 = rotated.map((p) => p.x)
        const ys2 = rotated.map((p) => p.y)
        const minX = Math.min(...xs2)
        const maxX = Math.max(...xs2)
        const minY = Math.min(...ys2)
        const maxY = Math.max(...ys2)
        const bw = Math.max(maxX - minX, MIN_FIT_IMAGE_PX)
        const bh = Math.max(maxY - minY, MIN_FIT_IMAGE_PX)
        const availW = viewport.w - 2 * FIT_PAD_PX
        const availH = viewport.h - insets.top - insets.bottom - 2 * FIT_PAD_PX
        const scale = Math.min(8, Math.max(minScale, Math.min(availW / bw, availH / bh)))
        // Centre of the framed box, in the rotated frame, then mapped back to image space.
        const C = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
        const P = { x: C.x * c + C.y * s, y: -C.x * s + C.y * c }
        // The visible area's centre sits below the header and above the card, not at the viewport centre.
        const o = { x: 0, y: (insets.top - insets.bottom) / 2 }
        const oi = { x: ((o.x * c + o.y * s) / scale), y: ((-o.x * s + o.y * c) / scale) }
        const q = { x: P.x - oi.x, y: P.y - oi.y }
        setView(() => keepInImage({ cx: q.x, cy: q.y, scale }))
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minScale, fitScale, defaultScale, viewport.w, viewport.h, extended, imageWidth, imageHeight],
  )

  // Wheel zoom needs a non-passive native listener to prevent page scroll.
  useEffect(() => {
    const el = rootRef.current
    if (!el || pageScroll) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (!zoomLockedRef.current) setView((v) => keepInImage({ ...v, scale: Math.min(8, Math.max(minScale, v.scale * Math.exp(-e.deltaY * 0.0015))) }))
      onUserInteract()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minScale, pageScroll])

  const anchorPx = { x: viewport.w * anchor.x, y: viewport.h * anchor.y }

  /** Current map rotation in radians, from the animation loop. */
  function rad(): number {
    return (shownRotation.current * Math.PI) / 180
  }

  /** Inverse of the stage transform: viewport point -> image pixel. */
  function screenToImage(sx: number, sy: number, v = viewRef.current): Point {
    const dx = sx - anchorPx.x
    const dy = sy - anchorPx.y
    const r = rad()
    return {
      x: v.cx + (dx * Math.cos(r) + dy * Math.sin(r)) / v.scale,
      y: v.cy + (-dx * Math.sin(r) + dy * Math.cos(r)) / v.scale,
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    rootRef.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) gesture.current = { moved: 0, pinchDist: 0, interacted: false, mid: { x: 0, y: 0 } }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
      gesture.current.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      gesture.current.moved = Infinity
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const cur = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, cur)
    const g = gesture.current
    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      g.moved += Math.hypot(dx, dy)
      if (g.moved > TAP_TOLERANCE_PX) {
        setDragging(true)
        if (!g.interacted) {
          g.interacted = true
          onUserInteract()
        }
        const s = viewRef.current.scale
        const r = rad()
        const ux = (dx * Math.cos(r) + dy * Math.sin(r)) / s
        const uy = (-dx * Math.sin(r) + dy * Math.cos(r)) / s
        setView((v) => keepInImage({ ...v, cx: v.cx - ux, cy: v.cy - uy }))
      }
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (g.pinchDist > 0) {
        const f = d / g.pinchDist
        if (!zoomLockedRef.current) setView((v) => keepInImage({ ...v, scale: clampScale(v.scale * f) }))
      }
      g.pinchDist = d
      // Two fingers also move the map, by how far their midpoint travelled.
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (pageScroll) {
        const dx = mid.x - g.mid.x
        const dy = mid.y - g.mid.y
        const sc = viewRef.current.scale
        const r = rad()
        setView((v) => keepInImage({ ...v, cx: v.cx - (dx * Math.cos(r) + dy * Math.sin(r)) / sc, cy: v.cy - (-dx * Math.sin(r) + dy * Math.cos(r)) / sc }))
      }
      g.mid = mid
    }
  }

  /** The browser took the gesture over (a page scroll): forget it, and never count it as a tap. */
  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) setDragging(false)
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const had = pointers.current.delete(e.pointerId)
    if (had && pointers.current.size === 0) {
      const g = gesture.current
      if (g.moved <= TAP_TOLERANCE_PX && rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect()
        onTap(screenToImage(e.clientX - rect.left, e.clientY - rect.top))
      }
      setDragging(false)
    }
  }

  // Detail layer: shown when zoomed past its threshold and the visible area touches its footprint.
  // Hysteresis on both the footprint and the zoom stops flicker at the edges.
  const detailShown = useRef(false)
  const detailHomography = useMemo(() => {
    if (!detail) return null
    const src = [
      { x: 0, y: 0 },
      { x: detail.width, y: 0 },
      { x: detail.width, y: detail.height },
      { x: 0, y: detail.height },
    ]
    const h = homography(src, footprintOf(detail))
    return h ? homographyCss(h) : null
  }, [detail])
  // The first image is always on top at its full size; the second image is always behind it.
  const showFirst = true

  let showDetail = false
  if (detail && detailHomography && viewport.w && viewport.h) {
    const threshold = detail.zoomFactor * fitScale
    const zoomOk = detailShown.current ? view.scale >= threshold * 0.95 : view.scale >= threshold
    const visibleArea = [
      screenToImage(0, 0),
      screenToImage(viewport.w, 0),
      screenToImage(viewport.w, viewport.h),
      screenToImage(0, viewport.h),
    ]
    showDetail = zoomOk && detailVisible(detailShown.current, footprintOf(detail), visibleArea)
  }
  detailShown.current = showDetail

  return (
    <div
      ref={rootRef}
      className={`relative h-full w-full select-none overflow-hidden bg-[#9fd3ea] ${pageScroll ? 'touch-pan-y' : 'touch-none'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* Position only. React sets this, the animation loop sets the rotation below it. */}
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${anchorPx.x}px, ${anchorPx.y}px)` }}>
        <div ref={rotateLayer} className="absolute left-0 top-0 origin-top-left">
          {/* Zoom and pan keep their easing. Rotation does not, so it is never delayed. */}
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: IMAGE_WIDTH,
              height: IMAGE_HEIGHT,
              transform: `scale(${view.scale}) translate(${-view.cx}px, ${-view.cy}px)`,
              transition: dragging ? 'none' : 'transform 350ms ease-out',
              willChange: 'transform',
            }}
          >
            {ext && extMatrix && (
              <img
                src={ext.imageUrl}
                alt=""
                width={ext.width}
                height={ext.height}
                draggable={false}
                className="pointer-events-none absolute left-0 top-0 block max-w-none"
                style={{ transformOrigin: '0 0', transform: extMatrix }}
              />
            )}
            {showFirst && (
              <img
                src={imageUrl}
                alt="Stone Mountain Park Campground map"
                width={IMAGE_WIDTH}
                height={IMAGE_HEIGHT}
                draggable={false}
                className={`pointer-events-none block max-w-none${ext ? ' absolute left-0 top-0' : ''}`}
              />
            )}
            {showDetail && detail && detailHomography && (
              <img
                src={detail.imageUrl}
                alt=""
                width={detail.width}
                height={detail.height}
                draggable={false}
                className="pointer-events-none absolute left-0 top-0 block max-w-none"
                style={{ transformOrigin: '0 0', transform: detailHomography }}
              />
            )}
            <svg
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
              width={IMAGE_WIDTH}
              height={IMAGE_HEIGHT}
              viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
            >
              {children(view.scale)}
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
})

export default MapViewer
