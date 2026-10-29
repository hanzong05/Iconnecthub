import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS worker modules without types
import orig from '../security/review/delete-user-worker.original.js'
// @ts-expect-error plain JS worker modules without types
import proposed from '../security/review/delete-user-worker.proposed.js'

type Worker = { fetch(req: Request, env: Record<string, string>): Promise<Response> }
const b64u = (b: ArrayBuffer | string) => Buffer.from(typeof b === 'string' ? b : new Uint8Array(b)).toString('base64url')
const DB = 'https://db.test'
let tokenKey: CryptoKeyPair
let jwk: JsonWebKey
let saPem: string
let db: Record<string, any>
let calls: { url: string; method: string; body?: any }[]
const env = (): Record<string, string> => ({ FIREBASE_PROJECT_ID: 'proj', FIREBASE_CLIENT_EMAIL: 'sa@proj.test', FIREBASE_PRIVATE_KEY: saPem, DATABASE_URL: DB })

async function idToken(sub: string, over: Record<string, unknown> = {}, alg = 'RS256') {
  const h = b64u(JSON.stringify({ alg, kid: 'k1', typ: 'JWT' }))
  const p = b64u(JSON.stringify({ sub, aud: 'proj', iss: 'https://securetoken.google.com/proj', exp: Math.floor(Date.now() / 1000) + 600, ...over }))
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', tokenKey.privateKey, new TextEncoder().encode(`${h}.${p}`))
  return `${h}.${p}.${b64u(sig)}`
}
const post = (w: Worker, body: unknown) => w.fetch(new Request('https://w.test/', { method: 'POST', body: JSON.stringify(body) }), env())

beforeAll(async () => {
  const gen = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>
  tokenKey = await gen()
  jwk = { ...(await crypto.subtle.exportKey('jwk', tokenKey.publicKey)), kid: 'k1', alg: 'RS256' } as JsonWebKey
  const sa = await gen()
  saPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', sa.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----\n`
})

afterEach(() => vi.unstubAllGlobals())

function fakeNetwork(seed: Record<string, any>) {
  db = structuredClone(seed)
  calls = []
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : undefined
    calls.push({ url, method, body })
    const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 })
    if (url.includes('securetoken@system')) return ok({ keys: [jwk] })
    if (url.includes('oauth2.googleapis.com')) return ok({ access_token: 'sa-token' })
    if (url.includes('accounts:delete') || url.includes('accounts:update')) return ok({})
    if (url.startsWith(DB)) {
      const path = decodeURIComponent(new URL(url).pathname).replace(/^\//, '').replace(/\.json$/, '')
      if (method === 'GET') return ok(db[path] ?? null)
      if (method === 'DELETE') { delete db[path]; return ok(null) }
      if (method === 'PUT') { db[path] = body; return ok(body) }
    }
    return new Response('{}', { status: 404 })
  })
}
const seed = {
  'users/boss': { role: 'super' },
  'users/smA': { role: 'super_manager', hubId: 'hub-a' },
  'users/mgrA': { role: 'manager', hubId: 'hub-a' },
  'users/mgrB': { role: 'manager', hubId: 'hub-b' },
  'users/off': { role: 'super', active: false },
}
const deleted = () => calls.some((c) => c.url.includes('accounts:delete'))
const pwSet = () => calls.some((c) => c.url.includes('accounts:update'))

describe('delete-user worker — F-01 regression (original is vulnerable, proposed is not)', () => {
  it('ORIGINAL: a signed-in account with no profile can delete a user (the vulnerability)', async () => {
    fakeNetwork(seed)
    const res = await post(orig as Worker, { uid: 'mgrA', idToken: await idToken('stranger') })
    expect(res.status).toBe(200)
    expect(deleted()).toBe(true)
  })
  it('ORIGINAL: a profile-less account can reset anyone’s password to a 6-character password', async () => {
    fakeNetwork(seed)
    const res = await post(orig as Worker, { uid: 'boss', action: 'updatePassword', newPassword: 'abcdef', idToken: await idToken('stranger') })
    expect(res.status).toBe(200)
    expect(pwSet()).toBe(true)
  })

  const w = proposed as Worker
  it('refuses a signed-in account with no profile (delete and password)', async () => {
    fakeNetwork(seed)
    expect((await post(w, { uid: 'mgrA', idToken: await idToken('stranger') })).status).toBe(403)
    expect((await post(w, { uid: 'boss', action: 'updatePassword', newPassword: 'a-long-password', idToken: await idToken('stranger') })).status).toBe(403)
    expect(deleted() || pwSet()).toBe(false)
    expect(db['users/mgrA']).toBeDefined()
  })
  it('refuses managers', async () => {
    fakeNetwork(seed)
    expect((await post(w, { uid: 'mgrB', idToken: await idToken('mgrA') })).status).toBe(403)
    expect(deleted()).toBe(false)
  })
  it('refuses a deactivated super admin', async () => {
    fakeNetwork(seed)
    expect((await post(w, { uid: 'mgrA', idToken: await idToken('off') })).status).toBe(403)
    expect(deleted()).toBe(false)
  })
  it('super admin can delete a user and the change is audited', async () => {
    fakeNetwork(seed)
    expect((await post(w, { uid: 'mgrB', idToken: await idToken('boss') })).status).toBe(200)
    expect(deleted()).toBe(true)
    expect(db['users/mgrB']).toBeUndefined()
    const auditCall = calls.find((c) => c.method === 'PUT' && c.url.includes('/audit/'))
    expect(auditCall?.body).toMatchObject({ by: 'boss', action: 'user.delete' })
  })
  it('copes with a database address that has a trailing space or line break (the live "Invalid URL" failure)', async () => {
    for (const bad of [`${DB} `, `${DB}\n`, `${DB}/`]) {
      fakeNetwork(seed)
      const res = await w.fetch(new Request('https://w.test/', { method: 'POST', body: JSON.stringify({ uid: 'mgrB', idToken: await idToken('boss') }) }), { ...env(), DATABASE_URL: bad })
      expect(res.status, JSON.stringify(bad)).toBe(200)
      expect(deleted()).toBe(true)
    }
  })
  it('copes with a project id that has a trailing space or line break (otherwise every sign-in is refused)', async () => {
    fakeNetwork(seed)
    const res = await w.fetch(new Request('https://w.test/', { method: 'POST', body: JSON.stringify({ uid: 'mgrB', idToken: await idToken('boss') }) }), { ...env(), FIREBASE_PROJECT_ID: 'proj \n' })
    expect(res.status).toBe(200)
    expect(deleted()).toBe(true)
  })
  it('super admin cannot delete themselves', async () => {
    fakeNetwork(seed)
    expect((await post(w, { uid: 'boss', idToken: await idToken('boss') })).status).toBe(400)
    expect(deleted()).toBe(false)
  })
  it('super manager manages own hub only, and never a super admin', async () => {
    fakeNetwork(seed)
    expect((await post(w, { uid: 'mgrB', idToken: await idToken('smA') })).status).toBe(403)
    expect((await post(w, { uid: 'boss', idToken: await idToken('smA') })).status).toBe(403)
    expect(deleted()).toBe(false)
    expect((await post(w, { uid: 'mgrA', idToken: await idToken('smA') })).status).toBe(200)
    expect(deleted()).toBe(true)
  })
  it('password changes need 10 to 128 characters', async () => {
    fakeNetwork(seed)
    const t = await idToken('boss')
    expect((await post(w, { uid: 'mgrA', action: 'updatePassword', newPassword: 'short-pw', idToken: t })).status).toBe(400)
    expect((await post(w, { uid: 'mgrA', action: 'updatePassword', newPassword: 'x'.repeat(129), idToken: t })).status).toBe(400)
    expect((await post(w, { uid: 'mgrA', action: 'updatePassword', newPassword: 'a-long-password', idToken: t })).status).toBe(200)
  })
  it('rejects ids that could reach other database paths, and unknown actions', async () => {
    fakeNetwork(seed)
    const t = await idToken('boss')
    for (const uid of ['../hubs_meta', 'a/b', 'x?y', '', 'a'.repeat(129)]) expect((await post(w, { uid, idToken: t })).status).toBe(400)
    expect((await post(w, { uid: 'mgrA', action: 'wipe', idToken: t })).status).toBe(400)
    expect(deleted()).toBe(false)
  })
  it('rejects bad tokens: wrong project, expired, wrong algorithm, garbage', async () => {
    fakeNetwork(seed)
    for (const t of [await idToken('boss', { aud: 'other' }), await idToken('boss', { exp: 1 }), await idToken('boss', {}, 'none'), 'a.b.c', 'nope']) {
      const res = await post(w, { uid: 'mgrA', idToken: t })
      expect([401, 500]).toContain(res.status)
    }
    expect(deleted()).toBe(false)
  })
  it('owner break-glass works only for the configured uid and only when set', async () => {
    fakeNetwork(seed)
    const t = await idToken('owner')
    expect((await post(w, { uid: 'mgrA', idToken: t })).status).toBe(403)
    const res = await w.fetch(new Request('https://w.test/', { method: 'POST', body: JSON.stringify({ uid: 'mgrA', idToken: t }) }), { ...env(), OWNER_UID: 'owner' })
    expect(res.status).toBe(200)
  })
  it('does not echo internal errors to the caller', async () => {
    fakeNetwork(seed)
    const res = await w.fetch(new Request('https://w.test/', { method: 'POST', body: JSON.stringify({ uid: 'mgrA', idToken: await idToken('boss') }) }), { ...env(), FIREBASE_PRIVATE_KEY: 'broken' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toMatch(/BEGIN|private|atob|decode/i)
  })
})

describe('delete-user worker — fails closed when the database cannot be read', () => {
  it('refuses and deletes nothing when the caller’s profile read fails', async () => {
    fakeNetwork(seed)
    const real = globalThis.fetch
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      if (String(input).startsWith(DB) && (init?.method ?? 'GET') === 'GET') return new Response('{}', { status: 503 })
      return real(input, init)
    })
    const res = await post(proposed as Worker, { uid: 'mgrA', idToken: await idToken('boss'), action: 'delete' })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(calls.some((c) => c.url.includes('accounts:delete'))).toBe(false)
  })
  it('answers a token with a missing key id with 401 instead of an error', async () => {
    fakeNetwork(seed)
    const h = b64u(JSON.stringify({ alg: 'RS256' }))
    const p = b64u(JSON.stringify({ sub: 'boss', aud: 'proj', iss: 'https://securetoken.google.com/proj', exp: Math.floor(Date.now() / 1000) + 600 }))
    const res = await post(proposed as Worker, { uid: 'mgrA', idToken: `${h}.${p}.AAAA` })
    expect(res.status).toBe(401)
  })
})
