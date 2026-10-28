import type { Destination, Point, Route, RouteStep, RoadNetwork, RoadEdge } from './types'
import { simplifyPolyline, smoothPolyline } from './smoothPath'
import { dist, pixelBearing, shortestDelta } from './geo'

export type TravelMode = 'drive' | 'walk'

/** A blocked area in image pixels (a building, fence, lake...). Connectors may not cross or start inside one. */
export type Obstacle = Point[]

export interface Snap {
  point: Point
  edge: RoadEdge
  /** Which geometry segment of the edge the snap lies on (0 = from the edge's start node). */
  segIndex: number
  /** Straight-line distance in image pixels from the snapped position to the road. */
  distance: number
}

/** Full centreline of an edge in image pixels: its two nodes plus any curve points, in from→to order. */
export function roadGeometry(e: RoadEdge, nodes: Map<string, Point>): Point[] | null {
  const a = nodes.get(e.from)
  const b = nodes.get(e.to)
  if (!a || !b) return null
  return [a, ...(e.points ?? []), b]
}

export function polylineLength(pts: Point[]): number {
  let s = 0
  for (let i = 0; i + 1 < pts.length; i++) s += dist(pts[i], pts[i + 1])
  return s
}

/** Nearest point on one edge's centreline (curves included). */
function snapOnEdge(p: Point, e: RoadEdge, nodes: Map<string, Point>): Snap | null {
  const g = roadGeometry(e, nodes)
  if (!g) return null
  let best: Snap | null = null
  for (let k = 0; k + 1 < g.length; k++) {
    const a = g[k]
    const b = g[k + 1]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2))
    const q = { x: a.x + abx * t, y: a.y + aby * t }
    const d = dist(p, q)
    if (!best || d < best.distance) best = { point: q, edge: e, segIndex: k, distance: d }
  }
  return best
}

/** Nearest point on any road segment (curves included) that allows the given travel mode. */
export function snapToNetwork(p: Point, net: RoadNetwork, mode: TravelMode): Snap | null {
  const nodes = new Map<string, Point>(net.nodes.map((n) => [n.id, n]))
  let best: Snap | null = null
  for (const e of net.edges) {
    if (!e.modes.includes(mode)) continue
    const s = snapOnEdge(p, e, nodes)
    if (s && (!best || s.distance < best.distance)) best = s
  }
  return best
}

// ---- Connector validity -------------------------------------------------------------------

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** True when segment p1–p2 properly crosses segment q1–q2. */
function segmentsCross(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = cross(q1, q2, p1)
  const d2 = cross(q1, q2, p2)
  const d3 = cross(p1, p2, q1)
  const d4 = cross(p1, p2, q2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** Ray-casting point-in-polygon test. */
function insidePolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * A straight connector from a position to a road is valid only if it neither starts inside a blocked area
 * nor crosses one. Blocked areas are never walked through to force a route.
 */
export function connectorClear(a: Point, b: Point, obstacles: Obstacle[]): boolean {
  for (const poly of obstacles) {
    if (poly.length < 3) continue
    if (insidePolygon(a, poly) || insidePolygon(b, poly)) return false
    for (let i = 0; i < poly.length; i++) {
      if (segmentsCross(a, b, poly[i], poly[(i + 1) % poly.length])) return false
    }
  }
  return true
}

/**
 * Longest straight connector (image pixels) a route may use to leave the road network. Longer hops would let a
 * drive route cut across open ground. Pixels are not metres (the campground map is not to scale), so revisit
 * this once the campground's scale is known.
 */
export const MAX_CONNECTOR_PX = 60

/**
 * Up to `limit` candidate road segments for a position, nearest first. A candidate must have a connector no
 * longer than `maxConnectorPx` that is clear of obstacles. Each edge contributes at most one candidate.
 */
export function snapCandidates(
  p: Point,
  net: RoadNetwork,
  mode: TravelMode,
  obstacles: Obstacle[] = [],
  maxConnectorPx = MAX_CONNECTOR_PX,
  limit = 4,
): Snap[] {
  const nodes = new Map<string, Point>(net.nodes.map((n) => [n.id, n]))
  const perEdge: Snap[] = []
  for (const e of net.edges) {
    if (!e.modes.includes(mode)) continue
    const s = snapOnEdge(p, e, nodes)
    if (s) perEdge.push(s)
  }
  perEdge.sort((a, b) => a.distance - b.distance)
  return perEdge
    .filter((s) => s.distance <= maxConnectorPx && connectorClear(p, s.point, obstacles))
    .slice(0, limit)
}

// ---- Routing -----------------------------------------------------------------------------

interface Arc {
  to: string
  w: number
  edgeName: string
  /** Points strictly between the two ends of this arc, in travel order. */
  geom: Point[]
}

/**
 * no-start-connector: no clear straight line from the position to any road.
 * no-destination-connector: no clear straight line from the destination (or its access point) to any road.
 * disconnected: both ends reach roads, but those roads are not joined in one network.
 */
export type RouteStage = 'invalid-input' | 'no-network' | 'no-start-connector' | 'no-destination-connector' | 'disconnected'

export interface SnapSummary {
  edgeId: string
  /** Connector length in image pixels (0 when the position is on the road). */
  connectorPx: number
}

export interface RouteDiagnostics {
  startCandidates: number
  goalCandidates: number
  /** Start/goal candidate pairs that were searched. */
  pairsTried: number
  startSnap: SnapSummary | null
  goalSnap: SnapSummary | null
}

export type PlanResult =
  | { route: Route; diagnostics: RouteDiagnostics }
  | { error: string; stage: RouteStage; diagnostics: RouteDiagnostics }

interface Searched {
  ids: string[]
  arcs: Arc[]
  pos: Map<string, Point>
}

/** A* over the road graph with temporary start and goal nodes. The saved network is never changed. */
function searchGraph(
  start: Point,
  goal: Point,
  sStart: Snap,
  sGoal: Snap,
  nodes: Map<string, Point>,
  net: RoadNetwork,
  mode: TravelMode,
): Searched | null {
  const pos = new Map<string, Point>(nodes)
  const adj = new Map<string, Arc[]>()
  const addArc = (from: string, arc: Arc) => adj.set(from, [...(adj.get(from) ?? []), arc])
  // Every road is two way: traffic can go either direction along it.
  const link = (a: string, b: string, edgeName: string, geom: Point[]) => {
    const w = polylineLength([pos.get(a)!, ...geom, pos.get(b)!])
    addArc(a, { to: b, w, edgeName, geom })
    addArc(b, { to: a, w, edgeName, geom: [...geom].reverse() })
  }

  for (const e of net.edges) {
    if (!e.modes.includes(mode)) continue
    const g = roadGeometry(e, nodes)
    if (!g) continue
    // The road is smoothed so the route bends gently; it still passes through every drawn point.
    link(e.from, e.to, e.name, smoothPolyline(simplifyPolyline(g)).slice(1, -1))
  }

  pos.set('__start', start)
  pos.set('__goal', goal)

  // Connect a virtual point to both ends of the segment it lies on, following the curve.
  // The connector from the virtual point to the road is the first piece of each arc.
  const attach = (virtual: string, snap: Snap) => {
    const g = roadGeometry(snap.edge, nodes)
    if (!g) return
    const k = snap.segIndex
    const towardFrom = [snap.point, ...g.slice(1, k + 1).reverse()]
    const towardTo = [snap.point, ...g.slice(k + 1, g.length - 1)]
    link(virtual, snap.edge.from, snap.edge.name, towardFrom)
    link(virtual, snap.edge.to, snap.edge.name, towardTo)
  }
  attach('__start', sStart)
  attach('__goal', sGoal)

  // Start and goal on the same road: allow the direct run along that road too.
  if (sStart.edge.id === sGoal.edge.id) {
    const g = roadGeometry(sStart.edge, nodes)
    if (g) {
      const ks = sStart.segIndex
      const kg = sGoal.segIndex
      const mid =
        ks === kg
          ? [sStart.point, sGoal.point]
          : ks < kg
            ? [sStart.point, ...g.slice(ks + 1, kg + 1), sGoal.point]
            : [sStart.point, ...g.slice(kg + 1, ks + 1).reverse(), sGoal.point]
      link('__start', '__goal', sStart.edge.name, mid)
    }
  }

  const h = (id: string) => dist(pos.get(id)!, goal)
  const g = new Map<string, number>([['__start', 0]])
  const came = new Map<string, { prev: string; arc: Arc }>()
  const open = new Set<string>(['__start'])
  const closed = new Set<string>()

  while (open.size) {
    let cur = ''
    let bestF = Infinity
    for (const id of open) {
      const f = (g.get(id) ?? Infinity) + h(id)
      if (f < bestF) {
        bestF = f
        cur = id
      }
    }
    if (cur === '') break // no finite score left: nothing reachable
    if (cur === '__goal') break
    open.delete(cur)
    closed.add(cur)
    for (const arc of adj.get(cur) ?? []) {
      if (closed.has(arc.to)) continue
      const tentative = (g.get(cur) ?? 0) + arc.w
      if (tentative < (g.get(arc.to) ?? Infinity)) {
        g.set(arc.to, tentative)
        came.set(arc.to, { prev: cur, arc })
        open.add(arc.to)
      }
    }
  }

  if (!came.has('__goal')) return null

  const ids: string[] = ['__goal']
  const arcs: Arc[] = []
  let node = '__goal'
  while (node !== '__start') {
    const c = came.get(node)!
    arcs.unshift(c.arc)
    ids.unshift(c.prev)
    node = c.prev
  }
  return { ids, arcs, pos }
}

/** Turns a search result into the drawn route with turn instructions. */
function buildRoute(start: Point, destination: Destination, goal: Point, s: Searched): Route {
  const { ids, arcs, pos } = s

  // Full polyline. names[i] = road that produced point i; isNode[i] = point i is a junction or end.
  const points: Point[] = [start]
  const names: string[] = [arcs[0]?.edgeName ?? '']
  const isNode: boolean[] = [false]
  arcs.forEach((arc, j) => {
    for (const p of arc.geom) {
      points.push(p)
      names.push(arc.edgeName)
      isNode.push(false)
    }
    points.push(pos.get(ids[j + 1])!)
    names.push(arc.edgeName)
    isNode.push(true)
  })

  // Final leg from the access point to the destination itself.
  const end: Point = { x: destination.x, y: destination.y }
  if (goal.x !== end.x || goal.y !== end.y) {
    points.push(end)
    names.push(names[names.length - 1])
    isNode.push(false)
  }

  // Turn instructions are only given at junctions, so curves do not produce a step per bend.
  const steps: RouteStep[] = []
  for (let i = 1; i < points.length - 1; i++) {
    if (!isNode[i]) continue
    const delta = shortestDelta(pixelBearing(points[i - 1], points[i]), pixelBearing(points[i], points[i + 1]))
    if (Math.abs(delta) < 25) continue
    const side = delta < 0 ? 'left' : 'right'
    const verb = Math.abs(delta) >= 60 ? 'Turn' : 'Bear'
    const onto = names[i + 1] ? ` onto ${names[i + 1]}` : ''
    steps.push({ instruction: `${verb} ${side}${onto}`, point: points[i], pathIndex: i })
  }
  steps.push({ instruction: `Arrive at ${destination.name}`, point: end, pathIndex: points.length - 1 })

  return { points, steps, lengthPx: pathLen(points, 0, points.length - 1), destination }
}

/**
 * Plans a route from a position to a destination through the road network.
 *
 * The position and the destination (or its access point) each connect to a reachable road by a straight
 * connector that must not cross or start inside an obstacle. Several nearby road segments are tried at
 * each end and the shortest complete route, connectors included, is returned.
 */
/** Wording for how far a connector may reach: a pixel limit, or no limit. */
function reach(maxConnectorPx: number): string {
  return Number.isFinite(maxConnectorPx) ? `within ${maxConnectorPx} px` : 'at any distance'
}

/** Points just outside the blocked areas that contain `start`, nearest first. */
function exitPoints(start: Point, containing: Obstacle[], obstacles: Obstacle[]): Point[] {
  const found: { p: Point; d: number }[] = []
  for (const poly of containing) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const vx = b.x - a.x
      const vy = b.y - a.y
      const len2 = vx * vx + vy * vy
      if (len2 === 0) continue
      const t = Math.max(0, Math.min(1, ((start.x - a.x) * vx + (start.y - a.y) * vy) / len2))
      const q = { x: a.x + t * vx, y: a.y + t * vy }
      const len = Math.sqrt(len2)
      const nx = -vy / len
      const ny = vx / len
      for (const sign of [1, -1]) {
        const e = { x: q.x + sign * nx * 3, y: q.y + sign * ny * 3 }
        if (!obstacles.some((o) => o.length >= 3 && insidePolygon(e, o))) found.push({ p: e, d: dist(start, q) })
      }
    }
  }
  found.sort((x, y) => x.d - y.d)
  return found.slice(0, 24).map((f) => f.p)
}

/** A road is usable only if none of its straight pieces touch a blocked area. */
function usableNetwork(net: RoadNetwork, obstacles: Obstacle[]): RoadNetwork {
  if (obstacles.length === 0) return net
  const byId = new Map<string, Point>(net.nodes.map((n) => [n.id, n]))
  const edges = net.edges.filter((e) => {
    const g = roadGeometry(e, byId)
    if (!g) return false
    for (let k = 0; k + 1 < g.length; k++) {
      if (!connectorClear(g[k], g[k + 1], obstacles)) return false
    }
    return true
  })
  return { nodes: net.nodes, edges }
}

export function planRoute(
  start: Point,
  destination: Destination,
  fullNet: RoadNetwork,
  mode: TravelMode = 'drive',
  obstacles: Obstacle[] = [],
  maxConnectorPx = MAX_CONNECTOR_PX,
): PlanResult {
  const goal: Point = destination.access ?? { x: destination.x, y: destination.y }
  const empty: RouteDiagnostics = { startCandidates: 0, goalCandidates: 0, pairsTried: 0, startSnap: null, goalSnap: null }

  // Routes never pass through a blocked area: roads that touch one are left out.
  const net = usableNetwork(fullNet, obstacles)

  // Standing inside a blocked area: leave it by the cheapest clear exit, then route on from there.
  const containing = obstacles.filter((o) => o.length >= 3 && insidePolygon(start, o))
  if (containing.length > 0 && Number.isFinite(start.x) && Number.isFinite(start.y)) {
    const others = obstacles.filter((o) => !containing.includes(o))
    let best: { total: number; result: Route; diagnostics: RouteDiagnostics } | null = null
    let lastError: PlanResult | null = null
    for (const exit of exitPoints(start, containing, obstacles)) {
      // The leg out may cross the blocked area it leaves, but no other one.
      if (!connectorClear(start, exit, others)) continue
      const r = planRoute(exit, destination, net, mode, obstacles, maxConnectorPx)
      if (!('route' in r)) {
        lastError = r
        continue
      }
      const total = dist(start, exit) + r.route.lengthPx
      if (!best || total < best.total) best = { total, result: r.route, diagnostics: r.diagnostics }
    }
    if (!best) {
      return (
        lastError ?? {
          error: 'You are inside a blocked area and no clear way out was found.',
          stage: 'no-start-connector',
          diagnostics: empty,
        }
      )
    }
    return {
      route: { ...best.result, points: [start, ...best.result.points], lengthPx: best.total },
      diagnostics: best.diagnostics,
    }
  }

  // NaN coordinates never compare as less-than, so the search would never finish. Reject them first.
  if (![start.x, start.y, goal.x, goal.y].every(Number.isFinite)) {
    return { error: 'The start or destination position is not a valid map coordinate.', stage: 'invalid-input', diagnostics: empty }
  }
  if (!fullNet.edges.some((e) => e.modes.includes(mode))) {
    return { error: 'No road network is available for this route.', stage: 'no-network', diagnostics: empty }
  }

  const nodes = new Map<string, Point>(net.nodes.map((n) => [n.id, n]))
  const startCands = snapCandidates(start, net, mode, obstacles, maxConnectorPx)
  const goalCands = snapCandidates(goal, net, mode, obstacles, maxConnectorPx)
  const summary = (s: Snap | undefined): SnapSummary | null => (s ? { edgeId: s.edge.id, connectorPx: s.distance } : null)

  if (!startCands.length) {
    return {
      error: `No clear way from your position to a road ${reach(maxConnectorPx)}. The straight path would cross a blocked area, or you are inside a blocked area.`,
      stage: 'no-start-connector',
      diagnostics: { ...empty, goalCandidates: goalCands.length },
    }
  }
  if (!goalCands.length) {
    return {
      error: `No clear way from the destination to a road ${reach(maxConnectorPx)}. Set an access point for it on a walkable spot.`,
      stage: 'no-destination-connector',
      diagnostics: { ...empty, startCandidates: startCands.length },
    }
  }

  let best: { route: Route; ss: Snap; gs: Snap } | null = null
  let pairs = 0
  for (const ss of startCands) {
    for (const gs of goalCands) {
      pairs++
      const found = searchGraph(start, goal, ss, gs, nodes, net, mode)
      if (!found) continue
      const route = buildRoute(start, destination, goal, found)
      if (!best || route.lengthPx < best.route.lengthPx) best = { route, ss, gs }
    }
  }

  const base: RouteDiagnostics = {
    startCandidates: startCands.length,
    goalCandidates: goalCands.length,
    pairsTried: pairs,
    startSnap: summary(startCands[0]),
    goalSnap: summary(goalCands[0]),
  }
  if (!best) {
    return {
      error: 'No connected road route: the start and the destination are on roads that do not join up.',
      stage: 'disconnected',
      diagnostics: base,
    }
  }
  return { route: best.route, diagnostics: { ...base, startSnap: summary(best.ss), goalSnap: summary(best.gs) } }
}

export function pathLen(points: Point[], from: number, to: number): number {
  let s = 0
  for (let k = from; k < to; k++) s += dist(points[k], points[k + 1])
  return s
}

export interface Progress {
  /** Distance (pixels) from the position to the nearest route point. */
  offRoutePx: number
  remainingPx: number
  nextStep: RouteStep | null
  distanceToNextPx: number
}

export function progress(route: Route, pos: Point): Progress {
  const pts = route.points
  let best = Infinity
  let bestI = 0
  let bestProj = pts[0]
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby || 1
    const t = Math.max(0, Math.min(1, ((pos.x - a.x) * abx + (pos.y - a.y) * aby) / len2))
    const q = { x: a.x + abx * t, y: a.y + aby * t }
    const d = dist(pos, q)
    if (d < best) {
      best = d
      bestI = i
      bestProj = q
    }
  }
  const last = pts.length - 1
  const toNext = bestI + 1 <= last ? dist(bestProj, pts[bestI + 1]) : 0
  const remainingPx = best + toNext + pathLen(pts, Math.min(bestI + 1, last), last)
  const nextStep = route.steps.find((s) => s.pathIndex > bestI) ?? null
  const distanceToNextPx = nextStep ? best + toNext + pathLen(pts, Math.min(bestI + 1, nextStep.pathIndex), nextStep.pathIndex) : remainingPx
  return { offRoutePx: best, remainingPx, nextStep, distanceToNextPx }
}
