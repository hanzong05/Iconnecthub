import { describe, expect, it } from 'vitest'
import { calibrationReport, fitCalibration, project } from './calibration'
import { planRoute, progress, snapToNetwork } from './routing'
import type { CalibrationFile, ControlPoint, Destination, RoadNetwork } from './types'

// Synthetic ground truth: a 300 m x 400 m area mapped to a 1080 x 1920 image with a slight skew.
const ORIGIN = { lat: 33.8, lon: -84.15 }
const M_LAT = 110574
const M_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180)
const toGeo = (eastM: number, northM: number) => ({ lat: ORIGIN.lat + northM / M_LAT, lon: ORIGIN.lon + eastM / M_LON })
const truePx = (eastM: number, northM: number) => ({
  x: 540 + eastM * 1.8 + northM * 0.1,
  y: 960 - northM * 1.5 + eastM * 0.05,
})

function cp(id: string, east: number, north: number): ControlPoint {
  const g = toGeo(east, north)
  const p = truePx(east, north)
  return { id, x: p.x, y: p.y, lat: g.lat, lon: g.lon }
}

describe('calibration', () => {
  const controls = [cp('a', -100, -100), cp('b', 100, -100), cp('c', 100, 150), cp('d', -100, 150), cp('e', 0, 20)]
  const checks = [cp('k1', 40, -40), cp('k2', -60, 90)]

  it('recovers the transform from control points', () => {
    const fit = fitCalibration(controls)
    expect('model' in fit).toBe(true)
    if (!('model' in fit)) return
    const q = project(fit.model, toGeo(33, 77).lat, toGeo(33, 77).lon)
    const t = truePx(33, 77)
    expect(Math.hypot(q.x - t.x, q.y - t.y)).toBeLessThan(0.5)
  })

  it('reports verified only when independent checkpoints agree', () => {
    const calib: CalibrationFile = { version: 1, notes: '', controlPoints: controls, checkpoints: checks }
    const r = calibrationReport(calib)
    expect(r.status).toBe('verified')
    expect(r.maxCheckpointM).toBeLessThan(0.5)
  })

  it('flags a bad checkpoint as failed', () => {
    const bad = { ...checks[0], lat: checks[0].lat + 0.0005 } // ~55 m off
    const r = calibrationReport({ version: 1, notes: '', controlPoints: controls, checkpoints: [bad, checks[1]] })
    expect(r.status).toBe('failed')
  })

  it('stays uncalibrated with no data and rejects collinear points', () => {
    expect(calibrationReport({ version: 1, notes: '', controlPoints: [], checkpoints: [] }).status).toBe('uncalibrated')
    const line = [cp('l1', 0, 0), cp('l2', 50, 50), cp('l3', 100, 100)]
    expect('error' in fitCalibration(line)).toBe(true)
  })
})

describe('routing', () => {
  const net: RoadNetwork = {
    nodes: [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 100, y: 500 },
      { id: 'c', x: 400, y: 500 },
      { id: 'd', x: 400, y: 100 },
    ],
    edges: [
      { id: 'e1', from: 'a', to: 'b', name: 'West', modes: ['drive'], placement: 'estimated' },
      { id: 'e2', from: 'b', to: 'c', name: 'South', modes: ['drive'], placement: 'estimated' },
      { id: 'e3', from: 'c', to: 'd', name: 'East', modes: ['drive'], placement: 'estimated' },
    ],
  }
  const dest: Destination = { id: 'site-x', name: 'Site X', category: 'campsite', x: 380, y: 130, placement: 'estimated' }

  it('follows the road network instead of cutting across', () => {
    const r = planRoute({ x: 110, y: 110 }, dest, net)
    expect('route' in r).toBe(true)
    if (!('route' in r)) return
    const names = r.route.steps.map((s) => s.instruction)
    expect(names.some((n) => n.includes('South'))).toBe(true)
    // Every path point lies on the road network (no straight diagonal across the block).
    const interior = r.route.points.slice(1, -1)
    const onRoad = interior.every((p) => {
      const s = snapToNetwork(p, net, 'drive')
      return s !== null && s.distance < 1
    })
    expect(onRoad).toBe(true)
  })

  it('reports remaining distance and off-route distance', () => {
    const r = planRoute({ x: 110, y: 110 }, dest, net)
    if (!('route' in r)) throw new Error('no route')
    const onPath = progress(r.route, { x: 100, y: 300 })
    expect(onPath.offRoutePx).toBeLessThan(0.5)
    expect(onPath.remainingPx).toBeGreaterThan(0)
    const off = progress(r.route, { x: 250, y: 300 })
    expect(off.offRoutePx).toBeGreaterThan(100)
  })
})

describe('unproject', () => {
  it('is the inverse of project', async () => {
    const { unproject } = await import('./calibration')
    const controls = [cp('a', -100, -100), cp('b', 100, -100), cp('c', 100, 150), cp('d', -100, 150)]
    const fit = fitCalibration(controls)
    if (!('model' in fit)) throw new Error('fit failed')
    const ll = unproject(fit.model, truePx(20, 60))
    const back = project(fit.model, ll.lat, ll.lng)
    const t = truePx(20, 60)
    expect(Math.hypot(back.x - t.x, back.y - t.y)).toBeLessThan(0.01)
  })
})
