import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS worker module without types
import proposed from '../security/review/push-notification-worker.proposed.js'

type Worker = { fetch(req: Request, env: Record<string, string>): Promise<Response> }
const b64u = (b: ArrayBuffer | string) => Buffer.from(typeof b === 'string' ? b : new Uint8Array(b)).toString('base64url')
const DB = 'https://db.test'
const w = proposed as Worker
let tokenKey: CryptoKeyPair, jwk: JsonWebKey, saPem: string
let db: Record<string, unknown>
let sent: string[]
let failRead: RegExp | null
const env = (extra: Record<string, string> = {}): Record<string, string> => ({ FIREBASE_PROJECT_ID: 'proj', FIREBASE_CLIENT_EMAIL: 'sa@proj.test', FIREBASE_PRIVATE_KEY: saPem, DATABASE_URL: DB, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', ...extra })

async function idToken(sub: string, over: { header?: object; payload?: object; sign?: boolean } = {}) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', ...over.header }))
  const p = b64u(JSON.stringify({ sub, aud: 'proj', iss: 'https://securetoken.google.com/proj', exp: Math.floor(Date.now() / 1000) + 600, ...over.payload }))
  const sig = over.sign === false ? 'AAAA' : b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', tokenKey.privateKey, new TextEncoder().encode(`${h}.${p}`)))
  return `${h}.${p}.${sig}`
}
const call = (path: string, raw: string, e = env(), headers: Record<string, string> = {}) => w.fetch(new Request(`https://w.test${path}`, { method: 'POST', body: raw, headers }), e)
const send = async (path: string, uid: string, body: Record<string, unknown>, e = env()) => call(path, JSON.stringify({ ...body, idToken: await idToken(uid) }), e)

beforeAll(async () => {
  const gen = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>
  tokenKey = await gen()
  jwk = { ...(await crypto.subtle.exportKey('jwk', tokenKey.publicKey)), kid: 'k1', alg: 'RS256' } as JsonWebKey
  const sa = await gen()
  saPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', sa.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----\n`
})
afterEach(() => vi.unstubAllGlobals())

function net(seed: Record<string, unknown> = {}) {
  db = {
    'users/mgrA': { role: 'manager', hubId: 'hub-a' },
    'users/guest1': { role: 'guest', hubId: 'hub-a' },
    'users/boss': { role: 'super' },
    'hubs_meta/hub-a/name': 'A',
    'hubs/hub-a/guests': { t1: { fcmToken: { token: 'fcm-1' } } },
    'hubs/hub-a/fcmTokens': {},
    ...seed,
  }
  sent = []
  failRead = null
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = String(input)
    const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 })
    if (url.includes('securetoken@system')) return ok({ keys: [jwk] })
    if (url.includes('oauth2.googleapis.com')) return ok({ access_token: 'sa' })
    if (url.includes('fcm.googleapis.com')) { sent.push(JSON.parse(String(init?.body)).message.token); return ok({ name: 'm' }) }
    if (url.startsWith(DB)) {
      const path = decodeURIComponent(new URL(url).pathname).replace(/^\//, '').replace(/\.json$/, '')
      if (failRead?.test(path)) return new Response('{}', { status: 503 })
      return ok(db[path] ?? null)
    }
    return new Response('{}', { status: 404 })
  })
}
const msg = { hubId: 'hub-a', title: 'Hi', body: 'There' }

describe('push worker fails closed', () => {
  it('sends nothing when the hub’s notification switch cannot be read', async () => {
    net()
    failRead = /settings\/guestNotifications/
    const res = await send('/', 'mgrA', msg)
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(sent).toEqual([])
  })
  it('sends nothing when the caller’s profile cannot be read', async () => {
    net()
    failRead = /^users\//
    const res = await send('/', 'mgrA', msg)
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(sent).toEqual([])
  })
  it('still honours an explicit switch-off, and still sends when the switch was never set', async () => {
    net({ 'hubs/hub-a/settings/guestNotifications': false })
    expect((await send('/', 'mgrA', msg)).status).toBe(403)
    expect(sent).toEqual([])
    net()
    expect((await send('/', 'mgrA', msg)).status).toBe(200)
    expect(sent).toEqual(['fcm-1'])
  })
  it('refuses a hub that does not exist, even for a super admin', async () => {
    net()
    const res = await send('/', 'boss', { ...msg, hubId: 'made-up' })
    expect(res.status).toBe(404)
    expect(sent).toEqual([])
  })
  it('refuses hub ids that are paths, not ids', async () => {
    net()
    for (const hubId of ['hub-a/guests', '../users', 'a b', 'x'.repeat(200)]) expect((await send('/', 'boss', { ...msg, hubId })).status).toBe(400)
    expect(sent).toEqual([])
  })
  it('lets a guest account, a profile-less account and a role-less profile send to nothing', async () => {
    for (const uid of ['guest1', 'nobody']) {
      net({ 'users/roleless': {} })
      expect((await send('/', uid, msg)).status).toBe(403)
    }
    net({ 'users/roleless': {} })
    expect((await send('/', 'roleless', msg)).status).toBe(403)
    expect(sent).toEqual([])
  })
  it('answers a bad token with 401 and never throws: garbage, wrong algorithm, bad signature, expired, wrong project', async () => {
    net()
    const bad = [
      'not-a-token',
      await idToken('mgrA', { header: { alg: 'none' } }),
      await idToken('mgrA', { sign: false }),
      await idToken('mgrA', { payload: { exp: 1 } }),
      await idToken('mgrA', { payload: { aud: 'other' } }),
      await idToken('mgrA', { payload: { iat: Math.floor(Date.now() / 1000) + 99999 } }),
    ]
    for (const t of bad) expect((await call('/', JSON.stringify({ ...msg, idToken: t }))).status, t.slice(0, 20)).toBe(401)
    expect((await call('/', JSON.stringify({ ...msg, idToken: { a: 1 } }))).status).toBe(401)
    expect(sent).toEqual([])
  })
  it('answers unreadable JSON with 400, not a server error', async () => {
    net()
    expect((await call('/', '{not json')).status).toBe(400)
  })
  it('refuses to send at all when its own configuration is missing', async () => {
    net()
    expect((await send('/', 'mgrA', msg, env({ DATABASE_URL: '' }))).status).toBe(503)
    expect((await send('/', 'mgrA', msg, env({ FIREBASE_PRIVATE_KEY: '' }))).status).toBe(503)
    expect(sent).toEqual([])
  })
  it('test sends never touch guests: no device saved means a refusal, and other roles are refused', async () => {
    net()
    expect((await send('/send-test', 'mgrA', msg)).status).toBe(409)
    expect((await send('/send-test', 'guest1', msg)).status).toBe(403)
    expect(sent).toEqual([])
  })
  it('a failed test send tells the caller it failed without echoing provider or crypto error text', async () => {
    net({ 'users/mgrA': { role: 'manager', hubId: 'hub-a', webPushSub: { endpoint: 'https://push.test/secret-endpoint-abc', p256dh: 'not-a-key', auth: 'x' } } })
    const res = await send('/send-test', 'mgrA', msg)
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ error: 'The test could not be delivered to your device.' })
    expect(text).not.toMatch(/secret-endpoint|atob|decode|base64|key/i)
    expect(sent).toEqual([])
  })
  it('copes with a database address that has a trailing space, line break or slash', async () => {
    for (const bad of [`${DB} `, `${DB}\n`, `${DB}/`, ` ${DB}\r\n`]) {
      net()
      const res = await send('/', 'mgrA', msg, env({ DATABASE_URL: bad }))
      expect(res.status, JSON.stringify(bad)).toBe(200)
      expect(sent).toEqual(['fcm-1'])
    }
  })
  it('only answers browsers from the listed origins', async () => {
    net()
    const e = env({ ALLOWED_ORIGIN: 'https://admin.test, https://other.test' })
    const good = await w.fetch(new Request('https://w.test/vapid-public-key', { headers: { Origin: 'https://admin.test' } }), e)
    expect(good.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.test')
    const evil = await w.fetch(new Request('https://w.test/vapid-public-key', { headers: { Origin: 'https://evil.test' } }), e)
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
