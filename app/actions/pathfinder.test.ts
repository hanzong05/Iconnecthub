import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ session: null as null | { role: string; hubId?: string; email: string }, tree: {} as Record<string, unknown>, writes: [] as string[] }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => state.session, getFirebaseToken: async () => 'tok' }))

const segs = (p: string) => p.split('/').filter(Boolean)
function get(path: string): unknown {
  let c: unknown = state.tree
  for (const k of segs(path)) {
    if (c === null || typeof c !== 'object' || !(k in (c as object))) return null
    c = (c as Record<string, unknown>)[k]
  }
  return c ?? null
}
function set(path: string, v: unknown) {
  const a = segs(path)
  let c = state.tree as Record<string, unknown>
  for (let i = 0; i < a.length - 1; i++) {
    if (typeof c[a[i]] !== 'object' || c[a[i]] === null) c[a[i]] = {}
    c = c[a[i]] as Record<string, unknown>
  }
  if (v === null) delete c[a[a.length - 1]]
  else c[a[a.length - 1]] = v
}

let n = 0
beforeEach(() => {
  process.env.AUTH_SECRET = 'x'.repeat(40)
  process.env.FIREBASE_API_KEY = 'k'
  process.env.FIREBASE_DATABASE_URL = 'https://db.test'
  process.env.PASSWORD_RESET_WORKER_URL = 'https://w.test'
  state.session = { role: 'super', email: 'boss@x.test' }
  state.writes = []
  state.tree = { hubs_meta: { 'hub-a': { name: 'A' }, 'hub-b': { name: 'B' } } }
  vi.stubGlobal('fetch', async (input: string, init?: { method?: string; body?: string }) => {
    const u = new URL(input)
    const path = decodeURIComponent(u.pathname).replace(/^\//, '').replace(/\.json$/, '')
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body) : null
    const ok = (v: unknown) => ({ ok: true, status: 200, json: async () => v })
    if (method === 'GET') return ok(get(path))
    state.writes.push(`${method} ${path}`)
    if (method === 'DELETE') set(path, null)
    else if (method === 'PUT') set(path, body)
    else if (method === 'POST') {
      const k = `-N${++n}`
      set(`${path}/${k}`, body)
      return ok({ name: k })
    } else if (method === 'PATCH') set(path, { ...(get(path) as object), ...body })
    return ok(body)
  })
})

const img = { url: 'https://i.ibb.co/x/y.webp', width: 800, height: 600 }
const form = { name: 'Camp', public: true, centerLat: 40, centerLon: -70, image: img }
const seed = (hub: string, id: string) => set(`hubs/${hub}/pathfinder/campgrounds/${id}`, { name: 'Seed', public: true, mapImage: img.url, mapWidth: 8, mapHeight: 6, centerLat: 1, centerLon: 2 })
const pin = { id: 'p1', name: 'Site', category: 'campsite', placement: 'estimated', x: 1, y: 2 }

async function actions() {
  return import('./pathfinder')
}

describe('access control', () => {
  it('refuses everything without a session', async () => {
    state.session = null
    const a = await actions()
    const r = await a.createCampgroundAction('hub-a', form)
    expect(r.ok).toBe(false)
    expect(state.writes).toEqual([])
  })

  it('managers and super managers are refused everything (Super Admin only)', async () => {
    const a = await actions()
    for (const role of ['manager', 'super_manager']) {
      state.session = { role, hubId: 'hub-a', email: 'm@a.test' }
      seed('hub-a', 'cgA')
      for (const r of [
        await a.createCampgroundAction('hub-a', form),
        await a.updateCampgroundAction('hub-a', 'cgA', form),
        await a.saveNetworkAction('hub-a', 'cgA', { pins: [], walkways: [], obstacles: [] }),
        await a.deleteCampgroundAction('hub-a', 'cgA'),
      ])
        expect(r).toEqual({ ok: false, error: 'Only a Super Admin can use Path Finder.' })
    }
    expect(state.writes).toEqual([])
  })

  it('a campground is only reachable through the hub that owns it', async () => {
    seed('hub-b', 'cgB')
    const a = await actions()
    for (const call of [
      () => a.updateCampgroundAction('hub-a', 'cgB', form),
      () => a.saveNetworkAction('hub-a', 'cgB', { pins: [], walkways: [], obstacles: [] }),
      () => a.saveCalibrationAction('hub-a', 'cgB', { version: 1, controlPoints: [], checkpoints: [] }),
      () => a.deleteCampgroundAction('hub-a', 'cgB'),
    ]) {
      const r = await call()
      expect(r.ok).toBe(false)
    }
    expect(state.writes).toEqual([])
    expect(get('hubs/hub-b/pathfinder/campgrounds/cgB')).not.toBeNull()
  })

  it('refuses ids that try to walk the database path', async () => {
    const a = await actions()
    for (const id of ['../hub-b/pathfinder/campgrounds/x', 'a/b', '..', '']) {
      expect((await a.saveNetworkAction('hub-a', id, { pins: [], walkways: [], obstacles: [] })).ok).toBe(false)
    }
    expect((await a.createCampgroundAction('hub-a/../hub-b', form)).ok).toBe(false)
    expect(state.writes).toEqual([])
  })

  it('a super admin works on any existing hub, but not one that does not exist', async () => {
    const a = await actions()
    expect((await a.createCampgroundAction('hub-b', form)).ok).toBe(true)
    expect(Object.keys(get('hubs/hub-b/pathfinder/campgrounds') as object)).toHaveLength(1)
    const r = await a.createCampgroundAction('ghost', form)
    expect(r).toEqual({ ok: false, error: 'That hub does not exist.' })
  })
})

describe('own hub', () => {
  it('creates, edits, saves the map and deletes everything', async () => {
    const a = await actions()
    const created = await a.createCampgroundAction('hub-a', form)
    expect(created.ok).toBe(true)
    const id = (created as { id: string }).id
    expect((await a.updateCampgroundAction('hub-a', id, { name: 'Renamed', public: false, centerLat: 1, centerLon: 2 })).ok).toBe(true)
    expect(get(`hubs/hub-a/pathfinder/campgrounds/${id}/name`)).toBe('Renamed')
    // the picture is kept when none is sent
    expect(get(`hubs/hub-a/pathfinder/campgrounds/${id}/mapImage`)).toBe(img.url)

    expect((await a.saveNetworkAction('hub-a', id, { pins: [{ ...pin, extra: 'dropped' }], walkways: [], obstacles: [] })).ok).toBe(true)
    const stored = JSON.parse(get(`hubs/hub-a/pathfinder/network/${id}/json`) as string)
    expect(stored.pins[0]).not.toHaveProperty('extra')
    expect((await a.saveCalibrationAction('hub-a', id, { version: 1, controlPoints: [], checkpoints: [] })).ok).toBe(true)

    expect((await a.deleteCampgroundAction('hub-a', id)).ok).toBe(true)
    expect(get(`hubs/hub-a/pathfinder/campgrounds/${id}`)).toBeNull()
    expect(get(`hubs/hub-a/pathfinder/network/${id}`)).toBeNull()
    expect(get(`hubs/hub-a/pathfinder/calibration/${id}`)).toBeNull()
  })

  it('does not resurrect a deleted campground when a late save arrives', async () => {
    const a = await actions()
    const id = ((await a.createCampgroundAction('hub-a', form)) as { id: string }).id
    await a.deleteCampgroundAction('hub-a', id)
    const r = await a.saveNetworkAction('hub-a', id, { pins: [pin], walkways: [], obstacles: [] })
    expect(r.ok).toBe(false)
    expect(get(`hubs/hub-a/pathfinder/network/${id}`)).toBeNull()
  })

  it('refuses invalid data without writing', async () => {
    const a = await actions()
    const id = ((await a.createCampgroundAction('hub-a', form)) as { id: string }).id
    state.writes = []
    expect((await a.saveNetworkAction('hub-a', id, { pins: [{ ...pin, category: 'weapon' }], walkways: [], obstacles: [] })).ok).toBe(false)
    expect((await a.saveNetworkAction('hub-a', id, 'nope')).ok).toBe(false)
    expect((await a.updateCampgroundAction('hub-a', id, { ...form, image: { ...img, url: 'http://insecure.test/a.png' } })).ok).toBe(false)
    expect((await a.updateCampgroundAction('hub-a', id, { ...form, centerLat: 400 })).ok).toBe(false)
    expect(state.writes).toEqual([])
  })

  it('allows one map per hub: the first is created, a second is refused', async () => {
    const a = await actions()
    expect((await a.createCampgroundAction('hub-a', form)).ok).toBe(true)
    const r = await a.createCampgroundAction('hub-a', form)
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toMatch(/already has a map/)
    // Another hub is unaffected.
    expect((await a.createCampgroundAction('hub-b', form)).ok).toBe(true)
  })
})
