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


const actions = () => import('./pages')
const rules = (extra: unknown[] = []) => ({ title: 'Rules', subtitle: 'Park rules', banner: '', blocks: [{ type: 'section', title: 'Check-in' }, { type: 'rule', title: 'Time', body: '**2:00 PM**' }, ...extra] })
const manager = { role: 'manager', hubId: 'hub-a', email: 'm@x.test' }
const live = (hub: string, id: string) => get(`hubs/${hub}/pages/${id}`) as Record<string, unknown> | null
const draft = (hub: string, id: string) => get(`hubs/${hub}/pagesDraft/${id}`) as Record<string, unknown> | null

describe('pages: custom details-page menu items', () => {
  const menu = [{ id: 'c_cabins1', label: 'Cabins', icon: 'bed', kind: 'page' }, { id: 'c_suntex1', label: 'Suntex', icon: 'boat', kind: 'link', url: 'https://suntex.com/' }]
  const cabins = () => ({ title: 'Cabins', subtitle: '', banner: '', blocks: [{ type: 'rule', title: 'Big Cabin', body: 'Sleeps 8' }] })
  it('lets a manager of that hub edit and publish the page once the item is published', async () => {
    state.tree = { hubs_meta: { 'hub-a': { name: 'A' }, 'hub-b': { name: 'B' } }, hubs: { 'hub-a': { settings: { menuItems: menu } } } }
    state.session = manager
    const a = await actions()
    expect((await a.savePageDraftAction('hub-a', 'c_cabins1', cabins(), 0)).success).toBeTruthy()
    expect((await a.publishPageAction('hub-a', 'c_cabins1', 1)).success).toBeTruthy()
    expect(live('hub-a', 'c_cabins1')).toMatchObject({ title: 'Cabins' })
  })
  it('refuses a page that is not a published details page of that hub (draft-only, other kind, other hub, made up)', async () => {
    state.tree = { hubs_meta: { 'hub-a': { name: 'A' }, 'hub-b': { name: 'B' } }, hubs: { 'hub-a': { settings: { menuItems: menu }, settingsDraft: { data: { menuItems: [...menu, { id: 'c_draft01', label: 'Soon', icon: 'info', kind: 'page' }] } } } } }
    const a = await actions()
    for (const [hub, id] of [['hub-a', 'c_suntex1'], ['hub-a', 'c_draft01'], ['hub-a', 'c_nothere'], ['hub-b', 'c_cabins1']] as const) {
      state.session = { role: 'super', email: 'boss@x.test' }
      expect((await a.savePageDraftAction(hub, id, cabins(), 0)).error).toMatch(/does not exist/)
    }
    state.session = manager
    expect((await a.savePageDraftAction('hub-b', 'c_cabins1', cabins(), 0)).error).toBeTruthy()
    expect(state.writes).toEqual([])
  })
  it('lists the custom pages after the fixed ones', async () => {
    state.tree = { hubs_meta: { 'hub-a': { name: 'A' } }, hubs: { 'hub-a': { settings: { menuItems: menu } } } }
    const { getPages } = await import('@/lib/data/pages')
    const list = await getPages('hub-a')
    expect(list.map((p) => p.id).slice(-1)).toEqual(['c_cabins1'])
    expect(list.find((p) => p.id === 'c_cabins1')?.label).toBe('Cabins')
    expect(list.some((p) => p.id === 'c_suntex1')).toBe(false)
  })
})

describe('pages: who may edit which hub', () => {
  it('refuses no session, a guest or unknown role, bad hub ids and unknown pages, and writes nothing', async () => {
    const a = await actions()
    for (const session of [null, { role: 'guest', hubId: 'hub-a', email: 'g@x.test' }, { role: '', hubId: 'hub-a', email: 'x@x.test' }]) {
      state.session = session
      expect((await a.savePageDraftAction('hub-a', 'rules', rules(), 0)).error).toBeTruthy()
      expect((await a.publishPageAction('hub-a', 'rules', 1)).error).toBeTruthy()
      expect((await a.discardPageDraftAction('hub-a', 'rules', 1)).error).toBeTruthy()
      expect((await a.restorePageVersionAction('hub-a', 'rules', 'h1', 0)).error).toBeTruthy()
    }
    state.session = { role: 'super', email: 'boss@x.test' }
    for (const hub of ['', '../hub-b', 'hub-a/pages', 'hub a', 'x'.repeat(65)]) expect((await a.savePageDraftAction(hub, 'rules', rules(), 0)).error).toBeTruthy()
    for (const page of ['', 'nope', '../settings', 'rules/x', '__proto__']) expect((await a.savePageDraftAction('hub-a', page, rules(), 0)).error).toMatch(/does not exist/)
    expect(state.writes).toEqual([])
  })
  it('lets a manager edit their own hub but never another hub, even by sending its id', async () => {
    state.session = manager
    const a = await actions()
    expect((await a.savePageDraftAction('hub-a', 'rules', rules(), 0)).version).toBe(1)
    expect((await a.savePageDraftAction('hub-b', 'rules', rules(), 0)).error).toMatch(/your own hub/)
    expect((await a.publishPageAction('hub-b', 'rules', 1)).error).toBeTruthy()
    expect((await a.discardPageDraftAction('hub-b', 'rules', 1)).error).toBeTruthy()
    expect((await a.restorePageVersionAction('hub-b', 'rules', 'h1', 0)).error).toBeTruthy()
    expect(state.writes.some((w) => w.includes('hub-b'))).toBe(false)
  })
  it('lets a super manager edit their own hub only, and a super admin any existing hub', async () => {
    const a = await actions()
    state.session = { role: 'super_manager', hubId: 'hub-a', email: 'sm@x.test' }
    expect((await a.savePageDraftAction('hub-a', 'rules', rules(), 0)).version).toBe(1)
    expect((await a.savePageDraftAction('hub-b', 'rules', rules(), 0)).error).toBeTruthy()
    state.session = { role: 'super', email: 'boss@x.test' }
    expect((await a.savePageDraftAction('hub-b', 'rules', rules(), 0)).version).toBe(1)
    expect((await a.savePageDraftAction('hub-zzz', 'rules', rules(), 0)).error).toMatch(/does not exist/)
  })
})

describe('pages: drafts keep guests safe until publish', () => {
  beforeEach(() => {
    state.session = manager
  })
  it('saving writes only the draft, stamps who and when, and bumps the version', async () => {
    const a = await actions()
    const r = await a.savePageDraftAction('hub-a', 'rules', rules(), 0)
    expect(r.success).toBeTruthy()
    expect(live('hub-a', 'rules')).toBeNull()
    expect(draft('hub-a', 'rules')).toMatchObject({ title: 'Rules', n: 2, version: 1, updatedBy: 'm@x.test' })
    expect((await a.savePageDraftAction('hub-a', 'rules', rules(), 1)).version).toBe(2)
  })
  it('refuses invalid content and writes nothing', async () => {
    const a = await actions()
    expect((await a.savePageDraftAction('hub-a', 'reservations', { title: 'x', blocks: [{ type: 'contact', label: 'Book', kind: 'link', value: 'javascript:alert(1)' }] }, 0)).error).toMatch(/https/)
    expect((await a.savePageDraftAction('hub-a', 'reservations', { title: 'x', blocks: [{ type: 'iframe', src: 'x' }] }, 0)).error).toMatch(/unknown type/)
    expect((await a.savePageDraftAction('hub-a', 'reservations', 'not a page', 0)).error).toBeTruthy()
    expect(state.writes).toEqual([])
  })
  it('stores markup as plain text and never as live content', async () => {
    const a = await actions()
    await a.savePageDraftAction('hub-a', 'rules', { title: '<b>x</b>', subtitle: '', blocks: [{ type: 'rule', title: '<img src=x onerror=1>', body: "'; DROP TABLE" }] }, 0)
    expect(JSON.stringify(draft('hub-a', 'rules'))).toContain('<img src=x onerror=1>')
    expect(live('hub-a', 'rules')).toBeNull()
  })
  it('warns when someone else saved first and does not overwrite their draft', async () => {
    const a = await actions()
    await a.savePageDraftAction('hub-a', 'rules', rules(), 0)
    state.session = { role: 'super_manager', hubId: 'hub-a', email: 'sm@x.test' }
    await a.savePageDraftAction('hub-a', 'rules', rules([{ type: 'section', title: 'Theirs' }]), 1)
    state.session = manager
    const r = await a.savePageDraftAction('hub-a', 'rules', rules([{ type: 'section', title: 'Mine' }]), 1)
    expect(r).toMatchObject({ conflict: true })
    expect(r.error).toMatch(/sm@x.test/)
    expect(JSON.stringify(draft('hub-a', 'rules'))).toContain('Theirs')
    expect(JSON.stringify(draft('hub-a', 'rules'))).not.toContain('Mine')
    expect((await a.discardPageDraftAction('hub-a', 'rules', 1)).conflict).toBe(true)
    expect((await a.publishPageAction('hub-a', 'rules', 1)).conflict).toBe(true)
  })
  it('different pages and different hubs have separate drafts', async () => {
    const a = await actions()
    await a.savePageDraftAction('hub-a', 'rules', rules(), 0)
    expect((await a.savePageDraftAction('hub-a', 'amenities', rules(), 0)).version).toBe(1)
    state.session = { role: 'super', email: 'boss@x.test' }
    expect((await a.savePageDraftAction('hub-b', 'rules', rules(), 0)).version).toBe(1)
  })
})

describe('pages: publish, history, restore, discard', () => {
  beforeEach(() => {
    state.session = manager
  })
  it('publishes in one step: live page, history, audit, and the draft is gone', async () => {
    const a = await actions()
    await a.savePageDraftAction('hub-a', 'rules', rules(), 0)
    expect((await a.publishPageAction('hub-a', 'rules', 1)).success).toMatch(/live/)
    expect(live('hub-a', 'rules')).toMatchObject({ title: 'Rules', n: 2, updatedBy: 'm@x.test' })
    expect(draft('hub-a', 'rules')).toBeNull()
    const hist = Object.values(get('hubs/hub-a/pageHistory/rules') as Record<string, { action: string }>)
    expect(hist.map((h) => h.action)).toEqual(['publish'])
    const audits = Object.values(get(`hubs/hub-a/audit/${new Date().toISOString().slice(0, 7)}`) as Record<string, { action: string; summary: string }>)
    expect(audits.some((x) => x.action === 'page.publish' && /Rules: New page with 2 blocks/.test(x.summary))).toBe(true)
    expect(state.writes.filter((w) => w.startsWith('PATCH')).length).toBe(1) // one atomic update
  })
  it('a second publish with nothing drafted does nothing, so a double click cannot publish twice', async () => {
    const a = await actions()
    await a.savePageDraftAction('hub-a', 'rules', rules(), 0)
    await a.publishPageAction('hub-a', 'rules', 1)
    const before = JSON.stringify(get('hubs/hub-a'))
    expect((await a.publishPageAction('hub-a', 'rules', 1)).error).toMatch(/no draft/)
    expect(JSON.stringify(get('hubs/hub-a'))).toBe(before)
  })
  it('keeps the previous live page as a baseline the first time, and restores any version into the draft', async () => {
    set('hubs/hub-a/pages/rules', { title: 'Old rules', subtitle: '', banner: '', n: 1, blocks: [{ id: 'o1', type: 'section', title: 'Old' }], updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'x@x.test' })
    const a = await actions()
    await a.savePageDraftAction('hub-a', 'rules', rules(), 0)
    await a.publishPageAction('hub-a', 'rules', 1)
    const hist = Object.entries(get('hubs/hub-a/pageHistory/rules') as Record<string, { action: string; title: string }>)
    expect(hist.map(([, h]) => h.action).sort()).toEqual(['baseline', 'publish'])
    const baseline = hist.find(([, h]) => h.action === 'baseline')!
    expect((await a.restorePageVersionAction('hub-a', 'rules', baseline[0], 0)).version).toBe(1)
    expect(draft('hub-a', 'rules')).toMatchObject({ title: 'Old rules', version: 1 })
    expect(live('hub-a', 'rules')).toMatchObject({ title: 'Rules' }) // restore alone changes nothing live
    await a.publishPageAction('hub-a', 'rules', 1)
    expect(live('hub-a', 'rules')).toMatchObject({ title: 'Old rules' })
  })
  it('refuses a version that does not exist or an id that tries to leave the page history', async () => {
    const a = await actions()
    set('hubs/hub-b/pageHistory/rules/h9', { title: 'B secret', n: 0, at: 'x', by: 'y', action: 'publish' })
    for (const id of ['nope', '../../hub-b/pageHistory/rules/h9', 'a/b', '', 'x'.repeat(50)]) expect((await a.restorePageVersionAction('hub-a', 'rules', id, 0)).error).toMatch(/does not exist/)
    expect(draft('hub-a', 'rules')).toBeNull()
  })
  it('refuses to publish when the live page changed after the draft was started', async () => {
    const a = await actions()
    set('hubs/hub-a/pages/rules', { title: 'v1', n: 0, updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'x' })
    await a.savePageDraftAction('hub-a', 'rules', rules(), 0)
    set('hubs/hub-a/pages/rules', { title: 'changed elsewhere', n: 0, updatedAt: '2026-02-02T00:00:00.000Z', updatedBy: 'someone' })
    const r = await a.publishPageAction('hub-a', 'rules', 1)
    expect(r).toMatchObject({ conflict: true })
    expect(live('hub-a', 'rules')).toMatchObject({ title: 'changed elsewhere' })
  })
  it('re-checks the draft at publish: a tampered draft with an unsafe link never goes live', async () => {
    const a = await actions()
    set('hubs/hub-a/pagesDraft/reservations', { title: 'x', n: 1, blocks: [{ id: 'b', type: 'contact', label: 'Book', kind: 'link', value: 'javascript:alert(1)' }], version: 1, baseAt: '', updatedAt: 'x', updatedBy: 'x' })
    await a.publishPageAction('hub-a', 'reservations', 1)
    expect(JSON.stringify(live('hub-a', 'reservations'))).not.toContain('javascript')
  })
  it('discard removes only the draft and records it', async () => {
    const a = await actions()
    await a.savePageDraftAction('hub-a', 'rules', rules(), 0)
    expect((await a.discardPageDraftAction('hub-a', 'rules', 1)).success).toMatch(/discarded/)
    expect(draft('hub-a', 'rules')).toBeNull()
    expect(live('hub-a', 'rules')).toBeNull()
    expect(JSON.stringify(get('hubs/hub-a/audit'))).toContain('page.discard')
  })
  it('an emptied page can be published and reads back as empty', async () => {
    const a = await actions()
    await a.savePageDraftAction('hub-a', 'rules', { title: '', subtitle: '', banner: '', blocks: [] }, 0)
    expect((await a.publishPageAction('hub-a', 'rules', 1)).success).toBeTruthy()
    expect(live('hub-a', 'rules')).toMatchObject({ n: 0 })
  })
})

describe('pages: a page with a layout', () => {
  const layout = { slots: [
    { id: 'shead', type: 'header', label: 'Title', required: true, maxRows: 10, rowKind: 'rule' },
    { id: 'slist', type: 'list', label: 'Rules', required: true, maxRows: 2, rowKind: 'rule' },
    { id: 'sbtn', type: 'button', label: 'Book', required: false, maxRows: 10, rowKind: 'rule' },
  ] }
  const menu = [{ id: 'c_patch01', label: 'Patch', icon: 'info', kind: 'page', template: layout }]
  const tree = () => ({ hubs_meta: { 'hub-a': { name: 'A' }, 'hub-b': { name: 'B' } }, hubs: { 'hub-a': { settings: { menuItems: menu } } } })
  const typed = { shead: { title: 'Pumpkin Patch' }, slist: { rows: [{ title: 'No pets', body: 'Sorry' }, { title: 'Quiet', body: '10pm' }, { title: 'Third', body: 'cut' }] }, evil: { title: 'x' } }

  it('lets a manager save values, builds the page from the layout and publishes it with the values', async () => {
    state.tree = tree()
    state.session = manager
    const a = await actions()
    expect((await a.savePageValuesAction('hub-a', 'c_patch01', typed, 0)).version).toBe(1)
    const d = draft('hub-a', 'c_patch01') as Record<string, unknown>
    expect((d.blocks as unknown[]).length).toBe(2)
    expect(Object.keys(d.values as object)).toEqual(['shead', 'slist'])
    expect((await a.publishPageAction('hub-a', 'c_patch01', 1)).success).toBeTruthy()
    expect(live('hub-a', 'c_patch01')).toMatchObject({ title: 'Pumpkin Patch', n: 2 })
    expect((live('hub-a', 'c_patch01') as { values: unknown }).values).toBeTruthy()
  })
  it('refuses to publish while a required field is empty, and names it', async () => {
    state.tree = tree()
    state.session = manager
    const a = await actions()
    await a.savePageValuesAction('hub-a', 'c_patch01', { shead: { title: 'Only a title' } }, 0)
    expect((await a.publishPageAction('hub-a', 'c_patch01', 1)).error).toMatch(/Fill in Rules/)
    expect(live('hub-a', 'c_patch01')).toBeNull()
  })
  it('refuses unsafe values the same way the block editor does', async () => {
    state.tree = tree()
    state.session = manager
    const a = await actions()
    expect((await a.savePageValuesAction('hub-a', 'c_patch01', { ...typed, sbtn: { value: 'javascript:alert(1)' } }, 0)).error).toMatch(/https/)
    expect(draft('hub-a', 'c_patch01')).toBeNull()
  })
  it('does not let free-form blocks bypass the layout, and does not take values for a page without one', async () => {
    state.tree = tree()
    state.session = manager
    const a = await actions()
    expect((await a.savePageDraftAction('hub-a', 'c_patch01', rules(), 0)).error).toMatch(/layout/)
    expect((await a.savePageValuesAction('hub-a', 'rules', typed, 0)).error).toMatch(/no layout/)
    expect(draft('hub-a', 'c_patch01')).toBeNull()
  })
  it('keeps managers out of other hubs and takes the layout from published settings, not from the request', async () => {
    state.tree = tree()
    state.session = manager
    const a = await actions()
    expect((await a.savePageValuesAction('hub-b', 'c_patch01', typed, 0)).error).toBeTruthy()
    state.tree = { ...tree(), hubs: { 'hub-a': { settings: { menuItems: menu }, settingsDraft: { data: { menuItems: [{ ...menu[0], template: { slots: [] } }] } } } } }
    expect((await a.savePageValuesAction('hub-a', 'c_patch01', typed, 0)).success).toBeTruthy()
  })
  it('rebuilds the page from the current layout when publishing, and restores values from history', async () => {
    state.tree = tree()
    state.session = manager
    const a = await actions()
    await a.savePageValuesAction('hub-a', 'c_patch01', typed, 0)
    await a.publishPageAction('hub-a', 'c_patch01', 1)
    // The Super Admin later makes the button required: the old draft must not publish.
    const stricter = { slots: layout.slots.map((s) => (s.id === 'sbtn' ? { ...s, required: true } : s)) }
    set('hubs/hub-a/settings/menuItems', [{ ...menu[0], template: stricter }])
    await a.savePageValuesAction('hub-a', 'c_patch01', { ...typed, shead: { title: 'Changed' } }, 0)
    expect((await a.publishPageAction('hub-a', 'c_patch01', 1)).error).toMatch(/Fill in Book/)
    const hist = get('hubs/hub-a/pageHistory/c_patch01') as Record<string, { values?: unknown; action: string }>
    const id = Object.keys(hist).find((k) => hist[k].action === 'publish') as string
    expect((await a.restorePageVersionAction('hub-a', 'c_patch01', id, 1)).version).toBe(2)
    expect((draft('hub-a', 'c_patch01') as { values: Record<string, unknown> }).values.shead).toEqual({ title: 'Pumpkin Patch', subtitle: '' })
  })
})
