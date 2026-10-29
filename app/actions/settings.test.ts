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

describe('custom menu items', () => {
  const groups = [{ id: 'g1', icon: 'person', label: 'More', items: ['wifi', 'c_rvsites', 'c_gone1'] }]
  const items = [{ id: 'c_rvsites', label: 'RV Sites', icon: 'home', kind: 'sheet', rows: [{ label: 'Premium', url: 'https://example.com/p' }] }]
  it('saves items and groups together; groups keep only items that exist', async () => {
    const a = await actions()
    const r = await a.saveMenuAction('hub-a', { items, groups })
    expect(r.success).toBeTruthy()
    expect(get('hubs/hub-a/settingsDraft/data/menuItems')).toMatchObject([{ id: 'c_rvsites', kind: 'sheet' }])
    expect(get('hubs/hub-a/settingsDraft/data/visibilityGroups/0/items')).toEqual(['wifi', 'c_rvsites'])
  })
  it('refuses unsafe or invalid items and saves nothing', async () => {
    const a = await actions()
    const before = state.writes.length
    expect((await a.saveMenuAction('hub-a', { items: [{ ...items[0], rows: [{ label: 'x', url: 'javascript:alert(1)' }] }], groups })).error).toBeTruthy()
    expect((await a.saveMenuAction('hub-a', { items: [{ id: 'wifi', label: 'x', icon: 'home', kind: 'page' }], groups })).error).toBeTruthy()
    expect((await a.saveMenuAction('hub-a', { items: 'nope', groups })).error).toBeTruthy()
    expect(state.writes.length).toBe(before)
  })
  it('lets the group editor place a custom item only once it exists in the draft', async () => {
    const a = await actions()
    await a.saveMenuAction('hub-a', { items, groups: [{ id: 'g1', icon: 'person', label: 'More', items: ['wifi'] }] })
    const r = await a.saveGroupsAction('hub-a', [{ id: 'g1', icon: 'person', label: 'More', items: ['c_rvsites', 'c_other1', 'wifi'] }])
    expect(r.success).toBeTruthy()
    expect(get('hubs/hub-a/settingsDraft/data/visibilityGroups/0/items')).toEqual(['c_rvsites', 'wifi'])
  })
})

describe('settings actions: super admin only', () => {
  it('refuses no session, managers and super managers; writes nothing', async () => {
    const a = await actions()
    for (const session of [null, { role: 'manager', hubId: 'hub-a', email: 'm@x.test' }, { role: 'super_manager', hubId: 'hub-a', email: 's@x.test' }]) {
      state.session = session
      expect((await a.saveContactsAction('hub-a', { phone: '123' })).error).toBeTruthy()
      expect((await a.saveWifiAction('hub-a', 'n', 'p')).error).toBeTruthy()
      expect((await a.saveTabOrderAction('hub-a', ['home', 'events', 'more'])).error).toBeTruthy()
      expect((await a.saveLocalGuideAction('hub-a', 'https://guide.example.com')).error).toBeTruthy()
      expect((await a.saveMenuAction('hub-a', { items: [], groups: [] })).error).toBeTruthy()
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

describe('importing a menu plan', () => {
  const slot = (id: string, type: string, label: string, extra = {}) => ({ id, type, label, required: false, maxRows: 10, rowKind: 'rule', ...extra })
  const plan = () => ({
    hub: 'demo',
    items: [
      { id: 'c_fishing', label: 'Fishing', icon: 'info', kind: 'page', url: '', rows: [], shown: true, template: { slots: [slot('saa', 'header', 'Title', { required: true }), slot('sab', 'description', 'Hours')] } },
      { id: 'c_amen01', label: 'Amenities', icon: 'star', kind: 'sheet', url: '', rows: [{ label: 'Fishing', url: '', page: 'c_fishing' }], shown: true },
    ],
    values: { c_fishing: { saa: { title: 'Fishing', subtitle: 'The lake' }, sab: { title: 'Hours', body: '6 AM to midnight' } } },
  })
  it('saves the items to the settings draft and the content to page drafts, and writes nothing live', async () => {
    const a = await actions()
    const r = await a.importMenuPlanAction('hub-a', plan())
    expect(r).toMatchObject({ success: expect.any(String), pages: 1, skipped: 0 })
    expect((get('hubs/hub-a/settingsDraft/data/menuItems') as unknown[]).length).toBe(2)
    expect(get('hubs/hub-a/pagesDraft/c_fishing')).toMatchObject({ title: 'Fishing', version: 1, updatedBy: 'boss@x.test' })
    expect(get('hubs/hub-a/pages/c_fishing')).toBeNull()
    expect(get('hubs/hub-a/settings')).toBeNull()
    expect(state.writes.some((w) => /\/pages\/|\/settings\//.test(w))).toBe(false)
  })
  it('leaves a page that already has live content or a draft alone, and keeps other items already in the draft', async () => {
    const a = await actions()
    await a.saveMenuAction('hub-a', { items: [{ id: 'c_other01', label: 'Other', icon: 'home', kind: 'link', url: 'https://o.test/' }], groups: [] })
    set('hubs/hub-a/pages/c_fishing', { title: 'Mine', subtitle: '', banner: '', n: 0 })
    const r = await a.importMenuPlanAction('hub-a', plan())
    expect(r).toMatchObject({ pages: 0, skipped: 1 })
    expect(get('hubs/hub-a/pages/c_fishing')).toMatchObject({ title: 'Mine' })
    expect(get('hubs/hub-a/pagesDraft/c_fishing')).toBeNull()
    expect((get('hubs/hub-a/settingsDraft/data/menuItems') as { id: string }[]).map((m) => m.id).sort()).toEqual(['c_amen01', 'c_fishing', 'c_other01'])
  })
  it('is safe to load twice: items are replaced by id and page drafts are not overwritten', async () => {
    const a = await actions()
    await a.importMenuPlanAction('hub-a', plan())
    const r = await a.importMenuPlanAction('hub-a', plan())
    expect(r).toMatchObject({ pages: 0, skipped: 1 })
    expect((get('hubs/hub-a/settingsDraft/data/menuItems') as unknown[]).length).toBe(2)
  })
  it('refuses a bad plan and writes nothing: unsafe link, row to a missing page, unsafe page content, empty file, too many items', async () => {
    const a = await actions()
    const bad = (fn: (p: ReturnType<typeof plan>) => void) => { const p = plan(); fn(p); return p }
    const before = state.writes.length
    expect((await a.importMenuPlanAction('hub-a', bad((p) => { p.items[1].rows = [{ label: 'x', url: 'javascript:alert(1)' }] as never }))).error).toBeTruthy()
    expect((await a.importMenuPlanAction('hub-a', bad((p) => { p.items[1].rows = [{ label: 'x', url: '', page: 'c_nothere' }] as never }))).error).toMatch(/does not exist/)
    expect((await a.importMenuPlanAction('hub-a', bad((p) => { (p.values.c_fishing.sab as { body: string }).body = 'ok'; (p.values.c_fishing as Record<string, unknown>).saa = { title: 'x'.repeat(200) } }))).error).toMatch(/too long/)
    expect((await a.importMenuPlanAction('hub-a', { items: [] })).error).toMatch(/no menu items/)
    expect((await a.importMenuPlanAction('hub-a', 'nope')).error).toBeTruthy()
    expect((await a.importMenuPlanAction('hub-a', { items: Array.from({ length: 31 }, (_, i) => ({ id: `c_it${i}aa`, label: 'x', icon: 'info', kind: 'page' })) })).error).toMatch(/at most/)
    expect(state.writes.length).toBe(before)
  })
  it('is for the Super Admin of that hub only', async () => {
    const a = await actions()
    for (const s of [null, { role: 'manager', hubId: 'hub-a', email: 'm@x.test' }, { role: 'super_manager', hubId: 'hub-a', email: 'sm@x.test' }]) {
      state.session = s
      expect((await a.importMenuPlanAction('hub-a', plan())).error).toBeTruthy()
    }
    state.session = { role: 'super', email: 'boss@x.test' }
    expect((await a.importMenuPlanAction('../hub-b', plan())).error).toBeTruthy()
    expect(state.writes).toEqual([])
  })
  it('refuses when someone else saved the settings draft first', async () => {
    const a = await actions()
    await a.saveWifiAction('hub-a', 'Net', 'pw')
    expect((await a.importMenuPlanAction('hub-a', plan(), 0)).conflict).toBe(true)
    expect(get('hubs/hub-a/pagesDraft/c_fishing')).toBeNull()
  })
})

describe('naming built-in items', () => {
  const draftData = () => (get('hubs/hub-a/settingsDraft/data') ?? {}) as Record<string, unknown>

  it('saves a name for a built-in item as a draft and leaves the live settings alone', async () => {
    const { saveMoreLabelAction } = await actions()
    const r = await saveMoreLabelAction('hub-a', 'contact', '  Call   the Office ')
    expect(r.error).toBeUndefined()
    expect(draftData().moreLabels).toEqual({ contact: 'Call the Office' })
    expect(get('hubs/hub-a/settings/moreLabels')).toBeNull()
  })

  it('keeps an empty value so a live name can be cleared, and keeps other names', async () => {
    const { saveMoreLabelAction } = await actions()
    await saveMoreLabelAction('hub-a', 'contact', 'Call the Office')
    await saveMoreLabelAction('hub-a', 'wifi', 'Internet')
    await saveMoreLabelAction('hub-a', 'contact', '')
    expect(draftData().moreLabels).toEqual({ contact: '', wifi: 'Internet' })
  })

  it('refuses unknown items, markup, control characters and long names, writing nothing', async () => {
    const { saveMoreLabelAction } = await actions()
    expect((await saveMoreLabelAction('hub-a', 'c_rvsites', 'x')).error).toBe('Unknown item.')
    expect((await saveMoreLabelAction('hub-a', 'wifi/../x', 'x')).error).toBe('Unknown item.')
    expect((await saveMoreLabelAction('hub-a', 'wifi', '<b>Hi</b>')).error).toMatch(/special characters/)
    expect((await saveMoreLabelAction('hub-a', 'wifi', 'a\u0007b')).error).toMatch(/special characters/)
    expect((await saveMoreLabelAction('hub-a', 'wifi', 'x'.repeat(41))).error).toMatch(/too long/)
    expect(state.writes).toEqual([])
  })

  it('publishing puts the names live, and clearing the last name removes them from the live settings', async () => {
    const a = await actions()
    await a.saveMoreLabelAction('hub-a', 'contact', 'Call the Office')
    await a.publishSettingsAction('hub-a')
    expect(get('hubs/hub-a/settings/moreLabels')).toEqual({ contact: 'Call the Office' })
    await a.saveMoreLabelAction('hub-a', 'contact', '')
    await a.publishSettingsAction('hub-a')
    expect(get('hubs/hub-a/settings/moreLabels')).toBeNull()
  })

  it('is for the super admin only, and rejects a stale page', async () => {
    const { saveMoreLabelAction } = await actions()
    state.session = { role: 'manager', hubId: 'hub-a', email: 'm1@x.test' }
    expect((await saveMoreLabelAction('hub-a', 'wifi', 'Internet')).error).toMatch(/super admin/i)
    state.session = { role: 'super', email: 'boss@x.test' }
    set('hubs/hub-a/settingsDraft', { version: 4, updatedBy: 'other@x.test', data: {} })
    const r = await saveMoreLabelAction('hub-a', 'wifi', 'Internet', 3)
    expect(r.conflict).toBe(true)
    expect(draftData().moreLabels).toBeUndefined()
  })
})

describe('rules list', () => {
  const draftData = () => (get('hubs/hub-a/settingsDraft/data') ?? {}) as Record<string, unknown>

  it('saves the rules as a draft, in order, and leaves live alone until published', async () => {
    const a = await actions()
    const r = await a.saveHouseRulesAction('hub-a', [{ title: ' Quiet hours ', details: '10pm to 7am' }, { title: 'Pets', details: '' }])
    expect(r.error).toBeUndefined()
    expect(draftData().houseRules).toEqual([{ title: 'Quiet hours', details: '10pm to 7am' }, { title: 'Pets', details: '' }])
    expect(get('hubs/hub-a/settings/houseRules')).toBeNull()
    await a.publishSettingsAction('hub-a')
    expect(get('hubs/hub-a/settings/houseRules')).toEqual([{ title: 'Quiet hours', details: '10pm to 7am' }, { title: 'Pets', details: '' }])
  })

  it('emptying the list clears the live rules on publish', async () => {
    set('hubs/hub-a/settings/houseRules', [{ title: 'Old', details: '' }])
    const a = await actions()
    const r = await a.saveHouseRulesAction('hub-a', [])
    expect(r.success).toMatch(/Rules cleared/)
    await a.publishSettingsAction('hub-a')
    expect(get('hubs/hub-a/settings/houseRules')).toBeNull()
  })

  it('refuses a rule without a title, writing nothing', async () => {
    const a = await actions()
    state.writes = []
    expect((await a.saveHouseRulesAction('hub-a', [{ title: '', details: 'x' }])).error).toMatch(/add a title/)
    expect(state.writes).toEqual([])
  })

  it('is for the super admin only, and rejects a stale page', async () => {
    const a = await actions()
    state.session = { role: 'manager', hubId: 'hub-a', email: 'm1@x.test' }
    expect((await a.saveHouseRulesAction('hub-a', [{ title: 'Pets', details: '' }])).error).toMatch(/super admin/i)
    state.session = { role: 'super', email: 'boss@x.test' }
    set('hubs/hub-a/settingsDraft', { version: 4, updatedBy: 'other@x.test', data: {} })
    expect((await a.saveHouseRulesAction('hub-a', [{ title: 'Pets', details: '' }], 3)).conflict).toBe(true)
  })
})
