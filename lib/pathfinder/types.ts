export interface Point {
  x: number
  y: number
}

export type Category = 'campsite' | 'building' | 'amenity'

/** 'estimated' = position read by eye from the illustrated map; 'verified' = checked on site. */
export type Placement = 'estimated' | 'verified'

export interface Destination extends Point {
  id: string
  name: string
  category: Category
  /** Site type for the category list (tent, rv, cabin, …). Optional: unlisted sites show under All. */
  kind?: string
  description?: string
  placement: Placement
  /** Walkable spot the route should reach first, when the pin itself is not on or next to a road. */
  access?: Point
}

export interface RoadNode extends Point {
  id: string
}

export interface RoadEdge {
  id: string
  from: string
  to: string
  name: string
  modes: Array<'drive' | 'walk'>
  placement: Placement
  /** Optional curve points between the two nodes (image pixels, in from→to order). */
  points?: Point[]
  /** One-way road for vehicles: traffic may only go from `from` to `to` (the direction it was drawn). */
  oneWay?: boolean
}

export interface RoadNetwork {
  nodes: RoadNode[]
  edges: RoadEdge[]
}

export interface ControlPoint extends Point {
  id: string
  lat: number
  lon: number
}

export interface CalibrationFile {
  version: number
  notes: string
  controlPoints: ControlPoint[]
  checkpoints: ControlPoint[]
  /** Where the image sits on the real map (set in the georeference view). */
  georef?: { lat: number; lon: number; widthM: number }
  /** Image size the control points were measured on. A different size means the calibration is stale. */
  image?: { width: number; height: number }
  /** Default orientation of the map image in degrees clockwise. Shown on load; changes only while navigating. */
  orientation?: number
  /** Zoom (as a multiple of the full view) at which the first map image comes on top of the second. */
  layerZoom?: number
}

export interface RouteStep {
  instruction: string
  point: Point
  /** Index into Route.points where this instruction applies. */
  pathIndex: number
}

export interface Route {
  points: Point[]
  steps: RouteStep[]
  lengthPx: number
  destination: Destination
}

export type GpsStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'timeout' | 'error'

export interface GpsFix {
  lat: number
  lon: number
  accuracy: number
  timestamp: number
}
