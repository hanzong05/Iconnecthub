/**
 * Second, independent check of the proposed rules using "targaryen" (a third-party reimplementation of the Realtime
 * Database rules engine that also models multi-path update()). It is NOT Google's emulator. It cross-checks my own
 * simulator (scripts/rules-sim.ts) and answers the open question: is a legacy hub's multi-field update() accepted?
 *
 * Run: cd <scratch> && npm i targaryen && TARGARYEN_PATH=<scratch>/node_modules/targaryen node scripts/staging/rules.targaryen.cjs
 */
const fs = require('fs'), path = require('path')
const targaryen = require(process.env.TARGARYEN_PATH || 'targaryen')
const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../security/review', f), 'utf8'))
const VAR = { strict: load('database.rules.proposed.json'), compat: load('database.rules.proposed-compat.json'), pasted: load('database.rules.current-pasted.json') }
const H = 'hub-a', iso = '2026-10-29T05:00:00.000Z', FCM = 'dXy9:APA91b-token_value_with_colon'
const data = {
  hubs_meta: { [H]: { name: 'Hub A', active: true, timezone: 'America/New_York' }, 'hub-b': { name: 'Hub B', active: true } },
  users: { super1: { role: 'super' }, smA: { role: 'super_manager', hubId: H }, mgrA: { role: 'manager', hubId: H }, mgrB: { role: 'manager', hubId: 'hub-b' }, offA: { role: 'manager', hubId: H, active: false } },
  hubs: {
    [H]: { settings: { wifi: { ssid: 'x' }, mapDisplay: { mode: 'pathfinder', campgroundId: 'c1' } }, guests: { tok1: { firstName: 'Ann', email: 'ann@x.test' } }, chats: { tok1: { guestName: 'Ann', messages: { m1: { id: 'm1', text: 'hello', sender: 'guest', at: iso } } } }, analytics: { count: 41, lastAccess: iso }, guestMap: { campgroundId: 'c1', imageUrl: 'https://i.ibb.co/x', width: 8, height: 6, places: {} }, pathfinder: { x: 1 }, notifyLog: { l: 1 } },
    'hub-b': { guests: { tokB: { firstName: 'Bo' } }, chats: { s2: { guestName: 'H' } } },
  },
  _global: { parkhub_analytics: { count: 10, lastAccess: 'x' } },
}
const db = (rules, uid) => targaryen.database(rules, data).as(uid ? { uid } : null)
let fails = 0, total = 0
const check = (name, got, want) => { total++; const ok = got === want; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  (got ${got}, wanted ${want})`)) }
const R = (v, p, uid) => db(VAR[v], uid).read(p).allowed
const W = (v, p, val, uid) => db(VAR[v], uid).write(p, val).allowed
const U = (v, p, obj, uid) => db(VAR[v], uid).update(p, obj).allowed

for (const v of ['strict', 'compat']) {
  console.log(`\n== ${v} rules ==`)
  // guest (signed out) reads
  for (const p of [`hubs_meta/${H}`, `hubs/${H}/settings/wifi`, `hubs/${H}/announcements`, `hubs/${H}/guests/tok1`, `hubs/${H}/chats/tok1/messages`, `hubs/${H}/guestMap`, `hubs/${H}/guestMap/places`]) check(`${v}: guest reads ${p}`, R(v, p, null), true)
  for (const p of [`hubs/${H}/guests`, `hubs/${H}/chats`, `hubs/${H}/pathfinder`, `hubs/${H}/settingsDraft`, `hubs/${H}/audit`, 'users', `hubs/${H}/notifyLog`, `hubs/${H}/onboardingEvents`, `hubs/${H}/webPushSubs`, `hubs/${H}/fcmTokens`]) check(`${v}: guest CANNOT read ${p}`, R(v, p, null), false)
  // legacy guest writes (single path)
  check(`${v}: guest push sub`, W(v, `hubs/${H}/guests/tok1/webPushSub`, { endpoint: 'https://push.test/a', p256dh: 'p', auth: 'a' }, null), true)
  check(`${v}: guest fcm token`, W(v, `hubs/${H}/guests/tok1/fcmToken`, { token: FCM, savedAt: iso }, null), true)
  check(`${v}: guest unsubscribe`, W(v, `hubs/${H}/guests/tok1/webPushSub`, null, null), true)
  check(`${v}: webPushSubs list entry`, W(v, `hubs/${H}/webPushSubs/aGVsbG8`, { endpoint: 'https://push.test/a' }, null), true)
  check(`${v}: fcmTokens list entry`, W(v, `hubs/${H}/fcmTokens/${FCM}`, { token: FCM }, null), true)
  check(`${v}: onboarding event`, W(v, `hubs/${H}/onboardingEvents/-N1`, { event: 'welcome_shown', at: iso, platform: 'ios', step: 3 }, null), true)
  check(`${v}: guest chat message`, W(v, `hubs/${H}/chats/c_new/messages/-N1`, { id: '-N1', text: 'Pool open?', sender: 'guest', at: iso }, null), true)
  check(`${v}: chat summary field`, W(v, `hubs/${H}/chats/c_new/lastMessage`, 'Pool open?', null), true)
  check(`${v}: hub visit counter +1`, W(v, `hubs/${H}/analytics/count`, 42, null), true)
  check(`${v}: global visit counter +1`, W(v, '_global/parkhub_analytics/count', 11, null), true)
  // THE open question: multi-field update() the way a legacy hub makes it
  check(`${v}: UPDATE guest record, push + stay dates + geofence in one update()`, U(v, `hubs/${H}/guests/tok1`, { webPushSub: { endpoint: 'https://push.test/a' }, arrivalDate: '2026-11-01', departureDate: '2026-11-05', geofence: { active: true, updatedAt: iso } }, null), true)
  check(`${v}: UPDATE guest record, unsubscribe (two nulls)`, U(v, `hubs/${H}/guests/tok1`, { webPushSub: null, fcmToken: null }, null), true)
  check(`${v}: UPDATE chat thread summary + message in one update()`, U(v, `hubs/${H}/chats/c_new`, { 'messages/-N2': { id: '-N2', text: 'hi', sender: 'guest', at: iso }, lastMessage: 'hi', lastAt: iso, unreadAdmin: true, guestName: 'Guest' }, null), true)
  // attacks
  check(`${v}: guest CANNOT invent a guest`, W(v, `hubs/${H}/guests/madeup`, { firstName: 'Fake' }, null), false)
  check(`${v}: guest CANNOT write settings`, W(v, `hubs/${H}/settings/wifi/ssid`, 'evil', null), false)
  check(`${v}: guest CANNOT write guestMap`, W(v, `hubs/${H}/guestMap/imageUrl`, 'https://evil.test/x', null), false)
  check(`${v}: guest CANNOT forge an admin chat message`, W(v, `hubs/${H}/chats/tok1/messages/m9`, { id: 'm9', text: 'free!', sender: 'admin' }, null), false)
  check(`${v}: guest CANNOT edit a posted message`, W(v, `hubs/${H}/chats/tok1/messages/m1`, { id: 'm1', text: 'edited', sender: 'guest' }, null), false)
  check(`${v}: guest CANNOT delete a thread`, W(v, `hubs/${H}/chats/tok1`, null, null), false)
  check(`${v}: guest CANNOT reset the counter`, W(v, `hubs/${H}/analytics/count`, 0, null), false)
  check(`${v}: guest CANNOT inflate the counter`, W(v, `hubs/${H}/analytics/count`, 9999, null), false)
  check(`${v}: guest CANNOT send oversize event`, W(v, `hubs/${H}/onboardingEvents/-N9`, { event: 'x'.repeat(81) }, null), false)
  check(`${v}: guest CANNOT send bad push key`, W(v, `hubs/${H}/webPushSubs/bad key`, { endpoint: 'https://push.test/a' }, null), false)
  check(`${v}: guest CANNOT use a non-https push endpoint`, W(v, `hubs/${H}/guests/tok1/webPushSub`, { endpoint: 'javascript:alert(1)' }, null), false)
  // staff and isolation
  check(`${v}: manager A writes announcement in hub A`, W(v, `hubs/${H}/announcements/a1`, { title: 't' }, 'mgrA'), true)
  check(`${v}: manager B CANNOT write hub A announcement`, W(v, `hubs/${H}/announcements/a1`, { title: 't' }, 'mgrB'), false)
  check(`${v}: deactivated manager CANNOT write`, W(v, `hubs/${H}/announcements/a1`, { title: 't' }, 'offA'), false)
  check(`${v}: manager A reads guest list of hub A`, R(v, `hubs/${H}/guests`, 'mgrA'), true)
  check(`${v}: manager A CANNOT read hub B guests`, R(v, 'hubs/hub-b/guests', 'mgrA'), false)
  check(`${v}: deactivated manager CANNOT read guests`, R(v, `hubs/${H}/guests`, 'offA'), false)
  check(`${v}: manager CANNOT read pathfinder`, R(v, `hubs/${H}/pathfinder`, 'mgrA'), false)
  check(`${v}: super reads pathfinder`, R(v, `hubs/${H}/pathfinder`, 'super1'), true)
  check(`${v}: super writes guestMap`, W(v, `hubs/${H}/guestMap`, { campgroundId: 'c1', imageUrl: 'https://i.ibb.co/x', width: 8, height: 6 }, 'super1'), true)
  check(`${v}: manager CANNOT write guestMap`, W(v, `hubs/${H}/guestMap`, { campgroundId: 'c1', imageUrl: 'https://i.ibb.co/x', width: 8, height: 6 }, 'mgrA'), false)
  check(`${v}: stranger (signed in, no profile) CANNOT read guests`, R(v, `hubs/${H}/guests`, 'nobody'), false)
  check(`${v}: stranger CANNOT write announcements`, W(v, `hubs/${H}/announcements/a1`, { title: 't' }, 'nobody'), false)
  check(`${v}: manager A cannot rename hub B`, W(v, 'hubs_meta/hub-b/name', 'X', 'mgrA'), false)
  check(`${v}: super sets hub timezone`, W(v, `hubs_meta/${H}/timezone`, 'America/Chicago', 'super1'), true)
  check(`${v}: users list hidden from manager`, R(v, 'users', 'mgrA'), false)
  check(`${v}: manager cannot make self super`, W(v, 'users/mgrA/role', 'super', 'mgrA'), false)
}
console.log('\n== strict-only: identity fields on a guest record ==')
check('strict: guest CANNOT change a guest email (single write)', W('strict', `hubs/${H}/guests/tok1/email`, 'evil@x.test', null), false)
check('strict: guest CANNOT overwrite whole record via update()', U('strict', `hubs/${H}/guests/tok1`, { email: 'evil@x.test' }, null), false)
check('compat: guest CAN change identity fields (documented trade-off)', W('compat', `hubs/${H}/guests/tok1/email`, 'evil@x.test', null), true)
console.log('\n== baseline: the PASTED rules (what is probably live) ==')
for (const [n, v] of [['onboardingEvents', () => W('pasted', `hubs/${H}/onboardingEvents/-N1`, { event: 'x' }, null)], ['webPushSubs', () => W('pasted', `hubs/${H}/webPushSubs/k`, { endpoint: 'https://p.test' }, null)], ['fcmTokens', () => W('pasted', `hubs/${H}/fcmTokens/k`, { token: 't' }, null)]]) console.log(`INFO pasted rules: guest write to ${n} allowed = ${v()}`)
console.log(`INFO pasted rules: guest can write announcements = ${W('pasted', `hubs/${H}/announcements/a1`, { title: 'x' }, null)}; any signed-in stranger can = ${W('pasted', `hubs/${H}/announcements/a1`, { title: 'x' }, 'nobody')}`)
console.log(fails ? `\n${fails} of ${total} FAILED` : `\nALL ${total} PASSED (targaryen engine)`)
process.exit(fails ? 1 : 0)
