'use client'

import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-imageoverlay-rotated'
import type { MapSet } from '@/lib/pathfinder/model'
import type { CalibrationFile, Point } from '@/lib/pathfinder/types'
import { affineCorners, centredCorners, startingDetailCorners, type DetailLayer } from '@/lib/pathfinder/detailLayer'
import { prepareExactImage, uploadPrepared } from './images'

const M_LAT = 110574
const DEFAULT_CENTER = { lat: 0, lng: 0 }

/** The three corners that define the image; the fourth is inferred. Free-sizing and rotation both work by moving these. */
interface Corners {
  tl: L.LatLngLiteral
  tr: L.LatLngLiteral
  bl: L.LatLngLiteral
}

type Rotated = L.ImageOverlay & { reposition(tl: L.LatLngLiteral, tr: L.LatLngLiteral, bl: L.LatLngLiteral): void }
const rotatedOverlay = (
  L.imageOverlay as unknown as {
    rotated: (url: string, tl: L.LatLngLiteral, tr: L.LatLngLiteral, bl: L.LatLngLiteral, o: L.ImageOverlayOptions) => Rotated
  }
).rotated

// ----- geometry in metres around a point (small-area approximation, as used elsewhere in the app) -----
const mPerLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180)
const toXY = (p: L.LatLngLiteral, o: L.LatLngLiteral) => ({ x: (p.lng - o.lng) * mPerLon(o.lat), y: (p.lat - o.lat) * M_LAT })
const fromXY = (v: { x: number; y: number }, o: L.LatLngLiteral) => ({ lat: o.lat + v.y / M_LAT, lng: o.lng + v.x / mPerLon(o.lat) })

function centerOf(c: Corners): L.LatLngLiteral {
  return { lat: (c.tr.lat + c.bl.lat) / 2, lng: (c.tr.lng + c.bl.lng) / 2 }
}

function widthOf(c: Corners): number {
  const o = centerOf(c)
  const a = toXY(c.tl, o)
  const b = toXY(c.tr, o)
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Applies a transform in metres around the centre of the image. */
function mapCorners(c: Corners, f: (v: { x: number; y: number }) => { x: number; y: number }): Corners {
  const o = centerOf(c)
  const g = (p: L.LatLngLiteral) => fromXY(f(toXY(p, o)), o)
  return { tl: g(c.tl), tr: g(c.tr), bl: g(c.bl) }
}

/** Length of the image's width (top-left to top-right) and height (top-left to bottom-left), in metres. */
function axisLengths(c: Corners): { w: number; h: number } {
  const o = centerOf(c)
  const tl = toXY(c.tl, o)
  const tr = toXY(c.tr, o)
  const bl = toXY(c.bl, o)
  return { w: Math.hypot(tr.x - tl.x, tr.y - tl.y), h: Math.hypot(bl.x - tl.x, bl.y - tl.y) }
}

/** Scales only along the image's own width and height directions, so the map shrinks in one direction at a time. */
function scaleAxes(c: Corners, sx: number, sy: number): Corners {
  const o = centerOf(c)
  const tl = toXY(c.tl, o)
  const tr = toXY(c.tr, o)
  const bl = toXY(c.bl, o)
  const ex = { x: tr.x - tl.x, y: tr.y - tl.y }
  const ey = { x: bl.x - tl.x, y: bl.y - tl.y }
  const lx = Math.hypot(ex.x, ex.y) || 1
  const ly = Math.hypot(ey.x, ey.y) || 1
  const ux = { x: ex.x / lx, y: ex.y / lx }
  const uy = { x: ey.x / ly, y: ey.y / ly }
  return mapCorners(c, (v) => {
    const a = v.x * ux.x + v.y * ux.y
    const b = v.x * uy.x + v.y * uy.y
    return { x: a * sx * ux.x + b * sy * uy.x, y: a * sx * ux.y + b * sy * uy.y }
  })
}

const rotateCorners = (c: Corners, a: number) => mapCorners(c, (v) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) }))
const scaleCorners = (c: Corners, s: number) => mapCorners(c, (v) => ({ x: v.x * s, y: v.y * s }))
const moveCorners = (c: Corners, dLat: number, dLng: number): Corners => ({
  tl: { lat: c.tl.lat + dLat, lng: c.tl.lng + dLng },
  tr: { lat: c.tr.lat + dLat, lng: c.tr.lng + dLng },
  bl: { lat: c.bl.lat + dLat, lng: c.bl.lng + dLng },
})

/** Straight, unrotated corners for a centre and a width on the ground. */
function cornersFor(center: L.LatLngLiteral, widthM: number, aspect: number): Corners {
  const hw = widthM / 2
  const hh = (widthM * aspect) / 2
  return {
    tl: fromXY({ x: -hw, y: hh }, center),
    tr: fromXY({ x: hw, y: hh }, center),
    bl: fromXY({ x: -hw, y: -hh }, center),
  }
}

/** Corners stored in the calibration, or the centre and width of an older save. Null when neither exists. */
function cornersFromCalibration(cal: CalibrationFile, aspect: number): Corners | null {
  const find = (id: string) => cal.controlPoints.find((p) => p.id === id)
  const tl = find('img-tl')
  const tr = find('img-tr')
  const bl = find('img-bl')
  if (tl && tr && bl) return { tl: { lat: tl.lat, lng: tl.lon }, tr: { lat: tr.lat, lng: tr.lon }, bl: { lat: bl.lat, lng: bl.lon } }
  if (cal.georef && !(cal.georef.lat === 0 && cal.georef.lon === 0)) return cornersFor({ lat: cal.georef.lat, lng: cal.georef.lon }, cal.georef.widthM, aspect)
  return null
}

function sameCorners(a: Corners, b: Corners): boolean {
  const eq = (p: L.LatLngLiteral, q: L.LatLngLiteral) => Math.abs(p.lat - q.lat) < 1e-10 && Math.abs(p.lng - q.lng) < 1e-10
  return eq(a.tl, b.tl) && eq(a.tr, b.tr) && eq(a.bl, b.bl)
}

/** Keeps a detail image square to itself: its height edge is made perpendicular to its width edge, so it can never lean (slant). Width, height and rotation are kept. */
function squareUp(c: DetailLayer['corners']): DetailLayer['corners'] {
  const [tl, tr, , bl] = c
  const wx = tr.x - tl.x
  const wy = tr.y - tl.y
  const w = Math.hypot(wx, wy)
  if (w < 1e-6) return c
  const h = Math.hypot(bl.x - tl.x, bl.y - tl.y)
  // Perpendicular to the width edge, pointing the way the old height edge pointed (down in the image).
  let px = -wy / w
  let py = wx / w
  if (px * (bl.x - tl.x) + py * (bl.y - tl.y) < 0) {
    px = -px
    py = -py
  }
  return affineCorners(tl, tr, { x: tl.x + px * h, y: tl.y + py * h })
}

/** Scales a detail image evenly (its shape stays) and rotates it, both around its centre. */
function transformDetail(c: DetailLayer['corners'], scale: number, angle: number): DetailLayer['corners'] {
  const cx = (c[0].x + c[2].x) / 2
  const cy = (c[0].y + c[2].y) / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const f = (q: Point): Point => {
    const x = (q.x - cx) * scale
    const y = (q.y - cy) * scale
    return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos }
  }
  return squareUp(affineCorners(f(c[0]), f(c[1]), f(c[3])))
}

/** Writes the corners (and the derived georeference) into a calibration. Other fields are kept. */
function withCorners(cal: CalibrationFile, c: Corners, width: number, height: number): CalibrationFile {
  const br = { lat: c.tr.lat + c.bl.lat - c.tl.lat, lng: c.tr.lng + c.bl.lng - c.tl.lng }
  const centre = centerOf(c)
  return {
    ...cal,
    controlPoints: [
      ...cal.controlPoints.filter((p) => !p.id.startsWith('img-')),
      { id: 'img-tl', x: 0, y: 0, lat: c.tl.lat, lon: c.tl.lng },
      { id: 'img-tr', x: width, y: 0, lat: c.tr.lat, lon: c.tr.lng },
      { id: 'img-bl', x: 0, y: height, lat: c.bl.lat, lon: c.bl.lng },
      { id: 'img-br', x: width, y: height, lat: br.lat, lon: br.lng },
    ],
    georef: { lat: centre.lat, lon: centre.lng, widthM: Math.round(widthOf(c)) },
  }
}

/** Image pixel → map position, using the corners. The image is an affine parallelogram, so this is exact. */
function pixelToLatLng(p: Point, c: Corners, w: number, h: number): L.LatLngLiteral {
  const o = c.tl
  const e1 = toXY(c.tr, o)
  const e2 = toXY(c.bl, o)
  const u = p.x / w
  const v = p.y / h
  return fromXY({ x: u * e1.x + v * e2.x, y: u * e1.y + v * e2.y }, o)
}

/** Map position → image pixel (the inverse of pixelToLatLng). */
function latLngToPixel(ll: L.LatLngLiteral, c: Corners, w: number, h: number): Point {
  const o = c.tl
  const P = toXY(ll, o)
  const e1 = toXY(c.tr, o)
  const e2 = toXY(c.bl, o)
  const det = e1.x * e2.y - e2.x * e1.y || 1e-9
  const u = (P.x * e2.y - e2.x * P.y) / det
  const v = (e1.x * P.y - P.x * e1.y) / det
  return { x: u * w, y: v * h }
}

interface Props {
  set: MapSet
  calibration: CalibrationFile
  /** Applies a change to the calibration. The page owns the data and saves it. */
  onChange: (fn: (prev: CalibrationFile) => CalibrationFile) => void
  /** While on, a tap on the satellite map picks an image point. */
  pickMode: boolean
  pending: Point | null
  onPick: (p: Point) => void
  panelOpen: boolean
  onTogglePanel: () => void
  /** Show the Geofence panel inside the sidebar (rendered into panelTarget) instead of floating over the map. */
  inlinePanel?: boolean
  panelTarget?: HTMLElement | null
  /** The campground's saved latitude and longitude (from Campground details). */
  center?: { lat: number; lng: number } | null
  /** The detail image: a second, zoom-activated layer placed by its corners in overview pixels. */
  detail?: DetailLayer | null
  onDetail?: (d: DetailLayer | null) => void
  onSaveDetail?: () => void
  detailStatus?: string | null
}

/**
 * Georeference on the satellite map: lays the illustrated map over the real ground.
 * Drag a white corner to resize, drag the red centre to move, hold the right mouse button to rotate.
 * In pick mode a tap records an image point, and saved control points and checkpoints are drawn on top.
 */
export default function GeorefEditor({ set, calibration, onChange, pickMode, pending, onPick, panelOpen, onTogglePanel, inlinePanel = false, panelTarget = null, center = null, detail = null, onDetail, onSaveDetail, detailStatus = null }: Props) {
  const aspect = set.height / set.width
  const [corners, setCorners] = useState<Corners>(() => cornersFromCalibration(calibration, aspect) ?? cornersFromCalibration(set.calibration, aspect) ?? cornersFor(DEFAULT_CENTER, 120, aspect))
  const cornersRef = useRef(corners)
  const [opacity, setOpacity] = useState(0.6)
  const [hint, setHint] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const refs = useRef<{ map: L.Map; overlay: Rotated; handles: Record<'tl' | 'tr' | 'bl', L.Marker>; centre: L.Marker; points: L.LayerGroup } | null>(null)
  // Handlers created once with the map read the latest values through these refs.
  const applyRef = useRef<(c: Corners) => void>(() => {})
  const pickRef = useRef(pickMode)
  pickRef.current = pickMode
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  // Detail image: its own overlay and handles (three corners and a centre), kept in step with the stored corners.
  const detailRef = useRef<DetailLayer | null>(detail)
  useEffect(() => {
    detailRef.current = detail
  }, [detail])
  const onDetailRef = useRef(onDetail)
  onDetailRef.current = onDetail
  const detailHandles = useRef<{ overlay: Rotated; tl: L.Marker; tr: L.Marker; bl: L.Marker; centre: L.Marker } | null>(null)
  const detailKey = detail ? `${detail.imageUrl}|${detail.width}x${detail.height}` : ''
  // Which image the handles and sliders control. The other one is locked.
  const [editing, setEditing] = useState<'overview' | 'detail'>('overview')
  const editingRef = useRef(editing)
  const [detailOpacity, setDetailOpacity] = useState(0.7)
  editingRef.current = editing

  // Corners that come from the saved calibration (first load, or a change made elsewhere).
  useEffect(() => {
    const next = cornersFromCalibration(calibration, aspect)
    if (next && !sameCorners(next, cornersRef.current)) {
      cornersRef.current = next
      setCorners(next)
    }
  }, [calibration, aspect])

  applyRef.current = (c: Corners) => {
    cornersRef.current = c
    setCorners(c)
    onChange((prev) => withCorners(prev, c, set.width, set.height))
  }

  // Create the Leaflet map once per image.
  useEffect(() => {
    if (!container.current) return
    const start = cornersRef.current
    // On a phone the page has to stay scrollable: the wheel and a one-finger drag scroll the page, and two fingers move and zoom the map.
    const small = window.matchMedia('(max-width: 767px)').matches
    const map = L.map(container.current, {
      center: centerOf(start),
      zoom: 19,
      maxZoom: 22,
      scrollWheelZoom: !small,
      dragging: !(small && L.Browser.mobile),
    })
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22,
      attribution: 'Tiles © Esri',
    })
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    })
    satellite.addTo(map)
    L.control.layers({ Satellite: satellite, Streets: streets }).addTo(map)

    const overlay = rotatedOverlay(set.imageUrl, start.tl, start.tr, start.bl, { opacity: 0.6, interactive: false }).addTo(map)

    const cornerIcon = L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;border-radius:4px;background:#fff;border:3px solid #1a56db;box-shadow:0 0 0 2px rgba(0,0,0,.35)"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    })
    const centreIcon = L.divIcon({
      className: '',
      html: '<div style="width:24px;height:24px;border-radius:50%;background:rgba(220,38,38,.9);border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.35)"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
    const handles = {
      tl: L.marker(start.tl, { draggable: true, icon: cornerIcon }).addTo(map),
      tr: L.marker(start.tr, { draggable: true, icon: cornerIcon }).addTo(map),
      bl: L.marker(start.bl, { draggable: true, icon: cornerIcon }).addTo(map),
    }
    const centre = L.marker(centerOf(start), { draggable: true, icon: centreIcon }).addTo(map)
    const points = L.layerGroup().addTo(map)

    // A tap in pick mode records an image point at that place on the ground.
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!pickRef.current) return
      onPickRef.current(latLngToPixel(e.latlng, cornersRef.current, set.width, set.height))
    })

    // Dragging a corner scales the whole map evenly from its centre, so it keeps its shape.
    for (const key of ['tl', 'tr', 'bl'] as const) {
      handles[key].on('drag', () => {
        const cur = cornersRef.current
        const c = centerOf(cur)
        const before = Math.hypot(toXY(cur[key], c).x, toXY(cur[key], c).y)
        const p = handles[key].getLatLng()
        const after = Math.hypot(toXY(p, c).x, toXY(p, c).y)
        if (before < 1) return
        applyRef.current(scaleCorners(cur, after / before))
      })
    }
    // Dragging the centre moves the whole image.
    centre.on('drag', () => {
      const cur = cornersRef.current
      const p = centre.getLatLng()
      const c0 = centerOf(cur)
      applyRef.current(moveCorners(cur, p.lat - c0.lat, p.lng - c0.lng))
    })

    // Right mouse button drag rotates the image around its centre.
    const el = map.getContainer()
    const onContext = (e: Event) => e.preventDefault()
    let rot: { centre: L.LatLngLiteral; angle0: number; start: Corners; detail: DetailLayer | null } | null = null
    const angleAt = (e: MouseEvent) => {
      const c = map.latLngToContainerPoint(rot!.centre)
      const p = map.mouseEventToContainerPoint(e)
      return Math.atan2(p.y - c.y, p.x - c.x)
    }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 2) return
      e.preventDefault()
      const d = detailRef.current
      if (editingRef.current === 'detail') {
        // The detail image rotates the same way, around its own centre.
        if (!d) return
        const mid = { x: (d.corners[0].x + d.corners[2].x) / 2, y: (d.corners[0].y + d.corners[2].y) / 2 }
        rot = { centre: pixelToLatLng(mid, cornersRef.current, set.width, set.height), angle0: 0, start: cornersRef.current, detail: d }
      } else {
        rot = { centre: centerOf(cornersRef.current), angle0: 0, start: cornersRef.current, detail: null }
      }
      rot.angle0 = angleAt(e)
    }
    const onMove = (e: MouseEvent) => {
      if (!rot) return
      if (rot.detail) {
        // Image pixels and screen angles both run clockwise, so the angle is used as it is.
        commitDetail({ ...rot.detail, corners: transformDetail(rot.detail.corners, 1, angleAt(e) - rot.angle0) })
        return
      }
      // Screen angles run clockwise; the metre plane runs counter-clockwise, hence the minus sign.
      const delta = -(angleAt(e) - rot.angle0)
      const next = rotateCorners(rot.start, delta)
      cornersRef.current = next
      setCorners(next)
    }
    const onUp = () => {
      if (!rot) return
      const wasDetail = rot.detail !== null
      rot = null
      if (!wasDetail) applyRef.current(cornersRef.current)
    }
    el.addEventListener('contextmenu', onContext)
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)

    refs.current = { map, overlay, handles, centre, points }
    return () => {
      el.removeEventListener('contextmenu', onContext)
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      map.remove()
      refs.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.imageUrl])

  // Detail image handles. Only the three editable corners move; the fourth follows, so the shape stays a parallelogram.
  const toLL = (p: Point) => pixelToLatLng(p, cornersRef.current, set.width, set.height)
  const toPx = (ll: L.LatLngLiteral) => latLngToPixel(ll, cornersRef.current, set.width, set.height)
  function commitDetail(next: DetailLayer | null) {
    detailRef.current = next
    onDetailRef.current?.(next)
  }
  /** Same as the first image: dragging a corner resizes the whole image evenly from its centre, so it keeps its shape and never leans. */
  function moveDetailCorner(i: 0 | 1 | 3, ll: L.LatLngLiteral) {
    const cur = detailRef.current
    if (!cur) return
    const p = toPx(ll)
    const c = cur.corners
    const mid = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 }
    const before = Math.hypot(c[i].x - mid.x, c[i].y - mid.y)
    const after = Math.hypot(p.x - mid.x, p.y - mid.y)
    if (before < 1 || after < 1) return
    commitDetail({ ...cur, corners: transformDetail(c, after / before, 0) })
  }
  function moveDetailCentre(ll: L.LatLngLiteral) {
    const cur = detailRef.current
    if (!cur) return
    const c = cur.corners
    const old = { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 }
    const now = toPx(ll)
    const shift = (q: Point): Point => ({ x: q.x + now.x - old.x, y: q.y + now.y - old.y })
    commitDetail({ ...cur, corners: squareUp(affineCorners(shift(c[0]), shift(c[1]), shift(c[3]))) })
  }

  useEffect(() => {
    const r = refs.current
    const d = detailRef.current
    if (!r || !d) return
    const map = r.map
    const square = L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;border-radius:4px;background:#fff;border:3px solid #f59e0b;box-shadow:0 0 0 2px rgba(0,0,0,.35)"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    })
    const round = L.divIcon({
      className: '',
      html: '<div style="width:24px;height:24px;border-radius:50%;background:rgba(245,158,11,.95);border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.35)"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
    const c = d.corners
    const centreLL = toLL({ x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 })
    const overlay = rotatedOverlay(d.imageUrl, toLL(c[0]), toLL(c[1]), toLL(c[3]), { opacity: 0.7, interactive: false }).addTo(map)
    const tl = L.marker(toLL(c[0]), { draggable: true, icon: square }).addTo(map)
    const tr = L.marker(toLL(c[1]), { draggable: true, icon: square }).addTo(map)
    const bl = L.marker(toLL(c[3]), { draggable: true, icon: square }).addTo(map)
    const centre = L.marker(centreLL, { draggable: true, icon: round }).addTo(map)
    tl.on('drag', () => moveDetailCorner(0, tl.getLatLng()))
    tr.on('drag', () => moveDetailCorner(1, tr.getLatLng()))
    bl.on('drag', () => moveDetailCorner(3, bl.getLatLng()))
    centre.on('drag', () => moveDetailCentre(centre.getLatLng()))
    detailHandles.current = { overlay, tl, tr, bl, centre }
    return () => {
      overlay.remove()
      tl.remove()
      tr.remove()
      bl.remove()
      centre.remove()
      detailHandles.current = null
    }
    // Rebuilt only when the image itself changes. Corner moves update the existing handles below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailKey, set.imageUrl])

  // Lock the image that is not being edited: its handles stop dragging.
  useEffect(() => {
    const r = refs.current
    const d = detailHandles.current
    const overviewOn = editing === 'overview'
    if (r) for (const m of [r.handles.tl, r.handles.tr, r.handles.bl, r.centre]) (overviewOn ? m.dragging?.enable() : m.dragging?.disable())
    if (d) for (const m of [d.tl, d.tr, d.bl, d.centre]) (overviewOn ? m.dragging?.disable() : m.dragging?.enable())
  }, [editing, detailKey, set.imageUrl])

  useEffect(() => {
    const h = detailHandles.current
    if (!h || !detail) return
    const c = detail.corners
    h.overlay.reposition(toLL(c[0]), toLL(c[1]), toLL(c[3]))
    h.tl.setLatLng(toLL(c[0]))
    h.tr.setLatLng(toLL(c[1]))
    h.bl.setLatLng(toLL(c[3]))
    h.centre.setLatLng(toLL({ x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, corners])

  // Keep the overlay and handles in step with the corners.
  useEffect(() => {
    const r = refs.current
    if (!r) return
    r.overlay.reposition(corners.tl, corners.tr, corners.bl)
    r.handles.tl.setLatLng(corners.tl)
    r.handles.tr.setLatLng(corners.tr)
    r.handles.bl.setLatLng(corners.bl)
    r.centre.setLatLng(centerOf(corners))
  }, [corners])

  // Saved control points (green), checkpoints (blue) and the picked point (red ring).
  useEffect(() => {
    const r = refs.current
    if (!r) return
    r.points.clearLayers()
    for (const p of calibration.controlPoints) {
      if (p.id.startsWith('img-')) continue
      L.circleMarker(pixelToLatLng(p, corners, set.width, set.height), { radius: 7, color: '#ffffff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 })
        .bindTooltip(p.id)
        .addTo(r.points)
    }
    for (const p of calibration.checkpoints) {
      L.circleMarker(pixelToLatLng(p, corners, set.width, set.height), { radius: 7, color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 })
        .bindTooltip(p.id)
        .addTo(r.points)
    }
    if (pending) {
      L.circleMarker(pixelToLatLng(pending, corners, set.width, set.height), { radius: 10, color: '#dc2626', weight: 3, fill: false }).addTo(r.points)
    }
  }, [calibration, corners, pending, set.width, set.height])

  useEffect(() => {
    refs.current?.overlay.setOpacity(opacity)
  }, [opacity])

  useEffect(() => {
    detailHandles.current?.overlay.setOpacity(detailOpacity)
  }, [detailOpacity, detailKey])

  // Size of whichever image is being edited, in metres on the ground.
  const detailLL: Corners | null = detail ? { tl: toLL(detail.corners[0]), tr: toLL(detail.corners[1]), bl: toLL(detail.corners[3]) } : null
  const editingDetail = editing === 'detail' && detailLL !== null
  const dims = editingDetail && detailLL ? axisLengths(detailLL) : axisLengths(corners)
  const width = Math.round(dims.w)
  const height = Math.round(dims.h)
  const shownOpacity = editingDetail ? detailOpacity : opacity

  /** Stretches the detail image along its own width or height, keeping its other corners in place. */
  function sizeDetail(sx: number, sy: number) {
    const cur = detailRef.current
    if (!cur) return
    const ll: Corners = { tl: toLL(cur.corners[0]), tr: toLL(cur.corners[1]), bl: toLL(cur.corners[3]) }
    const next = scaleAxes(ll, sx, sy)
    commitDetail({ ...cur, corners: squareUp(affineCorners(toPx(next.tl), toPx(next.tr), toPx(next.bl))) })
  }

  async function pickDetail(file: File | undefined) {
    if (!file) return
    setHint('Uploading detail image…')
    try {
      // Keep the picked size: the back image must match the first image's scale, so it is not shrunk.
      const img = await uploadPrepared(await prepareExactImage(file))
      const cur = detailRef.current
      commitDetail({
        imageUrl: img.url,
        width: img.width,
        height: img.height,
        // Keeps the picked size. A replaced image is centred where the previous one was.
        corners: cur ? centredCorners({ x: (cur.corners[0].x + cur.corners[2].x) / 2, y: (cur.corners[0].y + cur.corners[2].y) / 2 }, img.width, img.height) : startingDetailCorners(set.width, set.height, img.width, img.height),
        zoomFactor: cur?.zoomFactor ?? 2,
      })
      setHint('Drag the amber handles onto the map, then press Save.')
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'Could not read that image.')
    }
  }

  const panelBody = (
        <div className={inlinePanel ? 'space-y-4 text-sm' : 'absolute right-3 top-3 z-[1000] w-[min(280px,calc(100%-24px))] space-y-4 rounded-xl bg-surface p-4 text-sm shadow-xl ring-1 ring-line'}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-600">Geofence</div>
              <div className="truncate font-bold text-ink">Georeference</div>
            </div>
            {!inlinePanel &&             <button onClick={onTogglePanel} className="shrink-0 rounded-lg bg-surface2 px-2.5 py-1.5 text-xs font-semibold text-ink2 hover:bg-line">
              Hide
            </button>}
          </div>
          <p className="text-xs leading-relaxed text-ink2">
            Drag a white corner to resize, the red centre to move, and hold the right mouse button to rotate.
          </p>
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink2">Image to edit</div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface2 p-1 text-xs font-semibold">
              <button onClick={() => setEditing('overview')} className={`rounded-md py-1.5 ${editing === 'overview' ? 'bg-brand text-white' : 'text-ink2'}`}>
                Overview
              </button>
              <button
                onClick={() => setEditing('detail')}
                disabled={!detail}
                className={`rounded-md py-1.5 disabled:opacity-40 ${editing === 'detail' ? 'bg-[#F59E0B] text-ink' : 'text-ink2'}`}
              >
                Detail
              </button>
            </div>
            {!detail && <div className="mt-1 text-[11px] text-ink3">Add a detail image below to edit it.</div>}
          </div>
          <p className="text-xs leading-relaxed text-ink2">
            Edit one image at a time. The other stays where it is.
          </p>
          <label className="block text-xs font-medium text-ink2">
            Width on the ground: <span className="font-bold text-ink">{width} m</span>
            <input
              type="range"
              min={5}
              max={800}
              step={1}
              value={Math.min(800, Math.max(5, width))}
              onChange={(e) => {
                if (editingDetail) {
                  if (dims.w > 0) sizeDetail(Number(e.target.value) / dims.w, 1)
                  return
                }
                const cur = axisLengths(cornersRef.current)
                if (cur.w > 0) applyRef.current(scaleAxes(cornersRef.current, Number(e.target.value) / cur.w, 1))
              }}
              className="mt-2 w-full accent-[#1a56db]"
            />
          </label>
          <label className="block text-xs font-medium text-ink2">
            Height on the ground: <span className="font-bold text-ink">{height} m</span>
            <input
              type="range"
              min={5}
              max={800}
              step={1}
              value={Math.min(800, Math.max(5, height))}
              onChange={(e) => {
                if (editingDetail) {
                  if (dims.h > 0) sizeDetail(1, Number(e.target.value) / dims.h)
                  return
                }
                const cur = axisLengths(cornersRef.current)
                if (cur.h > 0) applyRef.current(scaleAxes(cornersRef.current, 1, Number(e.target.value) / cur.h))
              }}
              className="mt-2 w-full accent-[#1a56db]"
            />
          </label>
          <label className="block text-xs font-medium text-ink2">
            Opacity: <span className="font-bold text-ink">{Math.round(shownOpacity * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={shownOpacity}
              onChange={(e) => (editingDetail ? setDetailOpacity(Number(e.target.value)) : setOpacity(Number(e.target.value)))}
              className="mt-2 w-full accent-[#1a56db]"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={editingDetail}
              onClick={() => applyRef.current(cornersFor(centerOf(cornersRef.current), widthOf(cornersRef.current), aspect))}
              className="rounded-lg bg-surface2 px-3 py-2 text-xs font-semibold text-ink hover:bg-line disabled:opacity-40"
            >
              Reset orientation
            </button>
            <button
              disabled={!center}
              onClick={() => {
                if (!center) return
                // Move the whole image so its centre sits on the campground's saved position, then bring the view there.
                const cur = centerOf(cornersRef.current)
                applyRef.current(moveCorners(cornersRef.current, center.lat - cur.lat, center.lng - cur.lng))
                refs.current?.map.setView(center, 19)
              }}
              className="rounded-lg bg-surface2 px-3 py-2 text-xs font-semibold text-ink hover:bg-line disabled:opacity-40"
            >
              Move to campground location
            </button>
          </div>
          {hint && <div className="text-xs text-ink2">{hint}</div>}
          {onDetail && (
            <div className="space-y-3 rounded-lg border border-line p-3">
              <div className="text-xs font-bold text-ink">Detail map</div>
              <p className="text-[11px] leading-relaxed text-ink2">
                Drag an amber corner to resize it evenly, the amber centre to move it, and hold the right mouse button to rotate it. It stays square to itself and cannot lean. It shows on the map once zoomed in over its area.
              </p>
              <label className="block w-full cursor-pointer rounded-lg bg-surface2 px-3 py-2 text-center text-xs font-semibold text-ink hover:bg-line">
                {detail ? 'Replace detail image' : 'Add detail image'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void pickDetail(e.target.files?.[0])} />
              </label>
              {detail && (
                <>
                  <div className={`text-[11px] ${detail.width >= set.width && detail.height >= set.height ? 'text-ink2' : 'text-red-400'}`}>
                    Back image {detail.width} × {detail.height} px, kept at its own size. Resize and move it so the first image sits inside it.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => onSaveDetail?.()} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dim">
                      Save changes
                    </button>
                    <button
                      onClick={() => {
                        commitDetail(null)
                        setHint('Detail image removed. Press Save to apply.')
                      }}
                      className="rounded-lg bg-surface2 px-3 py-2 text-xs font-semibold text-ink hover:bg-line"
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
              {detailStatus && <div className="text-xs text-ink2">{detailStatus}</div>}
            </div>
          )}
        </div>
  )

  return (
    <div className="absolute inset-0">
      <div ref={container} className="absolute inset-0" />
      {inlinePanel ? (panelTarget ? createPortal(panelBody, panelTarget) : null) : panelOpen ? panelBody : (
        <button onClick={onTogglePanel} className="absolute right-3 top-3 z-[1000] rounded-xl bg-surface px-3 py-2 text-xs font-semibold text-ink shadow-lg">
          Show georeference
        </button>
      )}
    </div>
  )
}
