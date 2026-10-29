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

const actions = () => import('./hubs')

describe('adding a hub', () => {
  const meta = (id: string) => get(`hubs_meta/${id}`) as Record<string, unknown> | null

  it('creates the hub record, active, with who and when, and tidies the text', async () => {
    const { createHubAction } = await actions()
    const r = await createHubAction({ id: 'Test-Hub', name: '  Test   Campground ', location: ' Dells,  WI ' })
    expect(r).toMatchObject({ success: 'Hub "Test Campground" created.', id: 'test-hub' })
    expect(meta('test-hub')).toMatchObject({ name: 'Test Campground', location: 'Dells, WI', active: true, createdBy: 'boss@x.test' })
    expect(typeof meta('test-hub')?.createdAt).toBe('string')
    expect(state.writes).toEqual(['PUT hubs_meta/test-hub'])
  })

  it('leaves the location out when it is empty', async () => {
    const { createHubAction } = await actions()
    await createHubAction({ id: 'no-loc', name: 'No Location', location: '' })
    expect(meta('no-loc')).not.toHaveProperty('location')
  })

  it('never replaces an existing hub', async () => {
    const { createHubAction } = await actions()
    const r = await createHubAction({ id: 'hub-a', name: 'Takeover', location: '' })
    expect(r.error).toMatch(/already exists/)
    expect(meta('hub-a')).toEqual({ name: 'A' })
    expect(state.writes).toEqual([])
  })

  it('refuses bad ids, names and locations, writing nothing', async () => {
    const { createHubAction } = await actions()
    for (const id of ['', 'a', '-x', '_global', 'has space', 'a/b', '..', 'x'.repeat(49), 'hub.a', 'a#b']) {
      expect((await createHubAction({ id, name: 'N', location: '' })).error, `id "${id}"`).toMatch(/hub ID/)
    }
    expect((await createHubAction({ id: 'ok-id', name: '   ', location: '' })).error).toBe('Hub name is required.')
    expect((await createHubAction({ id: 'ok-id', name: '<b>x</b>', location: '' })).error).toMatch(/special characters/)
    expect((await createHubAction({ id: 'ok-id', name: 'N', location: 'a\u0007' })).error).toMatch(/special characters/)
    expect((await createHubAction({ id: 'ok-id', name: 'x'.repeat(121), location: '' })).error).toMatch(/under 120/)
    expect(state.writes).toEqual([])
  })

  it('is for the super admin only, and needs a session', async () => {
    const { createHubAction } = await actions()
    state.session = { role: 'manager', hubId: 'hub-a', email: 'm1@x.test' }
    expect((await createHubAction({ id: 'mine', name: 'Mine', location: '' })).error).toMatch(/super admin/i)
    state.session = null
    expect((await createHubAction({ id: 'mine', name: 'Mine', location: '' })).error).toMatch(/sign in/i)
    expect(state.writes).toEqual([])
    expect(meta('mine')).toBeNull()
  })
})
