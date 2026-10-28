import type { CalibrationFile, ControlPoint, Destination, Point, RoadEdge, RoadNetwork, RoadNode } from './types'
import type { DetailLayer, ExtendedImage } from './detailLayer'
import { CATEGORIES, PLACEMENTS, type CampgroundInput, type CampgroundRecord, type Network, type Pin, type Walkway } from './model'

/**
 * Server-side checks for everything the map screens save. The browser is never trusted: each value is checked for
 * type, range and size, unknown fields are dropped (so nothing extra can be written), and bad input is refused with a
 * message the person can act on.
 */
export class ValidationError extends Error {}

const bad = (msg: string): never => {
  throw new ValidationError(msg)
}

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
/** Ids made inside the editors (pins, roads, nodes): letters, digits and . _ : - */
const ITEM_ID_RE = /^[A-Za-z0-9._:-]{1,160}$/

/** The most the screens may store per map. Generous for a real campground, small enough to stop abuse. */
export const LIMITS = {
  campgroundsPerHub: 1, // one map per hub
  pins: 3000,
  walkways: 2000,
  walkwayPoints: 5000,
  obstacles: 500,
  obstaclePoints: 2000,
  roadNodes: 20000,
  roadEdges: 20000,
  edgePoints: 2000,
  controlPoints: 500,
  /** Largest JSON text kept for one map's network or calibration. */
  jsonBytes: 2_500_000,
  /** Largest side of an image, in pixels. */
  imageSide: 30000,
} as const

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function num(v: unknown, label: string, min = -1e7, max = 1e7): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return bad(`${label} is not a valid number.`)
  return v
}

function str(v: unknown, label: string, max: number, required = true): string {
  if (typeof v !== 'string') return required ? bad(`${label} is missing.`) : ''
  const s = v.trim()
  if (required && !s) return bad(`${label} is missing.`)
  if (s.length > max) return bad(`${label} is too long (most ${max} characters).`)
  // Control characters have no place in names or notes.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s)) return bad(`${label} has characters that are not allowed.`)
  return s
}

function list(v: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(v)) return bad(`${label} must be a list.`)
  if (v.length > max) return bad(`${label} has too many entries (most ${max}).`)
  return v
}

export function httpsUrl(v: unknown, label: string): string {
  if (typeof v !== 'string' || v.length > 2048) return bad(`${label} is not a valid address.`)
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:') return bad(`${label} must start with https://.`)
    return u.toString()
  } catch {
    return bad(`${label} is not a valid address.`)
  }
}

export function parseId(v: unknown, label = 'Campground'): string {
  if (typeof v !== 'string' || !ID_RE.test(v)) return bad(`${label} could not be found.`)
  return v
}

const point = (v: unknown, label: string): Point => {
  if (!isObj(v)) return bad(`${label} is not a valid point.`)
  return { x: num(v.x, label), y: num(v.y, label) }
}

export function parseImage(v: unknown, label = 'Map image'): { url: string; width: number; height: number } {
  if (!isObj(v)) return bad(`${label} is missing.`)
  const width = num(v.width, `${label} width`, 1, LIMITS.imageSide)
  const height = num(v.height, `${label} height`, 1, LIMITS.imageSide)
  if (!Number.isInteger(width) || !Number.isInteger(height)) return bad(`${label} size is not valid.`)
  return { url: httpsUrl(v.url, label), width, height }
}

/** The campground form: name, visibility, default centre and (when new or changed) the uploaded picture. */
export function parseCampgroundInput(v: unknown, requireImage: boolean): CampgroundInput {
  if (!isObj(v)) return bad('The campground details are missing.')
  const out: CampgroundInput = {
    name: str(v.name, 'The name', 100),
    public: typeof v.public === 'boolean' ? v.public : bad('Choose public or private.'),
    centerLat: num(v.centerLat, 'The latitude', -90, 90),
    centerLon: num(v.centerLon, 'The longitude', -180, 180),
  }
  if (v.image !== undefined && v.image !== null) out.image = parseImage(v.image)
  else if (requireImage) bad('A map image is required for a new campground.')
  return out
}

function corners(v: unknown, label: string): [Point, Point, Point, Point] {
  const c = list(v, `${label} corners`, 4)
  if (c.length !== 4) return bad(`${label} needs four corners.`)
  return [point(c[0], label), point(c[1], label), point(c[2], label), point(c[3], label)]
}

/** The optional detail (back) image. null removes it. */
export function parseDetail(v: unknown): DetailLayer | null {
  if (v === null || v === undefined) return null
  if (!isObj(v)) return bad('The detail image is not valid.')
  const img = parseImage({ url: v.imageUrl, width: v.width, height: v.height }, 'Detail image')
  return { imageUrl: img.url, width: img.width, height: img.height, corners: corners(v.corners, 'Detail image'), zoomFactor: num(v.zoomFactor, 'The zoom factor', 1, 6) }
}

/** The optional extended (surrounding artwork) image. null removes it. */
export function parseExtended(v: unknown): ExtendedImage | null {
  if (v === null || v === undefined) return null
  if (!isObj(v)) return bad('The second image is not valid.')
  const img = parseImage({ url: v.imageUrl, width: v.width, height: v.height }, 'Second image')
  return { imageUrl: img.url, width: img.width, height: img.height, corners: corners(v.corners, 'Second image') }
}

function pin(v: unknown, i: number): Pin {
  const where = `Location ${i + 1}`
  if (!isObj(v)) return bad(`${where} is not valid.`)
  const category = v.category
  const placement = v.placement
  if (!CATEGORIES.includes(category as never)) return bad(`${where} has an unknown group.`)
  if (!PLACEMENTS.includes(placement as never)) return bad(`${where} has an unknown placement.`)
  if (typeof v.id !== 'string' || !ITEM_ID_RE.test(v.id)) return bad(`${where} has an invalid id.`)
  const out: Pin = {
    id: v.id,
    name: str(v.name, `${where} name`, 200),
    category: category as Destination['category'],
    placement: placement as Destination['placement'],
    x: num(v.x, `${where} position`),
    y: num(v.y, `${where} position`),
  }
  if (v.description !== undefined && v.description !== null) {
    const d = str(v.description, `${where} description`, 2000, false)
    if (d) out.description = d
  }
  if (v.kind !== undefined && v.kind !== null) {
    const k = str(v.kind, `${where} type`, 40, false)
    if (k) out.kind = k
  }
  if (v.access !== undefined && v.access !== null) out.access = point(v.access, `${where} access point`)
  if (v.lat !== undefined) out.lat = num(v.lat, `${where} latitude`, -90, 90)
  if (v.lng !== undefined) out.lng = num(v.lng, `${where} longitude`, -180, 180)
  return out
}

function walkway(v: unknown, i: number): Walkway {
  const where = `Walkway ${i + 1}`
  if (!isObj(v) || typeof v.id !== 'string' || !ITEM_ID_RE.test(v.id)) return bad(`${where} is not valid.`)
  const pts = list(v.points, `${where} points`, LIMITS.walkwayPoints).map((p) => {
    if (!isObj(p)) return bad(`${where} has an invalid point.`)
    return { lng: num(p.lng, where, -180, 180), lat: num(p.lat, where, -90, 90) }
  })
  return { id: v.id, points: pts }
}

function roads(v: unknown): RoadNetwork {
  if (!isObj(v)) return bad('The road network is not valid.')
  const nodes: RoadNode[] = list(v.nodes, 'Road points', LIMITS.roadNodes).map((n, i) => {
    if (!isObj(n) || typeof n.id !== 'string' || !ITEM_ID_RE.test(n.id)) return bad(`Road point ${i + 1} is not valid.`)
    return { id: n.id, x: num(n.x, `Road point ${i + 1}`), y: num(n.y, `Road point ${i + 1}`) }
  })
  const ids = new Set(nodes.map((n) => n.id))
  const edges: RoadEdge[] = list(v.edges, 'Roads', LIMITS.roadEdges).map((e, i) => {
    const where = `Road ${i + 1}`
    if (!isObj(e) || typeof e.id !== 'string' || !ITEM_ID_RE.test(e.id)) return bad(`${where} is not valid.`)
    if (typeof e.from !== 'string' || typeof e.to !== 'string' || !ids.has(e.from) || !ids.has(e.to)) return bad(`${where} joins a point that does not exist.`)
    const modes = list(e.modes, `${where} modes`, 2)
    if (!modes.every((m) => m === 'drive' || m === 'walk')) return bad(`${where} has an unknown mode.`)
    if (!PLACEMENTS.includes(e.placement as never)) return bad(`${where} has an unknown placement.`)
    const edge: RoadEdge = { id: e.id, from: e.from, to: e.to, name: str(e.name, `${where} name`, 200, false), modes: modes as RoadEdge['modes'], placement: e.placement as RoadEdge['placement'] }
    if (e.points !== undefined && e.points !== null) edge.points = list(e.points, `${where} curve`, LIMITS.edgePoints).map((p) => point(p, where))
    if (e.oneWay !== undefined) edge.oneWay = e.oneWay === true
    return edge
  })
  return { nodes, edges }
}

/** Pins, walkways, obstacles and roads for one map. Returns a clean copy that holds only the known fields. */
export function parseNetwork(v: unknown): Network {
  if (!isObj(v)) return bad('The map data is missing.')
  const out: Network = {
    pins: list(v.pins ?? [], 'Locations', LIMITS.pins).map(pin),
    walkways: list(v.walkways ?? [], 'Walkways', LIMITS.walkways).map(walkway),
    obstacles: list(v.obstacles ?? [], 'Obstacles', LIMITS.obstacles).map((o, i) => list(o, `Obstacle ${i + 1}`, LIMITS.obstaclePoints).map((p) => point(p, `Obstacle ${i + 1}`))),
  }
  if (v.roads !== undefined && v.roads !== null) out.roads = roads(v.roads)
  const ids = new Set<string>()
  for (const p of out.pins) {
    if (ids.has(p.id)) return bad(`Two locations share the id ${p.id}.`)
    ids.add(p.id)
  }
  return out
}

function controlPoint(v: unknown, label: string): ControlPoint {
  if (!isObj(v) || typeof v.id !== 'string' || !ITEM_ID_RE.test(v.id)) return bad(`${label} is not valid.`)
  return { id: v.id, x: num(v.x, label), y: num(v.y, label), lat: num(v.lat, label, -90, 90), lon: num(v.lon, label, -180, 180) }
}

/** The calibration (reference points, checkpoints and the georeference). */
export function parseCalibration(v: unknown): CalibrationFile {
  if (!isObj(v)) return bad('The calibration is missing.')
  const out: CalibrationFile = {
    version: num(v.version, 'The calibration version', 0, 1000),
    notes: str(v.notes ?? '', 'The notes', 2000, false),
    controlPoints: list(v.controlPoints ?? [], 'Reference points', LIMITS.controlPoints).map((p, i) => controlPoint(p, `Reference point ${i + 1}`)),
    checkpoints: list(v.checkpoints ?? [], 'Checkpoints', LIMITS.controlPoints).map((p, i) => controlPoint(p, `Checkpoint ${i + 1}`)),
  }
  if (v.georef !== undefined && v.georef !== null) {
    if (!isObj(v.georef)) return bad('The georeference is not valid.')
    out.georef = { lat: num(v.georef.lat, 'The georeference', -90, 90), lon: num(v.georef.lon, 'The georeference', -180, 180), widthM: num(v.georef.widthM, 'The map width', 0, 1e6) }
  }
  if (v.image !== undefined && v.image !== null) {
    if (!isObj(v.image)) return bad('The image size is not valid.')
    out.image = { width: num(v.image.width, 'The image width', 1, LIMITS.imageSide), height: num(v.image.height, 'The image height', 1, LIMITS.imageSide) }
  }
  if (v.orientation !== undefined && v.orientation !== null) out.orientation = num(v.orientation, 'The orientation', -720, 720)
  if (v.layerZoom !== undefined && v.layerZoom !== null) out.layerZoom = num(v.layerZoom, 'The layer zoom', 0, 100)
  return out
}

/** JSON text for storage. Refuses anything larger than the limit, so one save cannot fill the database. */
export function toStoredJson(value: unknown): string {
  const json = JSON.stringify(value)
  if (json.length > LIMITS.jsonBytes) return bad('This map has more data than can be saved. Remove some locations or roads.')
  return json
}

/** Reads stored JSON text back; null for anything unreadable (the screens then start from empty). */
export function fromStoredJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** A stored campground record, checked on the way out too. Returns null for a record that is damaged. */
export function recordFromStored(id: string, raw: unknown): CampgroundRecord | null {
  if (!ID_RE.test(id) || !isObj(raw)) return null
  try {
    const image = parseImage({ url: raw.mapImage, width: raw.mapWidth, height: raw.mapHeight })
    const rec: CampgroundRecord = {
      id,
      name: str(raw.name, 'name', 100),
      public: raw.public === true,
      mapImage: image.url,
      mapWidth: image.width,
      mapHeight: image.height,
      centerLat: num(raw.centerLat, 'latitude', -90, 90),
      centerLon: num(raw.centerLon, 'longitude', -180, 180),
    }
    const detail = raw.detail ? parseDetail(raw.detail) : null
    const extended = raw.extended ? parseExtended(raw.extended) : null
    if (detail) rec.detail = detail
    if (extended) rec.extended = extended
    if (typeof raw.updatedAt === 'string') rec.updatedAt = raw.updatedAt.slice(0, 40)
    return rec
  } catch {
    return null
  }
}
