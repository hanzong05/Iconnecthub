import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  session: null as null | { sub: string },
  started: [] as unknown[],
  signIn: { ok: false, reason: 'not_linked' } as unknown,
  link: { ok: true } as unknown,
}))

vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4' }) }))
vi.mock('@/lib/auth/session', () => ({
  getSession: async () => state.session,
  getFirebaseToken: async () => 'MY_TOKEN',
  startSession: async (...a: unknown[]) => void state.started.push(a),
}))
vi.mock('@/lib/auth/credentials', () => ({ signInWithProvider: async () => state.signIn, linkProvider: async () => state.link }))

beforeEach(() => {
  process.env.AUTH_SECRET = 'x'.repeat(40)
  process.env.FIREBASE_API_KEY = 'k'
  process.env.FIREBASE_DATABASE_URL = 'https://db.test'
  process.env.PASSWORD_RESET_WORKER_URL = 'https://w.test'
  process.env.GOOGLE_CLIENT_ID = 'gid'
  process.env.GOOGLE_CLIENT_SECRET = 'gsecret'
  delete process.env.NEXT_PUBLIC_SITE_URL
  state.session = null
  state.started = []
  state.signIn = { ok: false, reason: 'not_linked' }
  state.link = { ok: true }
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({ id_token: 'GOOGLE_ID' }) }))
})

async function run(mode: 'login' | 'link', opts: { uid?: string; echoState?: string; code?: string | null } = {}) {
  const { beginFlow } = await import('@/lib/auth/oauth')
  const { GET } = await import('./[provider]/callback/route')
  const flow = beginFlow('google', mode, opts.uid ?? '', 'https://admin.test')!
  const st = opts.echoState ?? new URL(flow.url).searchParams.get('state')!
  const qs = new URLSearchParams({ state: st })
  if (opts.code !== null) qs.set('code', opts.code ?? 'CODE')
  const req = new NextRequest(`https://admin.test/api/auth/oauth/google/callback?${qs}`, { headers: { cookie: `ich_oauth=${flow.cookie}` } })
  const res = await GET(req, { params: Promise.resolve({ provider: 'google' }) })
  return { res, location: res.headers.get('location') ?? '' }
}

describe('Google / Apple callback', () => {
  it('refuses a callback whose state does not match the cookie, and signs nobody in', async () => {
    state.signIn = { ok: true, user: { id: 'u' }, refreshToken: 'r' }
    const { location } = await run('login', { echoState: 'forged' })
    expect(location).toBe('https://admin.test/?oauth=cancelled')
    expect(state.started).toHaveLength(0)
  })

  it('does not start a session for an identity that was never bound (no sign-up)', async () => {
    const { location } = await run('login')
    expect(location).toBe('https://admin.test/?oauth=not_linked')
    expect(state.started).toHaveLength(0)
  })

  it('starts a session for a bound identity', async () => {
    state.signIn = { ok: true, user: { id: 'u1' }, refreshToken: 'r' }
    const { location } = await run('login')
    expect(location).toBe('https://admin.test/dashboard')
    expect(state.started).toHaveLength(1)
  })

  it('binds only for the same signed-in user who started it', async () => {
    state.session = { sub: 'someone-else' }
    expect((await run('link', { uid: 'uid1' })).location).toBe('https://admin.test/')
    state.session = null
    expect((await run('link', { uid: 'uid1' })).location).toBe('https://admin.test/')
    state.session = { sub: 'uid1' }
    expect((await run('link', { uid: 'uid1' })).location).toBe('https://admin.test/dashboard/account?oauth=linked')
  })

  it('reports an identity already bound elsewhere, and a cancelled consent screen', async () => {
    state.session = { sub: 'uid1' }
    state.link = { ok: false, reason: 'already_linked' }
    expect((await run('link', { uid: 'uid1' })).location).toBe('https://admin.test/dashboard/account?oauth=already_linked')
    expect((await run('login', { code: null })).location).toBe('https://admin.test/?oauth=cancelled')
  })
})
