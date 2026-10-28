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

const img = { url: 'https://i.ibb.co/x/y.webp', width: 8, height: 6 }
const actions = () => import('./settings')

describe('settings actions: super admin only', () => {
  it('refuses no session, managers and super managers; writes nothing', async () => {
    const a = await actions()
    for (const session of [null, { role: 'manager', hubId: 'hub-a', email: 'm@x.test' }, { role: 'super_manager', hubId: 'hub-a', email: 's@x.test' }]) {
      state.session = session
      expect((await a.saveContactsAction('hub-a', { phone: '123' })).error).toBeTruthy()
      expect((await a.saveWifiAction('hub-a', 'n', 'p')).error).toBeTruthy()
      expect((await a.saveTabOrderAction('hub-a', ['home', 'events', 'more'])).error).toBeTruthy()
    }
    expect(state.writes).toEqual([])
  })
  it('lets the super admin save and validates input', async () => {
    const a = await actions()
    expect((await a.saveContactsAction('hub-a', { phone: '+1 555 0100', email: 'a@b.co', website: 'https://x.com' })).success).toBeTruthy()
    expect(get('hubs/hub-a/settings/contacts')).toMatchObject({ phone: '+1 555 0100' })
    expect((await a.saveContactsAction('hub-a', { website: 'http://x.com' })).error).toMatch(/https/)
    expect((await a.saveLocationAction('hub-a', { lat: 200, lon: 0 })).error).toBeTruthy()
    expect((await a.saveHeroImageAction('hub-a', 'banner', img.url)).error).toBeTruthy()
    expect((await a.saveHeroImageAction('hub-a', 'home', 'javascript:alert(1)')).error).toBeTruthy()
    expect((await a.saveHeroImageAction('hub-a', 'home', img.url)).success).toBeTruthy()
    expect(get('hubs/hub-a/settings/heroImages/home')).toBe(img.url)
  })
  it('keeps hubs apart: a map of another hub cannot be chosen', async () => {
    set('hubs/hub-b/pathfinder/campgrounds/zzz', { name: 'B map', public: true, mapImage: img.url, mapWidth: 8, mapHeight: 6, centerLat: 1, centerLon: 2 })
    set('hubs/hub-a/pathfinder/campgrounds/aaa', { name: 'A map', public: true, mapImage: img.url, mapWidth: 8, mapHeight: 6, centerLat: 1, centerLon: 2 })
    const a = await actions()
    expect((await a.saveMapDisplayAction('hub-a', { mode: 'pathfinder', campgroundId: 'zzz' })).error).toMatch(/does not exist/)
    expect((await a.saveMapDisplayAction('hub-a', { mode: 'pathfinder', campgroundId: 'aaa' })).success).toBeTruthy()
    expect(state.writes.some((w) => w.includes('hub-b/settings'))).toBe(false)
  })
})
