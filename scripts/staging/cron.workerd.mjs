/**
 * Runs the PROPOSED push worker inside the real Cloudflare Workers runtime (workerd, via Miniflare) and fires its
 * scheduled() cron handler. All outbound calls (Firebase REST, Google OAuth, FCM, Resend) are answered by an in-process
 * fake, so nothing real is contacted and no real notification can be sent.
 *
 * What this proves: the cron entry point, ctx.waitUntil, WebCrypto service-account signing, ICU time zones and fetch
 * behave in workerd the way the logic tests assume. What it does NOT prove: Cloudflare's cron delivery, real Firebase
 * (ETag/permission behaviour), real FCM/Resend responses, or CPU/subrequest limits on the Cloudflare platform.
 *
 * Run (no project dependency is added):
 *   cd <scratch> && npm i miniflare@4
 *   MINIFLARE_PATH=<scratch>/node_modules/miniflare/dist/src/index.js node scripts/staging/cron.workerd.mjs
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const { Miniflare } = await import(process.env.MINIFLARE_PATH ? pathToFileURL(process.env.MINIFLARE_PATH).href : 'miniflare')

const script = readFileSync(new URL('../../security/review/push-notification-worker.proposed.js', import.meta.url), 'utf8')
const DB = 'https://db.stage.test'
let fails = 0, total = 0
const ok = (c, m) => { total++; if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m) }

const sa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', sa.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----\n`

class FakeDb {
  constructor(seed) { this.root = structuredClone(seed) }
  walk(p, create = false) { let c = this.root; for (const s of p.split('/').filter(Boolean)) { if (c === null || typeof c !== 'object') return undefined; if (c[s] === undefined) { if (!create) return undefined; c[s] = {} } c = c[s] } return c }
  get(p) { const v = this.walk(p); return v === undefined ? null : v }
  set(p, v) { const s = p.split('/').filter(Boolean); if (v === null) { const par = this.walk(s.slice(0, -1).join('/')); if (par && typeof par === 'object') delete par[s.at(-1)]; return } this.walk(s.slice(0, -1).join('/'), true)[s.at(-1)] = structuredClone(v) }
  etag(p) { const j = JSON.stringify(this.get(p)); return this.get(p) === null ? 'null_etag' : `e${j.length}-${[...j].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}` }
}

function stage(seed, opts = {}) {
  const s = { db: new FakeDb(seed), fcm: [], mail: [], fcmFail: 0, mailFail: false, crashOnFcm: false, latency: false, real: [] }
  let n = 0
  const handler = async (req) => {
    const url = new URL(req.url); const method = req.method
    if (s.latency) await new Promise((r) => setTimeout(r, (n++ * 7) % 4))
    const text = method === 'GET' || method === 'DELETE' ? '' : await req.text()
    const body = text && (req.headers.get('content-type') || '').includes('json') ? JSON.parse(text) : undefined
    const json = (v, status = 200, h = {}) => new Response(JSON.stringify(v), { status, headers: h })
    if (url.hostname === 'oauth2.googleapis.com') return json({ access_token: 'sa' })
    if (url.hostname === 'fcm.googleapis.com') {
      if (s.crashOnFcm) throw new Error('worker killed mid-send (simulated)')
      if (s.fcmFail > 0) { s.fcmFail--; return json({ error: { message: 'down' } }, 503) }
      s.fcm.push(body.message.token); return json({ name: 'm' })
    }
    if (url.hostname === 'api.resend.com') { if (s.mailFail) return json({ message: 'down' }, 500); s.mail.push(body.to[0]); return json({ id: 'e' }) }
    if (url.origin === DB) {
      const path = decodeURIComponent(url.pathname).replace(/^\//, '').replace(/\.json$/, '')
      if (method === 'GET') { const v = s.db.get(path); if (url.searchParams.get('shallow') === 'true') return json(v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).map((k) => [k, true])) : v); return json(v, 200, req.headers.get('x-firebase-etag') ? { ETag: s.db.etag(path) } : {}) }
      const m = req.headers.get('if-match'); if (m && m !== s.db.etag(path)) return json(s.db.get(path), 412)
      if (method === 'PUT') { s.db.set(path, body); return json(body) }
      if (method === 'PATCH') { for (const [k, v] of Object.entries(body)) s.db.set(`${path}/${k}`, v); return json(body) }
      if (method === 'DELETE') { s.db.set(path, null); return json(null) }
    }
    s.real.push(url.href); return json({ blocked: 'unexpected host' }, 599)
  }
  return { s, handler }
}

async function boot(seed, bindings = {}) {
  const st = stage(seed)
  const mf = new Miniflare({
    modules: true, script, compatibilityDate: '2026-01-01',
    bindings: { FIREBASE_PROJECT_ID: 'stage-proj', FIREBASE_CLIENT_EMAIL: 'sa@stage.test', FIREBASE_PRIVATE_KEY: pem, DATABASE_URL: DB, RESEND_API_KEY: 'test', RESEND_FROM_EMAIL: 'from@stage.test', ...bindings },
    outboundService: st.handler,
  })
  const w = await mf.getWorker()
  const fire = async (iso) => { const r = await w.scheduled({ scheduledTime: new Date(iso), cron: '* * * * *' }); await new Promise((r) => setTimeout(r, 50)); return r }
  return { mf, st: st.s, fire }
}

const MIN = 60000
const T0 = '2026-10-29T15:00:00Z'
const seed = () => ({
  hubs_meta: { 'hub-a': { name: 'Hub A', active: true, timezone: 'America/New_York' }, 'hub-b': { name: 'Hub B', active: true, timezone: 'America/Chicago' }, 'hub-c': { name: 'Hub C', active: true } },
  users: { mA: { email: 'mgr-a@x.test', role: 'manager', hubId: 'hub-a' }, mB: { email: 'mgr-b@x.test', role: 'manager', hubId: 'hub-b' }, off: { email: 'off@x.test', role: 'manager', hubId: 'hub-a', active: false } },
  hubs: { 'hub-a': { guests: { g1: { firstName: 'Ann', email: 'ann@x.test', fcmToken: { token: 'fcm-a1' } } } }, 'hub-b': { guests: { g2: { firstName: 'Bo', email: 'bo@x.test', fcmToken: { token: 'fcm-b1' } } } }, 'hub-c': { guests: { g3: { firstName: 'Cy', email: 'cy@x.test', fcmToken: { token: 'fcm-c1' } } } } },
})
const ann = (over = {}) => ({ title: 'Pool party', message: 'Come swim', type: 'info', active: false, scheduledAt: new Date(Date.parse(T0) - 2 * MIN).toISOString(), createdBy: 'mgr-a@x.test', ...over })
const withAnn = (a, hub = 'hub-a') => { const x = seed(); x.hubs[hub].announcements = { an1: a }; return x }
const withEv = (e, hub = 'hub-a') => { const x = seed(); x.hubs[hub].activities = { ev1: { title: 'Live music', hours: '9:00 AM - 11:00 AM', dates: ['2026-10-29'], active: true, createdBy: hub === 'hub-b' ? 'mgr-b@x.test' : 'mgr-a@x.test', ...e } }; return x }

// 1 ─ cron, nobody logged in
{ const t = await boot(withAnn(ann())); const r = await t.fire(T0)
  ok(r.outcome === 'ok', 'scheduled() handler ran in workerd, outcome=' + r.outcome)
  ok(t.st.db.get('hubs/hub-a/announcements/an1').active === true && t.st.db.get('hubs/hub-a/announcements/an1').publishedBy === 'scheduler', 'due post published by the cron with no dashboard involved')
  ok(t.st.fcm.join() === 'fcm-a1' && t.st.mail.join() === 'ann@x.test', 'one push and one email went to the fake FCM/Resend only')
  ok(t.st.real.length === 0, 'no unexpected outbound host was contacted'); 
  for (let i = 1; i <= 4; i++) await t.fire(new Date(Date.parse(T0) + i * MIN).toISOString())
  ok(t.st.fcm.length === 1 && t.st.mail.length === 1, 'five more cron ticks: still exactly one push and one email (duplicate prevention)'); await t.mf.dispose() }
// 2 ─ overlapping crons
{ const t = await boot(withAnn(ann())); t.st.latency = true
  const w = await t.mf.getWorker(); await Promise.all([1, 2, 3, 4].map(() => w.scheduled({ scheduledTime: new Date(T0), cron: '* * * * *' }))); await new Promise((r) => setTimeout(r, 300))
  ok(t.st.fcm.length === 1 && t.st.mail.length === 1, 'four overlapping cron invocations: exactly one push and one email'); await t.mf.dispose() }
// 3 ─ preferences, inactive hubs, expiry, blocked author, kill switch
{ const x = withAnn(ann()); x.hubs['hub-a'].settings = { guestNotifications: false }; const t = await boot(x); await t.fire(T0)
  ok(t.st.db.get('hubs/hub-a/announcements/an1').active === true && t.st.fcm.length + t.st.mail.length === 0, 'notifications switched off: published, nobody notified'); await t.mf.dispose() }
{ const t = await boot(withAnn(ann({ notifyOnPublish: false }))); await t.fire(T0); ok(t.st.db.get('hubs/hub-a/announcements/an1').active === true && t.st.fcm.length === 0, '“do not notify” choice respected'); await t.mf.dispose() }
{ const x = withAnn(ann()); x.hubs_meta['hub-a'].active = false; const t = await boot(x); await t.fire(T0); ok(t.st.db.get('hubs/hub-a/announcements/an1').active === false && t.st.fcm.length === 0, 'inactive hub: nothing published or sent'); await t.mf.dispose() }
{ const t = await boot(withAnn(ann({ expiresAt: new Date(Date.parse(T0) - MIN).toISOString() }))); await t.fire(T0); const a = t.st.db.get('hubs/hub-a/announcements/an1'); ok(a.active === false && a.scheduleStatus === 'expired' && t.st.fcm.length === 0, 'expired post is marked expired, not published'); await t.mf.dispose() }
{ const t = await boot(withAnn(ann({ createdBy: 'off@x.test' }))); await t.fire(T0); const a = t.st.db.get('hubs/hub-a/announcements/an1'); ok(a.active === false && a.scheduleStatus === 'blocked' && t.st.fcm.length === 0, 'deactivated author: post blocked, nothing sent'); await t.mf.dispose() }
{ const t = await boot(withAnn(ann()), { SCHEDULER_ENABLED: 'false' }); await t.fire(T0); ok(t.st.db.get('hubs/hub-a/announcements/an1').active === false, 'SCHEDULER_ENABLED=false stops all work (rollback switch)'); await t.mf.dispose() }
// 4 ─ retries and recovery
{ const t = await boot(withAnn(ann())); t.st.fcmFail = 99; await t.fire(T0)
  ok(t.st.db.get('hubs/hub-a/announcements/an1/notify/status') === 'failed' && t.st.mail.length === 1, 'push down: post is live, email sent, push marked failed for retry')
  await t.fire(new Date(Date.parse(T0) + 30_000).toISOString()); ok(t.st.fcm.length === 0, 'no retry before the 1-minute backoff')
  t.st.fcmFail = 0; await t.fire(new Date(Date.parse(T0) + 2 * MIN).toISOString())
  ok(t.st.fcm.join() === 'fcm-a1' && t.st.mail.length === 1, 'after the push service recovers, only the failed channel is retried (email not repeated)')
  ok(t.st.db.get('hubs/hub-a/announcements/an1/notify/status') === 'done', 'final state done'); await t.mf.dispose() }
{ const t = await boot(withAnn(ann())); t.st.fcmFail = 99; t.st.mailFail = true
  for (const m of [0, 2, 10, 30, 60]) await t.fire(new Date(Date.parse(T0) + m * MIN).toISOString())
  ok(t.st.db.get('hubs/hub-a/announcements/an1/notify/status') === 'gave_up' && t.st.db.get('hubs/hub-a/announcements/an1/notify/attempts') === 3, 'both channels down: gives up after 3 attempts, recorded'); await t.mf.dispose() }
{ const t = await boot(withAnn(ann())); t.st.crashOnFcm = true; await t.fire(T0)
  const s1 = t.st.db.get('hubs/hub-a/announcements/an1/notify/status')
  ok(['sending', 'failed'].includes(s1), 'worker crashed during the send: state left as ' + s1)
  t.st.crashOnFcm = false
  await t.fire(new Date(Date.parse(T0) + 10 * MIN).toISOString())
  ok(t.st.db.get('hubs/hub-a/announcements/an1/notify/status') === 'done' && t.st.fcm.length === 1, 'next cron after the lease/backoff recovers and delivers once'); await t.mf.dispose() }
// 5 ─ time zones and DST, in workerd's own ICU
const ev = async (e, hub, times) => { const t = await boot(withEv(e, hub)); const out = []; for (const x of times) { const before = t.st.fcm.length; await t.fire(x); out.push(t.st.fcm.length - before) } await t.mf.dispose(); return out.join(',') }
ok(await ev({}, 'hub-a', ['2026-10-29T12:59:00Z', '2026-10-29T13:00:00Z', '2026-10-29T13:01:00Z']) === '0,1,0', 'New York 9:00 AM on Oct 29 2026 (EDT) = 13:00Z, alert once')
ok(await ev({}, 'hub-b', ['2026-10-29T13:00:00Z', '2026-10-29T14:00:00Z']) === '0,1', 'Chicago hub: same event alerts an hour later (14:00Z)')
ok(await ev({ dates: ['2026-11-01'] }, 'hub-a', ['2026-11-01T13:00:00Z', '2026-11-01T14:00:00Z']) === '0,1', 'DST ends Nov 1 2026: 9:00 AM New York = 14:00Z, not 13:00Z')
ok(await ev({ dates: ['2027-03-14'] }, 'hub-a', ['2027-03-14T14:00:00Z', '2027-03-14T13:00:00Z']) === '0,1', 'DST starts Mar 14 2027: 9:00 AM New York = 13:00Z, not 14:00Z')
ok(await ev({ hours: '9:00 PM', dates: ['2026-10-30'] }, 'hub-a', ['2026-10-31T01:00:00Z']) === '1', '9 PM New York on Oct 30 is 01:00Z on Oct 31 (hub calendar day, not UTC)')
ok(await ev({}, 'hub-c', ['2026-10-29T13:00:00Z', '2026-10-29T14:00:00Z', '2026-10-29T15:00:00Z']) === '0,0,0', 'hub with no time zone: alert paused, nothing sent')
ok(await ev({ dates: ['2026-10-29'] }, 'hub-a', ['2026-10-29T13:40:00Z']) === '0', 'more than 30 minutes late: not sent')
console.log(fails ? `${fails} of ${total} FAILED` : `ALL ${total} PASSED (real workerd runtime, fake network)`)
process.exit(fails ? 1 : 0)
