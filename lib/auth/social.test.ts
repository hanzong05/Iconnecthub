import { createVerify, generateKeyPairSync } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { path: string; body: Record<string, unknown> }[] = []
const reply = vi.hoisted(() => ({ idp: null as null | { status: number; json: unknown }, lookup: [] as { providerId: string; email?: string }[], profile: null as unknown }))

beforeEach(() => {
  process.env.AUTH_SECRET = 'x'.repeat(40)
  process.env.FIREBASE_API_KEY = 'k'
  process.env.FIREBASE_DATABASE_URL = 'https://db.test'
  process.env.PASSWORD_RESET_WORKER_URL = 'https://w.test'
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST
  delete process.env.NEXT_PUBLIC_SITE_URL
  calls.length = 0
  reply.idp = null
  reply.lookup = []
  reply.profile = null
  vi.stubGlobal('fetch', async (input: string, init?: { body?: string }) => {
    const u = new URL(input)
    const res = (status: number, v: unknown) => ({ ok: status < 400, status, json: async () => v })
    if (u.hostname === 'identitytoolkit.googleapis.com') {
      const path = u.pathname.replace('/v1/', '')
      calls.push({ path, body: init?.body ? JSON.parse(init.body) : {} })
      if (path === 'accounts:signInWithIdp') return res(reply.idp?.status ?? 200, reply.idp?.json ?? {})
      if (path === 'accounts:lookup') return res(200, { users: [{ providerUserInfo: reply.lookup }] })
      return res(200, {})
    }
    return res(200, reply.profile) // the Realtime Database profile
  })
})

const creds = () => import('./credentials')

describe('signing in with Google or Apple never signs anyone up', () => {
  it('deletes a brand-new account Firebase just created and refuses the sign-in', async () => {
    reply.idp = { status: 200, json: { localId: 'stranger', idToken: 'STRANGER_TOKEN', refreshToken: 'r', isNewUser: true, email: 'who@gmail.com' } }
    const { signInWithProvider } = await creds()
    const r = await signInWithProvider('google.com', 'GOOGLE_ID_TOKEN', 'https://admin.test/cb')
    expect(r).toEqual({ ok: false, reason: 'not_linked' })
    expect(calls.map((c) => c.path)).toEqual(['accounts:signInWithIdp', 'accounts:delete'])
    expect(calls[1].body).toEqual({ idToken: 'STRANGER_TOKEN' })
  })

  it('signs in someone who bound the provider, and keeps the account email rather than the Gmail address', async () => {
    reply.idp = { status: 200, json: { localId: 'u1', idToken: 'T', refreshToken: 'R', isNewUser: false, email: 'personal@gmail.com' } }
    reply.profile = { email: 'work@hub.test', name: 'Tess', role: 'manager', hubId: 'h1', hubName: 'Hub One' }
    const { signInWithProvider } = await creds()
    const r = await signInWithProvider('google.com', 'GOOGLE_ID_TOKEN', 'https://admin.test/cb')
    expect(r).toMatchObject({ ok: true, refreshToken: 'R', user: { id: 'u1', email: 'work@hub.test', role: 'manager', hubId: 'h1' } })
    expect(calls).toHaveLength(1)
    expect(calls[0].body.postBody).toBe('id_token=GOOGLE_ID_TOKEN&providerId=google.com')
  })

  it('refuses when Firebase asks for account confirmation, and reports a disabled account', async () => {
    const { signInWithProvider } = await creds()
    reply.idp = { status: 200, json: { needConfirmation: true, email: 'a@b.test' } }
    expect(await signInWithProvider('apple.com', 't', 'https://admin.test/cb')).toEqual({ ok: false, reason: 'not_linked' })
    reply.idp = { status: 400, json: { error: { message: 'USER_DISABLED' } } }
    expect(await signInWithProvider('apple.com', 't', 'https://admin.test/cb')).toEqual({ ok: false, reason: 'disabled' })
  })
})

describe('binding and removing a provider', () => {
  it('links to the signed-in account using their own token', async () => {
    reply.idp = { status: 200, json: {} }
    const { linkProvider } = await creds()
    expect(await linkProvider('MY_TOKEN', 'apple.com', 'APPLE_ID', 'https://admin.test/cb')).toEqual({ ok: true })
    expect(calls[0].body).toMatchObject({ idToken: 'MY_TOKEN', postBody: 'id_token=APPLE_ID&providerId=apple.com' })
  })

  it('says so when the Google or Apple ID already belongs to another account', async () => {
    reply.idp = { status: 400, json: { error: { message: 'FEDERATED_USER_ID_ALREADY_LINKED' } } }
    const { linkProvider } = await creds()
    expect(await linkProvider('T', 'google.com', 'G', 'https://admin.test/cb')).toEqual({ ok: false, reason: 'already_linked' })
  })

  it('will not remove the last way to sign in, but removes one when another remains', async () => {
    const { unlinkProvider } = await creds()
    reply.lookup = [{ providerId: 'google.com' }]
    expect(await unlinkProvider('T', 'google.com')).toEqual({ ok: false, reason: 'last_method' })
    expect(calls.some((c) => c.path === 'accounts:update')).toBe(false)

    reply.lookup = [{ providerId: 'password' }, { providerId: 'google.com' }]
    expect(await unlinkProvider('T', 'google.com')).toEqual({ ok: true })
    expect(calls.find((c) => c.path === 'accounts:update')?.body).toEqual({ idToken: 'T', deleteProvider: ['google.com'] })

    reply.lookup = [{ providerId: 'password' }]
    expect(await unlinkProvider('T', 'apple.com')).toEqual({ ok: false, reason: 'not_linked' })
  })
})

describe('oauth state and secrets', () => {
  const google = () => {
    process.env.GOOGLE_CLIENT_ID = 'gid'
    process.env.GOOGLE_CLIENT_SECRET = 'gsecret'
  }

  it('is off until every value for the provider is set', async () => {
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    const { beginFlow, enabledProviders } = await import('./oauth')
    expect(enabledProviders()).not.toContain('google')
    expect(beginFlow('google', 'login', '', 'https://admin.test')).toBeNull()
  })

  it('builds a Google address with PKCE and accepts only the matching, fresh state', async () => {
    google()
    const { beginFlow, readState } = await import('./oauth')
    const flow = beginFlow('google', 'link', 'uid1', 'https://admin.test')!
    const url = new URL(flow.url)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('redirect_uri')).toBe('https://admin.test/api/auth/oauth/google/callback')
    const state = url.searchParams.get('state')!
    expect(readState(flow.cookie, 'google', state)).toMatchObject({ m: 'link', u: 'uid1' })
    expect(readState(flow.cookie, 'google', 'forged')).toBeNull()
    expect(readState(flow.cookie, 'apple', state)).toBeNull() // cookie from another provider's flow
    expect(readState(flow.cookie, 'google', null)).toBeNull()
    expect(readState('garbage', 'google', state)).toBeNull()
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 11 * 60_000)
    expect(readState(flow.cookie, 'google', state)).toBeNull() // expired
    vi.useRealTimers()
  })

  it('signs the Apple client secret so Apple can verify it', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const { appleClientSecret } = await import('./oauth')
    const jwt = appleClientSecret({ clientId: 'com.example.web', apple: { teamId: 'TEAM', keyId: 'KEY', privateKey: pem } }, 1_000)
    const [h, b, s] = jwt.split('.')
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toMatchObject({ alg: 'ES256', kid: 'KEY' })
    expect(JSON.parse(Buffer.from(b, 'base64url').toString())).toMatchObject({ iss: 'TEAM', sub: 'com.example.web', aud: 'https://appleid.apple.com', exp: 1_300 })
    const ok = createVerify('SHA256').update(`${h}.${b}`).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))
    expect(ok).toBe(true)
  })
})
