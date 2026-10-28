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
    } else if (method === 'PATCH') for (const [k, v] of Object.entries(body as Record<string, unknown>)) set(`${path}/${k}`, v === undefined ? null : v)
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
      expect((await a.saveLocalGuideAction('hub-a', 'https://guide.example.com')).error).toBeTruthy()
    }
    expect(state.writes).toEqual([])
  })
  it('lets the super admin save and validates input', async () => {
    const a = await actions()
    expect((await a.saveContactsAction('hub-a', { phone: '+1 555 0100', email: 'a@b.co', website: 'https://x.com' })).success).toBeTruthy()
    expect(get('hubs/hub-a/settingsDraft/data/contacts')).toMatchObject({ phone: '+1 555 0100' })
    expect((await a.saveContactsAction('hub-a', { website: 'http://x.com' })).error).toMatch(/https/)
    expect((await a.saveLocalGuideAction('hub-a', 'https://guide.example.com')).success).toBeTruthy()
    expect(get('hubs/hub-a/settingsDraft/data/localGuideUrl')).toBe('https://guide.example.com/')
    expect((await a.saveLocalGuideAction('hub-a', 'javascript:alert(1)')).error).toBeTruthy()
    expect((await a.saveLocalGuideAction('hub-a', 'http://guide.example.com')).error).toMatch(/https/)
    expect((await a.saveLocationAction('hub-a', { lat: 200, lon: 0 })).error).toBeTruthy()
    expect((await a.saveHeroImageAction('hub-a', 'banner', img.url)).error).toBeTruthy()
    expect((await a.saveHeroImageAction('hub-a', 'home', 'javascript:alert(1)')).error).toBeTruthy()
    expect((await a.saveHeroImageAction('hub-a', 'home', img.url)).success).toBeTruthy()
    expect(get('hubs/hub-a/settingsDraft/data/heroImages/home')).toBe(img.url)
  })
  it('keeps hubs apart: a map of another hub cannot be chosen', async () => {
    set('hubs/hub-b/pathfinder/campgrounds/zzz', { name: 'B map', public: true, mapImage: img.url, mapWidth: 8, mapHeight: 6, centerLat: 1, centerLon: 2 })
    set('hubs/hub-a/pathfinder/campgrounds/aaa', { name: 'A map', public: true, mapImage: img.url, mapWidth: 8, mapHeight: 6, centerLat: 1, centerLon: 2 })
    const a = await actions()
    expect((await a.saveMapDisplayAction('hub-a', { mode: 'pathfinder', campgroundId: 'zzz' })).error).toMatch(/does not exist/)
    expect((await a.saveMapDisplayAction('hub-a', { mode: 'pathfinder', campgroundId: 'aaa' })).success).toBeTruthy()
    expect(state.writes.some((w) => w.includes('hub-b/settings') || w.includes('hub-b'))).toBe(false)
  })
})


describe('drafts, publish, restore and history', () => {
  const live = (k: string) => get(`hubs/hub-a/settings/${k}`)

  it('saving only changes the draft: the live settings and the guests are untouched until publish', async () => {
    const a = await actions()
    expect((await a.saveContactsAction('hub-a', { phone: '+1 555 0100' })).version).toBe(1)
    expect((await a.saveHeroImageAction('hub-a', 'home', img.url)).version).toBe(2)
    expect(live('contacts')).toBeNull()
    expect(live('heroImages')).toBeNull()
    expect(state.writes.every((w) => w.includes('settingsDraft'))).toBe(true)
  })

  it('publish writes only the changed settings, a release, a history entry, and clears the draft in one update', async () => {
    set('hubs/hub-a/settings/colorPalette', { primary: '#112233' })
    set('hubs/hub-a/settings/wifi', { ssid: 'old', password: 'p' })
    const a = await actions()
    await a.saveContactsAction('hub-a', { phone: '+1 555 0100' })
    await a.saveHeroImageAction('hub-a', 'home', img.url)
    state.writes = []
    const r = await a.publishSettingsAction('hub-a', 2)
    expect(r.success).toMatch(/Published 2 changes/)
    expect(live('contacts')).toMatchObject({ phone: '+1 555 0100' })
    expect(live('heroImages')).toEqual({ home: img.url })
    // Untouched settings are not rewritten.
    expect(live('colorPalette')).toEqual({ primary: '#112233' })
    expect(live('wifi')).toEqual({ ssid: 'old', password: 'p' })
    // One atomic request.
    expect(state.writes).toEqual(['PATCH hubs/hub-a'])
    expect(get('hubs/hub-a/settingsDraft/data')).toBeNull()
    expect((get('hubs/hub-a/settingsDraft/version') as number)).toBe(3)
    const releases = Object.values(get('hubs/hub-a/releases') as Record<string, { kind: string }>)
    expect(releases.map((x) => x.kind).sort()).toEqual(['baseline', 'publish'])
    const month = Object.values(get('hubs/hub-a/audit') as Record<string, Record<string, { action: string; by: string }>>)[0]
    expect(Object.values(month).map((x) => x.action).sort()).toEqual(['baseline', 'publish'])
    expect(Object.values(month).every((x) => x.by === 'boss@x.test')).toBe(true)
  })

  it('refuses to publish or save over a newer draft (conflict), and writes nothing', async () => {
    const a = await actions()
    await a.saveContactsAction('hub-a', { phone: '+1 555 0100' }) // version 1 by someone
    state.writes = []
    const stale = await a.saveWifiAction('hub-a', 'net', 'pw', 0)
    expect(stale.conflict).toBe(true)
    expect(stale.error).toMatch(/boss@x.test/)
    const pub = await a.publishSettingsAction('hub-a', 0)
    expect(pub.conflict).toBe(true)
    expect(state.writes).toEqual([])
    expect(live('contacts')).toBeNull()
  })

  it('publishing with nothing different from live changes nothing', async () => {
    const a = await actions()
    await a.saveGeofenceAction('hub-a', true) // already the default
    state.writes = []
    const r = await a.publishSettingsAction('hub-a')
    expect(r.success).toMatch(/Nothing to publish/)
    expect(get('hubs/hub-a/releases')).toBeNull()
  })

  it('a cleared location and a removed picture really leave the live settings', async () => {
    set('hubs/hub-a/settings/location', { lat: 1, lon: 2 })
    set('hubs/hub-a/settings/heroImages', { home: img.url })
    const a = await actions()
    await a.saveLocationAction('hub-a', { lat: '', lon: '' })
    await a.saveHeroImageAction('hub-a', 'home', '')
    await a.publishSettingsAction('hub-a')
    expect(live('location')).toBeNull()
    expect(live('heroImages')).toBeNull()
  })

  it('restore puts an earlier published version back and records it', async () => {
    const a = await actions()
    await a.saveContactsAction('hub-a', { phone: '+1 555 0100' })
    await a.publishSettingsAction('hub-a')
    await a.saveContactsAction('hub-a', { phone: '+1 555 0200' })
    await a.publishSettingsAction('hub-a')
    expect(live('contacts')).toMatchObject({ phone: '+1 555 0200' })
    const rels = Object.entries(get('hubs/hub-a/releases') as Record<string, { at: string; kind: string; snapshot: Record<string, { phone?: string }> }>)
    const first = rels.find(([, r]) => r.kind === 'publish' && r.snapshot.contacts?.phone === '+1 555 0100')!
    const res = await a.restoreReleaseAction('hub-a', first[0])
    expect(res.success).toMatch(/Restored/)
    expect(live('contacts')).toMatchObject({ phone: '+1 555 0100' })
    // The restore is itself a release and a history entry; the draft is empty.
    const kinds = Object.values(get('hubs/hub-a/releases') as Record<string, { kind: string }>).map((r) => r.kind)
    expect(kinds).toContain('restore')
    expect(get('hubs/hub-a/settingsDraft/data')).toBeNull()
    expect((await a.restoreReleaseAction('hub-a', 'nope')).error).toMatch(/no longer exists/)
    expect((await a.restoreReleaseAction('hub-a', '../x')).error).toBeTruthy()
  })

  it('restoring the baseline brings back settings from before the first publish', async () => {
    set('hubs/hub-a/settings/wifi', { ssid: 'orig', password: 'p' })
    const a = await actions()
    await a.saveWifiAction('hub-a', 'changed', 'p2')
    await a.publishSettingsAction('hub-a')
    expect(live('wifi')).toEqual({ ssid: 'changed', password: 'p2' })
    const baseline = Object.entries(get('hubs/hub-a/releases') as Record<string, { kind: string }>).find(([, r]) => r.kind === 'baseline')!
    await a.restoreReleaseAction('hub-a', baseline[0])
    expect(live('wifi')).toEqual({ ssid: 'orig', password: 'p' })
  })

  it('discard drops the draft and leaves live as it was', async () => {
    const a = await actions()
    await a.saveContactsAction('hub-a', { phone: '+1 555 0100' })
    expect((await a.discardDraftAction('hub-a')).success).toMatch(/discarded/)
    expect(get('hubs/hub-a/settingsDraft/data')).toBeNull()
    expect(live('contacts')).toBeNull()
  })

  it('does not publish a Path Finder map that was deleted after it was chosen', async () => {
    set('hubs/hub-a/pathfinder/campgrounds/aaa', { name: 'A map', public: true, mapImage: img.url, mapWidth: 8, mapHeight: 6, centerLat: 1, centerLon: 2 })
    const a = await actions()
    await a.saveMapDisplayAction('hub-a', { mode: 'pathfinder', campgroundId: 'aaa' })
    set('hubs/hub-a/pathfinder/campgrounds/aaa', null)
    const r = await a.publishSettingsAction('hub-a')
    expect(r.error).toMatch(/no longer exists/)
    expect(live('mapDisplay')).toBeNull()
  })

  it('managers cannot publish, restore or discard; another hub is never written', async () => {
    const a = await actions()
    await a.saveContactsAction('hub-a', { phone: '+1 555 0100' })
    state.session = { role: 'manager', hubId: 'hub-a', email: 'm@x.test' }
    state.writes = []
    for (const r of [await a.publishSettingsAction('hub-a'), await a.restoreReleaseAction('hub-a', 'r1'), await a.discardDraftAction('hub-a')]) expect(r.error).toBeTruthy()
    expect(state.writes).toEqual([])
    state.session = { role: 'super', email: 'boss@x.test' }
    await a.publishSettingsAction('hub-a')
    expect(get('hubs/hub-b')).toBeNull()
  })

  it('direct changes (hub status) take effect at once and are written to the history', async () => {
    const a = await actions()
    await a.saveHubStatusAction('hub-a', false)
    expect(get('hubs_meta/hub-a')).toMatchObject({ active: false, status: 'inactive' })
    const month = Object.values(get('hubs/hub-a/audit') as Record<string, Record<string, { action: string }>>)[0]
    expect(Object.values(month)[0].action).toBe('hub.status')
  })
})
