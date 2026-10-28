import type { Point, RoadEdge, RoadNetwork } from './types'
import { dist } from './geo'
import { roadGeometry } from './routing'

/** A new road endpoint within this many pixels of an existing node joins that node. */
export const JOIN_RADIUS_PX = 12

/** Node ids created by the editor start with 'j'; seed nodes never do, so they are never removed. */
const DRAWN_NODE = 'j'

interface Cut {
  /** Geometry segment the crossing lies on. */
  k: number
  t: number
  q: Point
  id: string
}

/** Proper crossing of segments p1-p2 and p3-p4. Touching at an endpoint is not a crossing. */
function crossing(p1: Point, p2: Point, p3: Point, p4: Point): { q: Point; t: number; u: number } | null {
  const rx = p2.x - p1.x
  const ry = p2.y - p1.y
  const sx = p4.x - p3.x
  const sy = p4.y - p3.y
  const d = rx * sy - ry * sx
  if (Math.abs(d) < 1e-9) return null
  const t = ((p3.x - p1.x) * sy - (p3.y - p1.y) * sx) / d
  const u = ((p3.x - p1.x) * ry - (p3.y - p1.y) * rx) / d
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null
  return { q: { x: p1.x + t * rx, y: p1.y + t * ry }, t, u }
}

/**
 * Splits a polyline at its cut points. Each piece runs between two consecutive boundaries
 * (start node, cut points, end node) and keeps the geometry points between them.
 */
function splitPolyline(geom: Point[], startId: string, endId: string, cuts: Cut[]) {
  const sorted = [...cuts].sort((a, b) => a.k - b.k || a.t - b.t)
  const bounds = [{ id: startId, k: 0 }, ...sorted.map((c) => ({ id: c.id, k: c.k })), { id: endId, k: geom.length - 2 }]
  const pieces: { from: string; to: string; points: Point[] }[] = []
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i]
    const b = bounds[i + 1]
    pieces.push({ from: a.id, to: b.id, points: geom.slice(a.k + 1, b.k + 1) })
  }
  return pieces
}

/**
 * Adds a drawn road. Endpoints join nearby nodes. Where the new road crosses an existing road,
 * `confirmCrossing` decides whether they meet there (a junction, both roads are split) or one
 * passes over the other (no junction).
 */
export function addRoad(
  net: RoadNetwork,
  pts: Point[],
  name: string,
  confirmCrossing: (existing: RoadEdge, at: Point) => boolean,
  now = Date.now(),
): RoadNetwork {
  if (pts.length < 2) return net
  const oldNodes = new Map<string, Point>(net.nodes.map((n) => [n.id, n]))
  const nodes = [...net.nodes]
  let seq = 0
  const newId = (prefix: string) => `${prefix}${now.toString(36)}${(seq++).toString(36)}`

  const roadCuts: Cut[] = []
  const edgeCuts = new Map<string, Cut[]>()

  /** Closest point on an existing road within the join radius, away from its ends (those are nodes). */
  const nearestOnRoad = (p: Point) => {
    let best: { edge: RoadEdge; k: number; t: number; q: Point; d: number } | null = null
    for (const e of net.edges) {
      const g = roadGeometry(e, oldNodes)
      if (!g) continue
      for (let k = 0; k + 1 < g.length; k++) {
        const a = g[k]
        const b = g[k + 1]
        const vx = b.x - a.x
        const vy = b.y - a.y
        const len2 = vx * vx + vy * vy
        if (len2 === 0) continue
        const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2
        if (t <= 0.02 || t >= 0.98) continue
        const q = { x: a.x + t * vx, y: a.y + t * vy }
        const d = dist(p, q)
        if (d <= JOIN_RADIUS_PX && (!best || d < best.d)) best = { edge: e, k, t, q, d }
      }
    }
    return best
  }

  const nodeAt = (p: Point): string => {
    const hit = nodes.find((n) => dist(n, p) <= JOIN_RADIUS_PX)
    if (hit) return hit.id
    const id = newId(DRAWN_NODE)
    const onRoad = nearestOnRoad(p)
    if (onRoad) {
      // The end lands on another road: that road is split here, so the two meet at a junction.
      nodes.push({ id, x: onRoad.q.x, y: onRoad.q.y })
      edgeCuts.set(onRoad.edge.id, [...(edgeCuts.get(onRoad.edge.id) ?? []), { k: onRoad.k, t: onRoad.t, q: onRoad.q, id }])
      return id
    }
    nodes.push({ id, x: p.x, y: p.y })
    return id
  }
  const startId = nodeAt(pts[0])
  const endId = nodeAt(pts[pts.length - 1])
  for (let i = 0; i + 1 < pts.length; i++) {
    for (const e of net.edges) {
      const g = roadGeometry(e, oldNodes)
      if (!g) continue
      for (let k = 0; k + 1 < g.length; k++) {
        const hit = crossing(pts[i], pts[i + 1], g[k], g[k + 1])
        if (!hit || !confirmCrossing(e, hit.q)) continue
        const id = newId(DRAWN_NODE)
        nodes.push({ id, x: hit.q.x, y: hit.q.y })
        roadCuts.push({ k: i, t: hit.t, q: hit.q, id })
        edgeCuts.set(e.id, [...(edgeCuts.get(e.id) ?? []), { k, t: hit.u, q: hit.q, id }])
      }
    }
  }

  const edges: RoadEdge[] = []
  for (const e of net.edges) {
    const cuts = edgeCuts.get(e.id)
    const g = roadGeometry(e, oldNodes)
    if (!cuts || !g) {
      edges.push(e)
      continue
    }
    splitPolyline(g, e.from, e.to, cuts).forEach((piece, j) =>
      edges.push({
        ...e,
        id: `${e.id}.${j}`,
        from: piece.from,
        to: piece.to,
        points: piece.points.length ? piece.points : undefined,
      }),
    )
  }

  const roadId = newId('r')
  splitPolyline(pts, startId, endId, roadCuts).forEach((piece, j) =>
    edges.push({
      id: `${roadId}.${j}`,
      from: piece.from,
      to: piece.to,
      name,
      modes: ['drive', 'walk'],
      placement: 'estimated',
      points: piece.points.length ? piece.points : undefined,
    }),
  )
  return { nodes, edges }
}

/** Removes every piece of a named road, then drops drawn nodes that no longer connect to anything. */
export function removeRoad(net: RoadNetwork, roadName: string): RoadNetwork {
  const edges = net.edges.filter((e) => e.name !== roadName)
  const used = new Set(edges.flatMap((e) => [e.from, e.to]))
  const nodes = net.nodes.filter((n) => used.has(n.id) || !n.id.startsWith(DRAWN_NODE))
  return { nodes, edges }
}

/** Closest distance from p to segment a-b. */
function distToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len2 = vx * vx + vy * vy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2))
  return dist(p, { x: a.x + t * vx, y: a.y + t * vy })
}

/** Name of the road whose centreline is nearest p, if within `tol` pixels. */
export function nearestRoadName(net: RoadNetwork, p: Point, tol: number): string | null {
  const byId = new Map<string, Point>(net.nodes.map((n) => [n.id, n]))
  let best: { name: string; d: number } | null = null
  for (const e of net.edges) {
    const g = roadGeometry(e, byId)
    if (!g) continue
    for (let k = 0; k + 1 < g.length; k++) {
      const d = distToSegment(p, g[k], g[k + 1])
      if (d <= tol && (!best || d < best.d)) best = { name: e.name, d }
    }
  }
  return best?.name ?? null
}

/**
 * Removes one point of a named road. A curve point is dropped, and the road bends straight
 * between its neighbours. A free end is trimmed back to the next point. An end that joins another
 * road cannot be removed without breaking that junction, so the result is null.
 */
export function removeRoadPoint(net: RoadNetwork, roadName: string, at: Point): RoadNetwork | null {
  const same = (p: Point) => dist(p, at) < 0.5

  // A curve point of one of the road's pieces.
  for (const e of net.edges) {
    if (e.name !== roadName || !e.points) continue
    if (!e.points.some(same)) continue
    const points = e.points.filter((p) => !same(p))
    const edges = net.edges.map((x) => (x === e ? { ...e, points: points.length ? points : undefined } : x))
    return { nodes: net.nodes, edges }
  }

  // An end of one of the road's pieces.
  const node = net.nodes.find((n) => same(n) && net.edges.some((e) => e.name === roadName && (e.from === n.id || e.to === n.id)))
  if (!node) return net
  const touching = net.edges.filter((e) => e.from === node.id || e.to === node.id)
  if (touching.length === 2) return joinPieces(net, roadName, node.id, touching[0], touching[1])
  if (touching.length !== 1) return null
  const e = touching[0]
  const pts = e.points ?? []
  const nodes = [...net.nodes]
  if (pts.length === 0) {
    // Only two ends: removing one removes the whole piece.
    const edges = net.edges.filter((x) => x !== e)
    return prune({ nodes, edges })
  }
  const isFrom = e.from === node.id
  const newNode = { id: `${DRAWN_NODE}${Date.now().toString(36)}t${nodes.length.toString(36)}`, ...(isFrom ? pts[0] : pts[pts.length - 1]) }
  nodes.push(newNode)
  const rest = isFrom ? pts.slice(1) : pts.slice(0, -1)
  const updated: RoadEdge = isFrom
    ? { ...e, from: newNode.id, points: rest.length ? rest : undefined }
    : { ...e, to: newNode.id, points: rest.length ? rest : undefined }
  return prune({ nodes, edges: net.edges.map((x) => (x === e ? updated : x)) })
}

/**
 * Removes a point where two pieces of the same road meet, joining them into one piece. Pieces of
 * different roads, or one-way pieces whose directions do not line up, cannot be joined: null.
 */
function joinPieces(net: RoadNetwork, roadName: string, nodeId: string, a: RoadEdge, b: RoadEdge): RoadNetwork | null {
  if (a.name !== roadName || b.name !== roadName || !!a.oneWay !== !!b.oneWay) return null
  const byId = new Map<string, Point>(net.nodes.map((n) => [n.id, n]))
  const node = byId.get(nodeId)
  if (!node) return null
  let first = a
  let second = b
  if (a.oneWay) {
    if (a.to === nodeId && b.from === nodeId) {
      // a flows into the point and b flows out: already in order.
    } else if (b.to === nodeId && a.from === nodeId) {
      first = b
      second = a
    } else {
      return null
    }
  }
  const g1 = roadGeometry(first, byId)
  const g2 = roadGeometry(second, byId)
  if (!g1 || !g2) return null
  const p1 = first.to === nodeId ? g1 : [...g1].reverse()
  const p2 = second.from === nodeId ? g2 : [...g2].reverse()
  const path = [...p1, ...p2.slice(1)]
  const startId = first.from === nodeId ? first.to : first.from
  const endId = second.from === nodeId ? second.to : second.from
  const inner = path.slice(1, -1).filter((p) => dist(p, node) > 0.5)
  const merged: RoadEdge = { ...first, from: startId, to: endId, points: inner.length ? inner : undefined }
  const edges = net.edges.filter((e) => e !== a && e !== b)
  edges.push(merged)
  return prune({ nodes: net.nodes, edges })
}

/** Drops drawn nodes that no piece uses any more. */
function prune(net: RoadNetwork): RoadNetwork {
  const used = new Set(net.edges.flatMap((e) => [e.from, e.to]))
  return { nodes: net.nodes.filter((n) => used.has(n.id) || !n.id.startsWith(DRAWN_NODE)), edges: net.edges }
}

/** Taps within this many image pixels of a road or one of its points count as hitting it. */
export const ROAD_TAP_PX = 20

/** Same spot on the map (within half a pixel). */
function sameSpot(p: Point, q: Point): boolean {
  return Math.hypot(p.x - q.x, p.y - q.y) < 0.5
}

/**
 * Makes a node at `at` on the named road. A curve point is split into two pieces at that spot;
 * a spot that is already a node is used as it is. Null if the road does not pass through `at`.
 */
function nodeOnRoad(net: RoadNetwork, roadName: string, at: Point, tag: string): { net: RoadNetwork; nodeId: string } | null {
  const existing = net.nodes.find(
    (n) => sameSpot(n, at) && net.edges.some((e) => e.name === roadName && (e.from === n.id || e.to === n.id)),
  )
  if (existing) return { net, nodeId: existing.id }
  for (const e of net.edges) {
    if (e.name !== roadName || !e.points) continue
    const i = e.points.findIndex((p) => sameSpot(p, at))
    if (i < 0) continue
    const id = `${DRAWN_NODE}${tag}${net.nodes.length.toString(36)}`
    const before = e.points.slice(0, i)
    const after = e.points.slice(i + 1)
    const first: RoadEdge = { ...e, id: `${e.id}a${tag}`, to: id, points: before.length ? before : undefined }
    const second: RoadEdge = { ...e, id: `${e.id}b${tag}`, from: id, points: after.length ? after : undefined }
    const edges = net.edges.flatMap((x) => (x === e ? [first, second] : [x]))
    return { net: { nodes: [...net.nodes, { id, x: at.x, y: at.y }], edges }, nodeId: id }
  }
  return null
}

/** Edges that lead from one node to another along the given edges (breadth-first), or null. */
function pathEdges(edges: RoadEdge[], from: string, to: string): RoadEdge[] | null {
  const prev = new Map<string, { node: string; edge: RoadEdge }>()
  const seen = new Set<string>([from])
  const queue = [from]
  while (queue.length > 0 && !seen.has(to)) {
    const cur = queue.shift() as string
    for (const e of edges) {
      const other = e.from === cur ? e.to : e.to === cur ? e.from : null
      if (other === null || seen.has(other)) continue
      seen.add(other)
      prev.set(other, { node: cur, edge: e })
      queue.push(other)
    }
  }
  if (!seen.has(to)) return null
  const path: RoadEdge[] = []
  let c = to
  while (c !== from) {
    const step = prev.get(c)
    if (!step) return null
    path.push(step.edge)
    c = step.node
  }
  return path
}

/**
 * Deletes the stretch of a named road between two of its points (the line between them).
 * Null if the two points are not both on that road or are not connected along it.
 */
export function removeStretch(net: RoadNetwork, roadName: string, a: Point, b: Point): RoadNetwork | null {
  const first = nodeOnRoad(net, roadName, a, 'x')
  if (!first) return null
  const second = nodeOnRoad(first.net, roadName, b, 'y')
  if (!second || second.nodeId === first.nodeId) return null
  const roadEdges = second.net.edges.filter((e) => e.name === roadName)
  const path = pathEdges(roadEdges, first.nodeId, second.nodeId)
  if (!path) return null
  const drop = new Set(path)
  return prune({ nodes: second.net.nodes, edges: second.net.edges.filter((e) => !drop.has(e)) })
}
