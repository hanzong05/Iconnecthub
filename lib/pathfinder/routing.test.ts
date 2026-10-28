import { describe, expect, it } from 'vitest'
import { connectorClear, planRoute, snapCandidates } from './routing'
import type { Destination, RoadNetwork } from './types'

const dest = (x: number, y: number, extra: Partial<Destination> = {}): Destination => ({
  id: 'd',
  name: 'Site',
  category: 'campsite',
  x,
  y,
  placement: 'estimated',
  ...extra,
})

const box = (x1: number, y1: number, x2: number, y2: number) => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
]

// Main road along y=0 from x=0 to x=200.
const mainOnly = (): RoadNetwork => ({
  nodes: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 200, y: 0 },
  ],
  edges: [{ id: 'main', from: 'a', to: 'b', name: 'Main', modes: ['drive', 'walk'], placement: 'estimated' }],
})

// Main road plus a parallel side road at y=30 that joins it at x=0 and x=200.
const twoRoads = (): RoadNetwork => ({
  nodes: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 200, y: 0 },
    { id: 'c', x: 0, y: 30 },
    { id: 'e', x: 200, y: 30 },
  ],
  edges: [
    { id: 'main', from: 'a', to: 'b', name: 'Main', modes: ['drive', 'walk'], placement: 'estimated' },
    { id: 'side', from: 'c', to: 'e', name: 'Side', modes: ['drive', 'walk'], placement: 'estimated' },
    { id: 'l', from: 'a', to: 'c', name: 'Link', modes: ['drive', 'walk'], placement: 'estimated' },
    { id: 'r', from: 'b', to: 'e', name: 'Link2', modes: ['drive', 'walk'], placement: 'estimated' },
  ],
})

describe('connectors', () => {
  it('allows a straight connector that stays clear of obstacles', () => {
    expect(connectorClear({ x: 50, y: 8 }, { x: 50, y: 0 }, [box(100, 100, 120, 120)])).toBe(true)
  })

  it('rejects a connector that crosses an obstacle', () => {
    expect(connectorClear({ x: 50, y: 8 }, { x: 50, y: 0 }, [box(40, 3, 60, 6)])).toBe(false)
  })

  it('rejects a connector that starts inside an obstacle', () => {
    expect(connectorClear({ x: 50, y: 8 }, { x: 50, y: 0 }, [box(40, 5, 60, 20)])).toBe(false)
  })
})

describe('start on a road', () => {
  it('routes from a position standing on the road with no connector', () => {
    const r = planRoute({ x: 50, y: 0 }, dest(150, 0), mainOnly())
    if (!('route' in r)) throw new Error(r.error)
    expect(r.route.points[0]).toEqual({ x: 50, y: 0 })
    expect(r.route.lengthPx).toBeCloseTo(100, 1)
    expect(r.diagnostics.startSnap?.connectorPx).toBe(0)
  })
})

describe('start off the road', () => {
  it('connects a position beside the road to the road and then follows it', () => {
    const r = planRoute({ x: 50, y: 8 }, dest(150, 0), mainOnly())
    if (!('route' in r)) throw new Error(r.error)
    expect(r.route.points[0]).toEqual({ x: 50, y: 8 })
    expect(r.route.points.some((p) => Math.hypot(p.x - 50, p.y) < 0.5)).toBe(true)
    expect(r.route.lengthPx).toBeCloseTo(8 + 100, 1)
    expect(r.diagnostics.startSnap?.connectorPx).toBeCloseTo(8, 1)
  })
})

describe('start near an obstacle', () => {
  it('refuses a connector that a fence blocks when no other road is reachable', () => {
    const fence = box(40, 3, 60, 6)
    const r = planRoute({ x: 50, y: 8 }, dest(150, 0), mainOnly(), 'drive', [fence])
    expect('stage' in r && r.stage).toBe('no-start-connector')
  })

  it('chooses a reachable road when the nearest one is behind a fence', () => {
    // Main is 8 px away but the fence blocks the way to it; Side is 22 px away with a clear connector.
    const fence = box(40, 3, 60, 6)
    const r = planRoute({ x: 50, y: 8 }, dest(150, 30), twoRoads(), 'drive', [fence])
    if (!('route' in r)) throw new Error(r.error)
    expect(r.route.points.some((p) => Math.hypot(p.x - 50, p.y - 30) < 0.5)).toBe(true)
    expect(r.route.points.some((p) => Math.hypot(p.x - 50, p.y) < 0.5)).toBe(false)
    expect(r.diagnostics.startSnap?.edgeId).toBe('side')
    // Side and the west link are clear; Main is blocked by the fence and the east link is beyond the connector limit.
    expect(r.diagnostics.startCandidates).toBe(2)
  })
})

describe('destination on another road segment', () => {
  it('connects an off-road destination to its nearest clear road', () => {
    const r = planRoute({ x: 10, y: 0 }, dest(100, 12), mainOnly())
    if (!('route' in r)) throw new Error(r.error)
    expect(r.route.points[r.route.points.length - 1]).toEqual({ x: 100, y: 12 })
    expect(r.diagnostics.goalSnap?.connectorPx).toBeCloseTo(12, 1)
  })

  it('routes through a destination access point and then to the pin', () => {
    const r = planRoute({ x: 10, y: 0 }, dest(100, 60, { access: { x: 100, y: 0 } }), mainOnly())
    if (!('route' in r)) throw new Error(r.error)
    expect(r.route.points.some((p) => Math.hypot(p.x - 100, p.y) < 0.5)).toBe(true)
    expect(r.route.points[r.route.points.length - 1]).toEqual({ x: 100, y: 60 })
  })

  it('reports no route when the pin is walled off, because the road into it crosses the wall', () => {
    const walls = box(80, -40, 120, 40)
    const r = planRoute({ x: 10, y: 0 }, dest(100, 0), mainOnly(), 'drive', [walls])
    // Roads that cross a blocked area are not used, so the start cannot reach any road.
    expect('stage' in r && r.stage).toBe('no-start-connector')
  })

  it('leaves a blocked area by the nearest clear exit when standing inside one', () => {
    // You stand inside a blocked area just off the main road (y = 0).
    const walls = box(40, 5, 60, 35)
    const r = planRoute({ x: 50, y: 20 }, dest(150, 0), mainOnly(), 'drive', [walls])
    expect('route' in r).toBe(true)
    if ('route' in r) {
      // The first point is where you stand; the next point is outside the blocked area.
      expect(r.route.points[0]).toEqual({ x: 50, y: 20 })
      const exit = r.route.points[1]
      expect(exit.x < 40 || exit.x > 60 || exit.y < 5 || exit.y > 35).toBe(true)
    }
  })
})

describe('candidate selection', () => {
  it('returns nearest clear segments first, within the connector limit', () => {
    const cands = snapCandidates({ x: 50, y: 8 }, twoRoads(), 'drive')
    // Within the connector limit only three edges are reachable: the east link at 150 px is excluded.
    expect(cands.map((c) => c.edge.id)).toEqual(['main', 'side', 'l'])
  })
})
