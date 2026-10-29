/**
 * Legacy-hub coverage: every database write the 19 production hub pages (and shared/hub-corev1) actually make,
 * replayed with the exact payload shapes read from their source, against the proposed rule variants.
 * Source of the list: grep of ref(db, ...) / update(ref(db), {...}) across hubs/*.html (see security/review/README.md).
 * Engine: targaryen (third-party), NOT Google's emulator.
 *
 * Run: TARGARYEN_PATH=<scratch>/wd/node_modules/targaryen node scripts/staging/rules.legacy-paths.targaryen.cjs
 */
const fs = require('fs'), path = require('path')
const targaryen = require(process.env.TARGARYEN_PATH || 'targaryen')
const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../security/review', f), 'utf8'))
const VAR = { strict: load('database.rules.proposed.json'), compat: load('database.rules.proposed-compat.json') }
const H = 'hub-a', iso = '2026-10-29T05:00:00.000Z', FCM = 'dXy9:APA91b-token_value_with_colon'
const FCMKEY = FCM.replace(/[.#$\[\]]/g, '_')
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc'
const SUBKEY = Buffer.from(ENDPOINT).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 60)
const data = {
  hubs_meta: { [H]: { name: 'Hub A', active: true } },
  users: {},
  hubs: {
    [H]: {
      guests: { tok1: { firstName: 'Ann', email: 'ann@x.test', arrivalDate: '2026-10-20', departureDate: '2026-10-25',
        fcmToken: { token: FCM, savedAt: iso }, webPushSub: { endpoint: ENDPOINT, p256dh: 'p', auth: 'a' }, geofence: { active: true, updatedAt: iso } } },
      fcmTokens: { [FCMKEY]: { token: FCM } },
      webPushSubs: { [SUBKEY]: { endpoint: ENDPOINT } },
      chats: { tok1: { guestName: 'Ann', lastMessage: 'hi', lastAt: iso, unreadGuest: true, messages: {
        m1: { id: 'm1', text: 'hi', sender: 'guest', at: iso },
        m2: { id: 'm2', text: 'welcome!', sender: 'admin', senderName: 'Front desk', at: iso, readByGuest: false } } } },
      analytics: { count: 5, lastAccess: iso },
    },
  },
  _global: { parkhub_analytics: { count: 10, lastAccess: iso, accessTimes: Array.from({ length: 100 }, (_, i) => ({ timestamp: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T00:00:00.000Z` })) } },
}
let fails = 0, total = 0
const check = (name, got, want) => { total++; const ok = got === want; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  (got ${got}, wanted ${want})`)) }
const db = (v) => targaryen.database(VAR[v], data).as(null)
const W = (v, p, val) => db(v).write(p, val).allowed
const U = (v, p, o) => db(v).update(p, o).allowed
const R = (v, p) => db(v).read(p).allowed

for (const v of ['strict', 'compat']) {
  console.log(`\n== ${v} ==`)
  // hub-corev1: per-hub visit counter. get() then update(ref, {count: n+1, lastAccess}) - the whole existing node is written back.
  check(`${v}: visit counter, update(analytics,{count+1,lastAccess})`, U(v, `hubs/${H}/analytics`, { count: 6, lastAccess: iso }), true)
  // hub-corev1: global counter. accessTimes is an array of {timestamp}, capped at 100 by slice(-100): every index shifts.
  const old = data._global.parkhub_analytics.accessTimes
  const next = [...old.slice(1), { timestamp: iso }]
  check(`${v}: global counter + 100-entry accessTimes rewritten`, U(v, '_global/parkhub_analytics', { count: 11, lastAccess: iso, accessTimes: next }), true)
  check(`${v}: global counter CANNOT be set to 5000`, U(v, '_global/parkhub_analytics', { count: 5000, lastAccess: iso, accessTimes: next }), false)
  // departure clean-up: update(ref(db), {...null...}) across guests/* and the two list nodes
  const dep = {
    [`hubs/${H}/guests/tok1/fcmToken`]: null, [`hubs/${H}/guests/tok1/webPushSub`]: null, [`hubs/${H}/guests/tok1/geofence`]: null,
    [`hubs/${H}/fcmTokens/${FCMKEY}`]: null, [`hubs/${H}/webPushSubs/${SUBKEY}`]: null,
  }
  check(`${v}: departure clean-up (5 nulls in one root update)`, U(v, '/', dep), true)
  check(`${v}: departure clean-up for a guest record that does not exist is refused`, U(v, '/', { [`hubs/${H}/guests/ghost/fcmToken`]: null }), false)
  // guest reads admin messages and marks them read: update(ref(db), {`.../messages/m2/readByGuest`: true})
  check(`${v}: guest marks an admin message read`, U(v, '/', { [`hubs/${H}/chats/tok1/messages/m2/readByGuest`]: true }), true)
  check(`${v}: guest CANNOT flip a message back to unread`, U(v, '/', { [`hubs/${H}/chats/tok1/messages/m2/readByGuest`]: false }), false)
  check(`${v}: guest CANNOT change the text of an admin message`, U(v, '/', { [`hubs/${H}/chats/tok1/messages/m2/text`]: 'free stay' }), false)
  // admin-side unread flag the guest clears on the thread
  check(`${v}: guest clears unreadGuest on the thread`, W(v, `hubs/${H}/chats/tok1/unreadGuest`, false), true)
  // reads the hub page performs
  for (const p of ['hubs_meta/' + H, `hubs/${H}/settings/quickActions`, `hubs/${H}/settings/visibilityGroups`, `hubs/${H}/settings/musicFestival`, `hubs/${H}/settings/monthlyHappenings`,
    `hubs/${H}/announcements`, `hubs/${H}/activities`, `hubs/${H}/guests/tok1`, `hubs/${H}/chats/tok1/messages`]) check(`${v}: hub page can read ${p}`, R(v, p), true)
  // Carolina Camp Cedar group scorecard
  const sc = `hubs/${H}/scorecardRounds/pickens`
  check(`${v}: scorecard, start a round`, W(v, `${sc}/4821`, { createdAt: iso, course: 'Pickens (18)', players: { p1: { name: 'Sam', scores: {} } } }), true)
  check(`${v}: scorecard, anyone can read a round by its code`, R(v, `${sc}/4821`), true)
  check(`${v}: scorecard, rooms cannot be listed`, R(v, sc), false)
  check(`${v}: scorecard, bad room code refused`, W(v, `${sc}/abc`, { createdAt: iso, course: 'x', players: { p1: { name: 'Sam', scores: {} } } }), false)
  check(`${v}: scorecard, 2nd player joins a free slot`, W(v, `${sc}/4821/players/p2`, { name: 'Lee', scores: {} }), true)
}

// Existing round: cannot be overwritten by a colliding code, and a taken slot cannot be reclaimed.
{
  const d2 = JSON.parse(JSON.stringify(data)); d2.hubs[H].scorecardRounds = { pickens: { 4821: { createdAt: iso, course: 'P', players: { p1: { name: 'Sam', scores: { 1: 4 } } } } } }
  for (const v of ['strict', 'compat']) {
    const d = targaryen.database(VAR[v], d2).as(null)
    check(`${v}: scorecard, a colliding room code cannot overwrite a live round`, d.write(`hubs/${H}/scorecardRounds/pickens/4821`, { createdAt: iso, course: 'P', players: { p1: { name: 'Evil', scores: {} } } }).allowed, false)
    check(`${v}: scorecard, a taken slot cannot be reclaimed`, d.write(`hubs/${H}/scorecardRounds/pickens/4821/players/p1`, { name: 'Evil', scores: {} }).allowed, false)
    check(`${v}: scorecard, write a hole score`, d.write(`hubs/${H}/scorecardRounds/pickens/4821/players/p1/scores/7`, 3).allowed, true)
    check(`${v}: scorecard, clear a hole score (null)`, d.write(`hubs/${H}/scorecardRounds/pickens/4821/players/p1/scores/1`, null).allowed, true)
    check(`${v}: scorecard, score 500 refused`, d.write(`hubs/${H}/scorecardRounds/pickens/4821/players/p1/scores/7`, 500).allowed, false)
    check(`${v}: scorecard, 5th slot refused`, d.write(`hubs/${H}/scorecardRounds/pickens/4821/players/p5`, { name: 'Z', scores: {} }).allowed, false)
    check(`${v}: scorecard, join free slot p2 on a live round`, d.write(`hubs/${H}/scorecardRounds/pickens/4821/players/p2`, { name: 'Lee', scores: {} }).allowed, true)
  }
}
console.log(fails ? `\n${fails} of ${total} FAILED` : `\nALL ${total} PASSED (targaryen engine)`)
process.exit(fails ? 1 : 0)
