import { describe, expect, it } from 'vitest'
import { addRoad, removeRoad } from './roadEditing'
import { planRoute } from './routing'
import type { Destination, RoadNetwork } from './types'

const mainRoad = (): RoadNetwork => ({
  nodes: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 100, y: 0 },
  ],
  edges: [{ id: 'ab', from: 'a', to: 'b', name: 'Main', modes: ['drive', 'walk'], placement: 'estimated' }],
})

const dest = (x: number, y: number): Destination => ({ id: 'd', name: 'Site', category: 'campsite', x, y, placement: 'estimated' })

describe('road editing', () => {
  it('splits both roads where they meet at a confirmed junction', () => {
    const net = addRoad(mainRoad(), [{ x: 50, y: -50 }, { x: 50, y: 50 }], 'Cross', () => true, 1)
    expect(net.edges.length).toBe(4)
    // Route from the north end of the cross road to the far end of the main road goes through the junction.
    const r = planRoute({ x: 50, y: -50 }, dest(100, 0), net)
    expect('route' in r).toBe(true)
    if (!('route' in r)) return
    expect(r.route.points.some((p) => Math.hypot(p.x - 50, p.y) < 1)).toBe(true)
  })

  it('keeps roads separate when the admin says they only pass over each other', () => {
    const net = addRoad(mainRoad(), [{ x: 50, y: -50 }, { x: 50, y: 50 }], 'Bridge', () => false, 2)
    expect(net.edges.length).toBe(2)
    // No junction, and a fence sits between the bridge end and the main road, so no connector can bridge the gap.
    const fence = [{ x: 40, y: -10 }, { x: 60, y: -10 }, { x: 60, y: 10 }, { x: 40, y: 10 }]
    const r = planRoute({ x: 50, y: -50 }, dest(100, 0), net, 'drive', [fence])
    expect('route' in r && r.route.points.some((p) => Math.hypot(p.x - 50, p.y) < 1)).toBe(false)
  })

  it('joins a new road endpoint to an existing node within the join radius', () => {
    const net = addRoad(mainRoad(), [{ x: 3, y: 4 }, { x: 60, y: 60 }], 'Spur', () => true, 3)
    const spur = net.edges.find((e) => e.name === 'Spur')!
    expect(spur.from).toBe('a')
  })

  it('stores curve points and routes along them', () => {
    const net: RoadNetwork = {
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 0 },
      ],
      edges: [{ id: 'curve', from: 'a', to: 'b', name: 'Bend', modes: ['drive'], placement: 'estimated', points: [{ x: 50, y: 40 }] }],
    }
    const r = planRoute({ x: 0, y: 0 }, dest(100, 0), net)
    if (!('route' in r)) throw new Error('no route')
    expect(r.route.points.some((p) => Math.hypot(p.x - 50, p.y - 40) < 0.5)).toBe(true)
    expect(r.route.lengthPx).toBeGreaterThan(125)
  })

  it('removes all pieces of a named road and keeps seed nodes', () => {
    const net = addRoad(mainRoad(), [{ x: 50, y: -50 }, { x: 50, y: 50 }], 'Cross', () => true, 4)
    const cleaned = removeRoad(net, 'Cross')
    expect(cleaned.edges.map((e) => e.name)).toEqual(['Main', 'Main'])
    expect(cleaned.nodes.some((n) => n.id === 'a')).toBe(true)
    expect(cleaned.nodes.every((n) => !n.id.startsWith('j') || cleaned.edges.some((e) => e.from === n.id || e.to === n.id))).toBe(true)
  })
})

describe('route failure stages', () => {
  it('rejects NaN coordinates instead of looping forever', () => {
    const net = mainRoad()
    const r = planRoute({ x: NaN, y: NaN }, dest(100, 0), net)
    expect('stage' in r && r.stage).toBe('invalid-input')
  })

  it('reports a disconnected network as its own stage', () => {
    const net: RoadNetwork = {
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 0 },
        { id: 'c', x: 0, y: 200 },
        { id: 'd', x: 100, y: 200 },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', name: 'Top', modes: ['drive'], placement: 'estimated' },
        { id: 'cd', from: 'c', to: 'd', name: 'Bottom', modes: ['drive'], placement: 'estimated' },
      ],
    }
    // A blocked strip between the two roads stops every connector from joining them.
    const strip = [{ x: -10, y: 90 }, { x: 110, y: 90 }, { x: 110, y: 110 }, { x: -10, y: 110 }]
    const r = planRoute({ x: 10, y: 0 }, dest(10, 200), net, 'drive', [strip])
    expect('stage' in r && r.stage).toBe('disconnected')
  })
})
