import { describe, expect, it } from 'vitest'
import { LIMITS, ValidationError, parseCalibration, parseCampgroundInput, parseDetail, parseId, parseNetwork, recordFromStored, toStoredJson } from './validate'

const img = { url: 'https://img.example.com/a.webp', width: 800, height: 600 }
const ok = { name: ' Pine Ridge ', public: true, centerLat: 44.1, centerLon: -73.2, image: img }

describe('parseId', () => {
  it('accepts safe ids and refuses path tricks', () => {
    expect(parseId('abc_DEF-123')).toBe('abc_DEF-123')
    for (const v of ['', 'a/b', '../x', 'a.b', 'a b', 'x'.repeat(65), 5, null]) expect(() => parseId(v)).toThrow(ValidationError)
  })
})

describe('parseCampgroundInput', () => {
  it('trims and keeps known fields only', () => {
    const r = parseCampgroundInput({ ...ok, evil: 1 }, true)
    expect(r.name).toBe('Pine Ridge')
    expect(r).not.toHaveProperty('evil')
  })
  it('requires an image for new, not for edits', () => {
    const { image: _i, ...rest } = ok
    expect(() => parseCampgroundInput(rest, true)).toThrow(/image/i)
    expect(parseCampgroundInput(rest, false).image).toBeUndefined()
  })
  it('refuses bad values', () => {
    expect(() => parseCampgroundInput({ ...ok, name: '  ' }, true)).toThrow()
    expect(() => parseCampgroundInput({ ...ok, name: 'x'.repeat(101) }, true)).toThrow()
    expect(() => parseCampgroundInput({ ...ok, centerLat: 91 }, true)).toThrow()
    expect(() => parseCampgroundInput({ ...ok, centerLon: NaN }, true)).toThrow()
    expect(() => parseCampgroundInput({ ...ok, public: 'yes' }, true)).toThrow()
    expect(() => parseCampgroundInput({ ...ok, image: { ...img, url: 'http://x.com/a.png' } }, true)).toThrow(ValidationError)
    expect(() => parseCampgroundInput({ ...ok, image: { ...img, url: 'javascript:alert(1)' } }, true)).toThrow()
    expect(() => parseCampgroundInput({ ...ok, image: { ...img, width: 1.5 } }, true)).toThrow()
    expect(() => parseCampgroundInput({ ...ok, image: { ...img, height: 0 } }, true)).toThrow()
    expect(() => parseCampgroundInput(null, true)).toThrow()
  })
})

const c4 = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]
describe('parseDetail', () => {
  it('handles null, valid and out-of-range zoom', () => {
    expect(parseDetail(null)).toBeNull()
    const d = { imageUrl: img.url, width: 10, height: 10, corners: c4, zoomFactor: 2 }
    expect(parseDetail(d)?.zoomFactor).toBe(2)
    expect(() => parseDetail({ ...d, zoomFactor: 7 })).toThrow()
    expect(() => parseDetail({ ...d, corners: c4.slice(0, 3) })).toThrow()
  })
})

const pin = { id: 'p1', name: 'Site 1', category: 'campsite', placement: 'estimated', x: 10, y: 20 }
describe('parseNetwork', () => {
  it('accepts a valid network and drops unknown fields', () => {
    const n = parseNetwork({ pins: [{ ...pin, hax: 1, description: 'Near lake' }], walkways: [], obstacles: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]] })
    expect(n.pins[0]).not.toHaveProperty('hax')
    expect(n.pins[0].description).toBe('Near lake')
  })
  it('refuses bad categories, ids and duplicates', () => {
    expect(() => parseNetwork({ pins: [{ ...pin, category: 'x' }] })).toThrow()
    expect(() => parseNetwork({ pins: [{ ...pin, id: 'a/b' }] })).toThrow()
    expect(() => parseNetwork({ pins: [pin, pin] })).toThrow(/share/)
    expect(() => parseNetwork({ pins: [{ ...pin, x: Infinity }] })).toThrow()
  })
  it('enforces caps', () => {
    const many = Array.from({ length: LIMITS.pins + 1 }, (_, i) => ({ ...pin, id: `p${i}` }))
    expect(() => parseNetwork({ pins: many })).toThrow(/too many/)
  })
  it('checks road edges join real nodes', () => {
    const roads = { nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 1 }], edges: [{ id: 'e', from: 'a', to: 'b', name: 'Main', modes: ['drive'], placement: 'verified' }] }
    expect(parseNetwork({ pins: [], walkways: [], obstacles: [], roads }).roads?.edges).toHaveLength(1)
    const broken = { ...roads, edges: [{ ...roads.edges[0], to: 'zzz' }] }
    expect(() => parseNetwork({ pins: [], walkways: [], obstacles: [], roads: broken })).toThrow(/does not exist/)
    const badMode = { ...roads, edges: [{ ...roads.edges[0], modes: ['fly'] }] }
    expect(() => parseNetwork({ pins: [], walkways: [], obstacles: [], roads: badMode })).toThrow()
  })
})

describe('parseCalibration', () => {
  const cp = { id: 'img-tl', x: 0, y: 0, lat: 44, lon: -73 }
  it('accepts a calibration', () => {
    const c = parseCalibration({ version: 1, notes: 'n', controlPoints: [cp], checkpoints: [], georef: { lat: 44, lon: -73, widthM: 120 }, image: { width: 10, height: 10 }, extra: 1 })
    expect(c.controlPoints).toHaveLength(1)
    expect(c).not.toHaveProperty('extra')
  })
  it('refuses out-of-range coordinates and too many points', () => {
    expect(() => parseCalibration({ version: 1, controlPoints: [{ ...cp, lat: 100 }] })).toThrow()
    const many = Array.from({ length: LIMITS.controlPoints + 1 }, (_, i) => ({ ...cp, id: `c${i}` }))
    expect(() => parseCalibration({ version: 1, controlPoints: many })).toThrow(/too many/)
  })
})

describe('storage helpers', () => {
  it('refuses oversized json', () => {
    expect(() => toStoredJson({ s: 'x'.repeat(LIMITS.jsonBytes + 1) })).toThrow()
    expect(toStoredJson({ a: 1 })).toBe('{"a":1}')
  })
  it('recordFromStored rejects damaged records', () => {
    const raw = { name: 'A', public: false, mapImage: img.url, mapWidth: 5, mapHeight: 5, centerLat: 1, centerLon: 2, updatedAt: '2026-01-01T00:00:00Z' }
    expect(recordFromStored('abc', raw)?.name).toBe('A')
    expect(recordFromStored('abc', { ...raw, mapImage: 'http://x' })).toBeNull()
    expect(recordFromStored('a/b', raw)).toBeNull()
    expect(recordFromStored('abc', null)).toBeNull()
  })
})
