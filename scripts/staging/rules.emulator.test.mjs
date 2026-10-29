/**
 * REAL Firebase Realtime Database emulator test of the proposed rules.
 *
 * STATUS: NOT RUN. The emulator download is blocked in the environment this was written in (proxy 403), so this file
 * has never been executed. The same cases pass in targaryen (a third-party engine, see rules.legacy-paths.targaryen.cjs
 * and rules.targaryen.cjs), which is NOT evidence that Google's engine agrees. Run this before any rules are published.
 *
 * Needs: Java 11+, Node 20+, `npm i -D firebase-tools @firebase/rules-unit-testing firebase`.
 * Run (strict, preferred):
 *   RULES=strict  npx firebase emulators:exec --only database --project demo-iconnecthub "node --test scripts/staging/rules.emulator.test.mjs"
 * Run (compat fallback):
 *   RULES=compat  npx firebase emulators:exec --only database --project demo-iconnecthub "node --test scripts/staging/rules.emulator.test.mjs"
 * "demo-" project ids never reach a real Firebase project. Do NOT point this at the live database.
 */
import { test, before, after } from 'node:test'
import fs from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'

const which = process.env.RULES === 'compat' ? 'database.rules.proposed-compat.json' : 'database.rules.proposed.json'
// RULES_FILE (a path) overrides the choice; used for the negative control with allow-all rules (see allow-all.control.json).
const rules = process.env.RULES_FILE ? fs.readFileSync(process.env.RULES_FILE, 'utf8') : fs.readFileSync(new URL(`../../security/review/${which}`, import.meta.url), 'utf8')
console.log(`# rules loaded from: ${process.env.RULES_FILE || which} (${rules.length} bytes)`)
const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':')
if (!/^(127\.0\.0\.1|localhost)$/.test(host)) throw new Error('Refusing to run: the database host is not local')

const H = 'hub-a', HB = 'hub-b', iso = '2026-10-29T05:00:00.000Z', FCM = 'dXy9:APA91b-token_value_with_colon'
const FCMKEY = FCM.replace(/[.#$\[\]]/g, '_'), EP = 'https://fcm.googleapis.com/fcm/send/abc'
const SUBKEY = Buffer.from(EP).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 60)
const seed = {
  hubs_meta: { [H]: { name: 'Hub A', active: true }, [HB]: { name: 'Hub B', active: true } },
  users: {
    super1: { role: 'super' }, smA: { role: 'super_manager', hubId: H }, mgrA: { role: 'manager', hubId: H },
    mgrB: { role: 'manager', hubId: HB }, offA: { role: 'manager', hubId: H, active: false }, noRole: {},
  },
  hubs: {
    [H]: {
      guests: { tok1: { firstName: 'Ann', email: 'ann@x.test', arrivalDate: '2026-10-20', departureDate: '2026-10-25', fcmToken: { token: FCM, savedAt: iso }, webPushSub: { endpoint: EP, p256dh: 'p', auth: 'a' }, geofence: { active: true, updatedAt: iso } } },
      fcmTokens: { [FCMKEY]: { token: FCM } }, webPushSubs: { [SUBKEY]: { endpoint: EP } },
      chats: { tok1: { guestName: 'Ann', lastMessage: 'hi', lastAt: iso, messages: { m1: { id: 'm1', text: 'hi', sender: 'guest', at: iso }, m2: { id: 'm2', text: 'welcome', sender: 'admin', at: iso, readByGuest: false } } } },
      analytics: { count: 5, lastAccess: iso }, settings: { wifi: { ssid: 'x' } }, announcements: { a1: { title: 't' } },
      guestMap: { campgroundId: 'c1', imageUrl: 'https://img.test/m.png', width: 100, height: 100 },
      scorecardRounds: { pickens: { 4821: { createdAt: iso, course: 'P', players: { p1: { name: 'Sam', scores: { 1: 4 } } } } } },
    },
    [HB]: { guests: { tokB: { firstName: 'Bo' } }, announcements: { b1: { title: 'B' } } },
  },
  _global: { parkhub_analytics: { count: 10, lastAccess: iso } },
}

let env
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-iconnecthub', database: { rules, host, port: Number(port) } })
  await env.withSecurityRulesDisabled(async (c) => { await c.database().ref().set(seed) })
})
after(async () => { await env?.cleanup() })

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database()
// [name, who(null=signed-out guest), op, path, value, expectAllowed]
const set = 'set', upd = 'update', get = 'get'
const cases = [
  // guest (signed out), single-path legacy writes
  ['guest: push sub', null, set, `hubs/${H}/guests/tok1/webPushSub`, { endpoint: EP, p256dh: 'p', auth: 'a' }, true],
  ['guest: fcm token', null, set, `hubs/${H}/guests/tok1/fcmToken`, { token: FCM, savedAt: iso }, true],
  ['guest: webPushSubs entry', null, set, `hubs/${H}/webPushSubs/${SUBKEY}`, { endpoint: EP }, true],
  ['guest: fcmTokens entry', null, set, `hubs/${H}/fcmTokens/${FCMKEY}`, { token: FCM }, true],
  ['guest: onboarding event', null, set, `hubs/${H}/onboardingEvents/-N1`, { event: 'welcome_shown', at: iso }, true],
  ['guest: chat message', null, set, `hubs/${H}/chats/c_new/messages/-N1`, { id: '-N1', text: 'Pool open?', sender: 'guest', at: iso }, true],
  ['guest: hub visit counter +1', null, set, `hubs/${H}/analytics/count`, 6, true],
  ['guest: global visit counter +1', null, set, '_global/parkhub_analytics/count', 11, true],
  // guest, multi-field update() exactly as the hub pages call it (THE open question)
  ['guest: update() guest record, push+stay+geofence in one call', null, upd, `hubs/${H}/guests/tok1`, { webPushSub: { endpoint: EP }, arrivalDate: '2026-10-21', geofence: { active: true, updatedAt: iso } }, true],
  ['guest: update() unsubscribe, two nulls', null, upd, `hubs/${H}/guests/tok1`, { webPushSub: null, fcmToken: null }, true],
  ['guest: update() analytics {count+1,lastAccess}', null, upd, `hubs/${H}/analytics`, { count: 6, lastAccess: iso }, true],
  ['guest: update() root, departure clean-up (5 nulls)', null, upd, '/', { [`hubs/${H}/guests/tok1/fcmToken`]: null, [`hubs/${H}/guests/tok1/webPushSub`]: null, [`hubs/${H}/guests/tok1/geofence`]: null, [`hubs/${H}/fcmTokens/${FCMKEY}`]: null, [`hubs/${H}/webPushSubs/${SUBKEY}`]: null }, true],
  ['guest: update() root, mark admin message read', null, upd, '/', { [`hubs/${H}/chats/tok1/messages/m2/readByGuest`]: true }, true],
  ['guest: scorecard start round', null, set, `hubs/${H}/scorecardRounds/pickens/7777`, { createdAt: iso, course: 'P', players: { p1: { name: 'Lee', scores: {} } } }, true],
  ['guest: scorecard hole score', null, set, `hubs/${H}/scorecardRounds/pickens/4821/players/p1/scores/7`, 3, true],
  // guest attacks
  ['guest CANNOT invent a guest', null, set, `hubs/${H}/guests/madeup`, { firstName: 'Fake' }, false],
  ['guest CANNOT write settings', null, set, `hubs/${H}/settings/wifi/ssid`, 'evil', false],
  ['guest CANNOT write guestMap', null, set, `hubs/${H}/guestMap/imageUrl`, 'https://evil.test/x', false],
  ['guest CANNOT forge admin chat message', null, set, `hubs/${H}/chats/tok1/messages/m9`, { id: 'm9', text: 'free', sender: 'admin' }, false],
  ['guest CANNOT edit a posted message', null, set, `hubs/${H}/chats/tok1/messages/m1`, { id: 'm1', text: 'edited', sender: 'guest' }, false],
  ['guest CANNOT edit an admin message text', null, upd, '/', { [`hubs/${H}/chats/tok1/messages/m2/text`]: 'free stay' }, false],
  ['guest CANNOT delete a thread', null, set, `hubs/${H}/chats/tok1`, null, false],
  ['guest CANNOT reset visit counter', null, set, `hubs/${H}/analytics/count`, 0, false],
  ['guest CANNOT inflate visit counter', null, set, `hubs/${H}/analytics/count`, 9999, false],
  ['guest CANNOT use non-https push endpoint', null, set, `hubs/${H}/guests/tok1/webPushSub`, { endpoint: 'javascript:alert(1)' }, false],
  ['guest CANNOT overwrite a live scorecard room', null, set, `hubs/${H}/scorecardRounds/pickens/4821`, { createdAt: iso, course: 'P', players: { p1: { name: 'Evil', scores: {} } } }, false],
  ['guest CANNOT list guests', null, get, `hubs/${H}/guests`, undefined, false],
  ['guest CANNOT list chats', null, get, `hubs/${H}/chats`, undefined, false],
  ['guest CANNOT list scorecard rooms', null, get, `hubs/${H}/scorecardRounds/pickens`, undefined, false],
  ['guest CANNOT read users', null, get, 'users', undefined, false],
  ['guest CAN read guestMap', null, get, `hubs/${H}/guestMap`, undefined, true],
  ['guest CAN read announcements', null, get, `hubs/${H}/announcements`, undefined, true],
  // staff roles and hubs
  ['super writes any hub announcements', 'super1', set, `hubs/${HB}/announcements/n1`, { title: 'x' }, true],
  ['super writes guestMap', 'super1', set, `hubs/${H}/guestMap`, seed.hubs[H].guestMap, true],
  ['super reads pathfinder', 'super1', get, `hubs/${H}/pathfinder`, undefined, true],
  ['manager writes own hub announcement', 'mgrA', set, `hubs/${H}/announcements/n2`, { title: 'x' }, true],
  ['manager CANNOT write another hub', 'mgrA', set, `hubs/${HB}/announcements/n2`, { title: 'x' }, false],
  ['manager CANNOT read another hub guest list', 'mgrA', get, `hubs/${HB}/guests`, undefined, false],
  ['manager reads own guest list', 'mgrA', get, `hubs/${H}/guests`, undefined, true],
  ['manager CANNOT write guestMap', 'mgrA', set, `hubs/${H}/guestMap/imageUrl`, 'https://img.test/z.png', false],
  ['manager CANNOT read pathfinder', 'mgrA', get, `hubs/${H}/pathfinder`, undefined, false],
  ['manager CANNOT change own role', 'mgrA', set, 'users/mgrA/role', 'super', false],
  ['super_manager writes own hub', 'smA', set, `hubs/${H}/announcements/n3`, { title: 'x' }, true],
  ['other-hub manager CANNOT write this hub', 'mgrB', set, `hubs/${H}/announcements/n4`, { title: 'x' }, false],
  ['deactivated manager CANNOT write', 'offA', set, `hubs/${H}/announcements/n5`, { title: 'x' }, false],
  ['deactivated manager CANNOT read guests', 'offA', get, `hubs/${H}/guests`, undefined, false],
  ['signed-in user with no profile CANNOT write', 'noRole', set, `hubs/${H}/announcements/n6`, { title: 'x' }, false],
  ['signed-in user with no profile CANNOT read guests', 'noRole', get, `hubs/${H}/guests`, undefined, false],
]

for (const [name, who, op, p, val, allowed] of cases) {
  test(`[${process.env.RULES || 'strict'}] ${name}`, async () => {
    const ref = p === '/' ? as(who).ref() : as(who).ref(p)
    const run = op === get ? ref.get() : op === set ? ref.set(val) : ref.update(val)
    await (allowed ? assertSucceeds(run) : assertFails(run))
  })
}
