/**
 * Cases for the protected hub paths: settingsDraft, releases, releaseCurrent, audit, notifyLog, notifyJobs, and the visit counters.
 * One list, run by three engines: the project's rules simulator (scripts/rules.protected-paths.test.ts, runs everywhere),
 * targaryen (scripts/staging/rules.protected-paths.targaryen.cjs) and Google's real emulator
 * (scripts/staging/rules.protected-paths.emulator.test.mjs, owner's PC only).
 *
 * Each case: [name, who, op, path, value, expectAllowed]. who: null = signed-out guest, otherwise a uid in `seed.users`.
 * op: 'read' | 'set' | 'update' (value is a multi-path object written at `path`). A `null` value on 'set' deletes.
 */
export const iso = '2026-10-29T05:00:00.000Z'
export const H = 'hub-a'
export const HB = 'hub-b'
export const KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6'
const job = (over = {}) => ({ status: 'queued', by: 'a@x.test', createdAt: iso, runAfter: 1761700045000, title: 'Water', attempts: 0, content: { pushTitle: 'Water', pushBody: 'Off at 9', emailType: 'announcement', emailTitle: 'Water', emailBody: 'Off at 9' }, ...over })
const entry = (over = {}) => ({ at: iso, by: 'a@x.test', action: 'notify', summary: 'Water: queued to guests.', ...over })
const release = (over = {}) => ({ at: iso, by: 's@x.test', kind: 'publish', summary: ['Contacts: phone 1'], snapshot: { contacts: { phone: '1' } }, ...over })
const draft = (over = {}) => ({ version: 2, updatedAt: iso, updatedBy: 's@x.test', data: { wifi: { ssid: 'net', password: 'pw' }, contacts: { phone: '1' }, quickActions: ['a', 'b', 'c', 'd'], geofenceEnabled: true, visibility: { more: { wifi: true } }, location: { lat: 10, lon: 20 } }, ...over })

export const seed = {
  hubs_meta: { [H]: { name: 'Hub A', active: true }, [HB]: { name: 'Hub B', active: true } },
  users: {
    super1: { role: 'super', email: 's@x.test' },
    smA: { role: 'super_manager', hubId: H, email: 'sm@x.test' },
    mgrA: { role: 'manager', hubId: H, email: 'a@x.test' },
    mgrB: { role: 'manager', hubId: HB, email: 'b@x.test' },
    offA: { role: 'manager', hubId: H, active: false, email: 'off@x.test' },
    noRole: { email: 'n@x.test' },
  },
  hubs: {
    [H]: {
      settingsDraft: { version: 1, updatedAt: iso, updatedBy: 's@x.test', data: { contacts: { phone: '1' } } },
      releases: { r1abc: release() },
      releaseCurrent: 'r1abc',
      audit: { '2026-10': { a1: entry({ by: 's@x.test', action: 'publish', summary: 'Contacts', releaseId: 'r1abc' }) } },
      notifyLog: { [KEY]: 1761700000000 },
      notifyJobs: { jq: job(), jsend: job({ status: 'sending' }), jcan: job({ status: 'canceled' }) },
      analytics: { count: 5, lastAccess: iso },
      settings: { wifi: { ssid: 'x' } },
    },
    [HB]: {
      settingsDraft: { version: 1, updatedAt: iso, updatedBy: 's@x.test' },
      releases: { r9abc: release() },
      audit: { '2026-10': { b1: entry({ by: 's@x.test', action: 'publish', summary: 'B' }) } },
      notifyLog: { [KEY]: 1761700000000 },
      notifyJobs: { jb: job({ by: 'b@x.test' }) },
    },
  },
  _global: { parkhub_analytics: { count: 10, lastAccess: iso } },
}

const long = (n) => 'x'.repeat(n)
const D = `hubs/${H}/settingsDraft`, R = `hubs/${H}/releases`, A = `hubs/${H}/audit/2026-10`, J = `hubs/${H}/notifyJobs`, N = `hubs/${H}/notifyLog`

export const cases = [
  // ── settingsDraft: Super Admin only, shaped and size-limited ──────────────────────────────────────
  ['draft: super reads', 'super1', 'read', D, undefined, true],
  ['draft: super reads another hub', 'super1', 'read', `hubs/${HB}/settingsDraft`, undefined, true],
  ['draft: manager of the hub CANNOT read', 'mgrA', 'read', D, undefined, false],
  ['draft: super_manager CANNOT read', 'smA', 'read', D, undefined, false],
  ['draft: other hub manager CANNOT read', 'mgrB', 'read', D, undefined, false],
  ['draft: deactivated manager CANNOT read', 'offA', 'read', D, undefined, false],
  ['draft: guest CANNOT read', null, 'read', D, undefined, false],
  ['draft: super saves a valid draft (the exact shape the app writes)', 'super1', 'set', D, draft(), true],
  ['draft: super clears the draft data the way publish does (multi-path)', 'super1', 'update', `hubs/${H}`, { 'settingsDraft/data': null, 'settingsDraft/version': 2, 'settingsDraft/updatedAt': iso, 'settingsDraft/updatedBy': 's@x.test', 'settingsDraft/lock': null }, true],
  ['draft: super takes the publish claim', 'super1', 'set', `${D}/lock`, { id: 'l1', at: iso, by: 's@x.test', op: 'publish' }, true],
  ['draft: manager CANNOT write', 'mgrA', 'set', D, draft(), false],
  ['draft: super_manager CANNOT write', 'smA', 'set', D, draft(), false],
  ['draft: another hub manager CANNOT write', 'mgrB', 'set', D, draft(), false],
  ['draft: guest CANNOT write', null, 'set', D, draft(), false],
  ['draft: signed-in account with no role CANNOT write', 'noRole', 'set', D, draft(), false],
  ['draft: unknown setting is refused', 'super1', 'set', D, draft({ data: { evil: { x: 1 } } }), false],
  ['draft: unknown top-level key is refused', 'super1', 'set', D, { ...draft(), extra: 'x' }, false],
  ['draft: version as text is refused', 'super1', 'set', D, draft({ version: 'two' }), false],
  ['draft: Wi-Fi name over 64 characters is refused', 'super1', 'set', D, draft({ data: { wifi: { ssid: long(65), password: 'p' } } }), false],
  ['draft: Wi-Fi password over 128 characters is refused', 'super1', 'set', D, draft({ data: { wifi: { ssid: 'n', password: long(129) } } }), false],
  ['draft: website over 2000 characters is refused', 'super1', 'set', D, draft({ data: { contacts: { website: long(2001) } } }), false],
  ['draft: rules link over 2000 characters is refused', 'super1', 'set', D, draft({ data: { privacyPolicyUrl: long(2001) } }), false],
  ['draft: latitude out of range is refused', 'super1', 'set', D, draft({ data: { location: { lat: 91, lon: 0 } } }), false],
  ['draft: hub visibility must be true or false', 'super1', 'set', D, draft({ data: { visibility: { more: { wifi: 'yes' } } } }), false],
  ['draft: a fifth quick action is refused', 'super1', 'set', D, draft({ data: { quickActions: ['a', 'b', 'c', 'd', 'e'] } }), false],
  ['draft: claim with a stray key is refused', 'super1', 'set', `${D}/lock`, { id: 'l1', at: iso, by: 's@x.test', op: 'publish', extra: 1 }, false],

  // ── releases: Super Admin reads; a release is added, never changed or removed ────────────────────────
  ['releases: super reads', 'super1', 'read', R, undefined, true],
  ['releases: manager CANNOT read', 'mgrA', 'read', R, undefined, false],
  ['releases: guest CANNOT read', null, 'read', R, undefined, false],
  ['releases: super adds a release', 'super1', 'set', `${R}/r2abc`, release(), true],
  ['releases: super adds one with an empty snapshot', 'super1', 'set', `${R}/r3abc`, { at: iso, by: 's@x.test', kind: 'baseline', summary: ['x'] }, true],
  ['releases: super CANNOT overwrite an existing release', 'super1', 'set', `${R}/r1abc`, release({ summary: ['rewritten'] }), false],
  ['releases: super CANNOT delete a release', 'super1', 'set', `${R}/r1abc`, null, false],
  ['releases: super CANNOT edit a field of a release', 'super1', 'set', `${R}/r1abc/by`, 'someone@x.test', false],
  ['releases: manager CANNOT add one', 'mgrA', 'set', `${R}/r2abc`, release(), false],
  ['releases: guest CANNOT add one', null, 'set', `${R}/r2abc`, release(), false],
  ['releases: invalid kind is refused', 'super1', 'set', `${R}/r2abc`, release({ kind: 'delete' }), false],
  ['releases: missing time is refused', 'super1', 'set', `${R}/r2abc`, { by: 's@x.test', kind: 'publish', snapshot: { a: 1 } }, false],
  ['releases: id not in the app’s format is refused', 'super1', 'set', `${R}/Evil`, release(), false],
  ['releases: summary line over 600 characters is refused', 'super1', 'set', `${R}/r2abc`, release({ summary: [long(601)] }), false],
  ['releases: unknown field is refused', 'super1', 'set', `${R}/r2abc`, release({ extra: 1 }), false],
  ['releases: a release for another hub by a manager of this hub is refused', 'mgrA', 'set', `hubs/${HB}/releases/r2abc`, release(), false],

  // ── releaseCurrent ───────────────────────────────────────────────────────────────────────────
  ['releaseCurrent: super reads', 'super1', 'read', `hubs/${H}/releaseCurrent`, undefined, true],
  ['releaseCurrent: manager CANNOT read', 'mgrA', 'read', `hubs/${H}/releaseCurrent`, undefined, false],
  ['releaseCurrent: guest CANNOT read', null, 'read', `hubs/${H}/releaseCurrent`, undefined, false],
  ['releaseCurrent: super sets it', 'super1', 'set', `hubs/${H}/releaseCurrent`, 'r2abc', true],
  ['releaseCurrent: manager CANNOT set it', 'mgrA', 'set', `hubs/${H}/releaseCurrent`, 'r2abc', false],
  ['releaseCurrent: guest CANNOT set it', null, 'set', `hubs/${H}/releaseCurrent`, 'r2abc', false],
  ['releaseCurrent: not an id is refused', 'super1', 'set', `hubs/${H}/releaseCurrent`, '../x', false],
  ['releaseCurrent: over 64 characters is refused', 'super1', 'set', `hubs/${H}/releaseCurrent`, `r${long(64)}`, false],
  ['releaseCurrent: a number is refused', 'super1', 'set', `hubs/${H}/releaseCurrent`, 5, false],

  // ── publish and restore as the app writes them: one multi-path update ──────────────────────────────
  ['publish: super writes settings, release, pointer, history and clears the draft in one update', 'super1', 'update', `hubs/${H}`, { 'settings/contacts': { phone: '2' }, 'releases/rnew1': release(), releaseCurrent: 'rnew1', [`audit/2026-10/anew1`]: entry({ by: 's@x.test', action: 'publish', summary: 'Contacts', releaseId: 'rnew1' }), 'settingsDraft/data': null, 'settingsDraft/version': 2, 'settingsDraft/updatedAt': iso, 'settingsDraft/updatedBy': 's@x.test' }, true],
  ['publish: the same update from a manager is refused as a whole', 'mgrA', 'update', `hubs/${H}`, { 'settings/contacts': { phone: '2' }, 'releases/rnew1': release(), releaseCurrent: 'rnew1' }, false],
  ['publish: an update that also rewrites an old history line is refused as a whole', 'super1', 'update', `hubs/${H}`, { 'settings/contacts': { phone: '2' }, 'audit/2026-10/a1/summary': 'tampered' }, false],

  // ── audit: Super Admin reads; staff append as themselves; nobody edits or deletes ─────────────────────
  ['audit: super reads', 'super1', 'read', `hubs/${H}/audit`, undefined, true],
  ['audit: manager of the hub CANNOT read', 'mgrA', 'read', `hubs/${H}/audit`, undefined, false],
  ['audit: super_manager CANNOT read', 'smA', 'read', `hubs/${H}/audit`, undefined, false],
  ['audit: another hub manager CANNOT read', 'mgrB', 'read', `hubs/${H}/audit`, undefined, false],
  ['audit: guest CANNOT read', null, 'read', `hubs/${H}/audit`, undefined, false],
  ['audit: manager appends a line as themselves', 'mgrA', 'set', `${A}/anew`, entry(), true],
  ['audit: manager appends a line with before and after values', 'mgrA', 'set', `${A}/anew`, entry({ hub: H, fields: { wifi: 'Wi-Fi' }, changes: { Wifi: { before: 'Network "x"', after: 'Network "y"' } } }), true],
  ['audit: super appends a line as themselves', 'super1', 'set', `${A}/anew`, entry({ by: 's@x.test' }), true],
  ['audit: line naming someone else as actor is refused', 'mgrA', 'set', `${A}/anew`, entry({ by: 's@x.test' }), false],
  ['audit: line with no actor email match (scheduler name) is refused for staff', 'mgrA', 'set', `${A}/anew`, entry({ by: 'scheduler' }), false],
  ['audit: manager CANNOT edit an existing line', 'mgrA', 'set', `${A}/a1/summary`, 'tampered', false],
  ['audit: manager CANNOT replace an existing line', 'mgrA', 'set', `${A}/a1`, entry(), false],
  ['audit: manager CANNOT delete a line', 'mgrA', 'set', `${A}/a1`, null, false],
  ['audit: manager CANNOT delete a month of history', 'mgrA', 'set', `hubs/${H}/audit/2026-10`, null, false],
  ['audit: manager CANNOT delete all history', 'mgrA', 'set', `hubs/${H}/audit`, null, false],
  ['audit: super CANNOT edit a line', 'super1', 'set', `${A}/a1/summary`, 'tampered', false],
  ['audit: super CANNOT delete a line', 'super1', 'set', `${A}/a1`, null, false],
  ['audit: super_manager CANNOT delete history', 'smA', 'set', `hubs/${H}/audit`, null, false],
  ['audit: another hub manager CANNOT append here', 'mgrB', 'set', `${A}/anew`, entry({ by: 'b@x.test' }), false],
  ['audit: manager CANNOT append to another hub', 'mgrA', 'set', `hubs/${HB}/audit/2026-10/anew`, entry(), false],
  ['audit: deactivated manager CANNOT append', 'offA', 'set', `${A}/anew`, entry({ by: 'off@x.test' }), false],
  ['audit: guest CANNOT append', null, 'set', `${A}/anew`, entry(), false],
  ['audit: no-role account CANNOT append', 'noRole', 'set', `${A}/anew`, entry({ by: 'n@x.test' }), false],
  ['audit: line without a summary is refused', 'mgrA', 'set', `${A}/anew`, { at: iso, by: 'a@x.test', action: 'notify' }, false],
  ['audit: summary over 1000 characters is refused', 'mgrA', 'set', `${A}/anew`, entry({ summary: long(1001) }), false],
  ['audit: unknown field is refused', 'mgrA', 'set', `${A}/anew`, entry({ password: 'secret' }), false],
  ['audit: month key not in the YYYY-MM format is refused', 'mgrA', 'set', `hubs/${H}/audit/everything/anew`, entry(), false],
  ['audit: a before value over 300 characters is refused', 'mgrA', 'set', `${A}/anew`, entry({ changes: { X: { before: long(301), after: 'y' } } }), false],

  // ── notifyLog: duplicate guard, staff of the hub only, one number per message hash ─────────────────────
  ['notifyLog: manager reads own hub', 'mgrA', 'read', `hubs/${H}/notifyLog`, undefined, true],
  ['notifyLog: manager CANNOT read another hub', 'mgrA', 'read', `hubs/${HB}/notifyLog`, undefined, false],
  ['notifyLog: guest CANNOT read', null, 'read', `hubs/${H}/notifyLog`, undefined, false],
  ['notifyLog: manager claims a message', 'mgrA', 'set', `${N}/${'b'.repeat(24)}`, 1761700100000, true],
  ['notifyLog: manager gives a claim back (writes 0)', 'mgrA', 'set', `${N}/${KEY}`, 0, true],
  ['notifyLog: manager CANNOT write another hub', 'mgrA', 'set', `hubs/${HB}/notifyLog/${'b'.repeat(24)}`, 1761700100000, false],
  ['notifyLog: guest CANNOT write', null, 'set', `${N}/${'b'.repeat(24)}`, 1761700100000, false],
  ['notifyLog: deactivated manager CANNOT write', 'offA', 'set', `${N}/${'b'.repeat(24)}`, 1761700100000, false],
  ['notifyLog: key that is not a message hash is refused', 'mgrA', 'set', `${N}/anything-goes`, 1761700100000, false],
  ['notifyLog: text instead of a number is refused', 'mgrA', 'set', `${N}/${'b'.repeat(24)}`, 'sent', false],
  ['notifyLog: an object is refused', 'mgrA', 'set', `${N}/${'b'.repeat(24)}`, { at: 1 }, false],

  // ── notifyJobs: queue and cancel only ──────────────────────────────────────────────────────────────
  ['notifyJobs: manager reads own hub', 'mgrA', 'read', J, undefined, true],
  ['notifyJobs: manager CANNOT read another hub', 'mgrA', 'read', `hubs/${HB}/notifyJobs`, undefined, false],
  ['notifyJobs: guest CANNOT read', null, 'read', J, undefined, false],
  ['notifyJobs: manager queues a send as themselves', 'mgrA', 'set', `${J}/jnew`, job(), true],
  ['notifyJobs: super queues a send as themselves', 'super1', 'set', `${J}/jnew`, job({ by: 's@x.test' }), true],
  ['notifyJobs: queueing for someone else is refused', 'mgrA', 'set', `${J}/jnew`, job({ by: 'b@x.test' }), false],
  ['notifyJobs: queueing into another hub is refused', 'mgrA', 'set', `hubs/${HB}/notifyJobs/jnew`, job(), false],
  ['notifyJobs: guest CANNOT queue', null, 'set', `${J}/jnew`, job(), false],
  ['notifyJobs: deactivated manager CANNOT queue', 'offA', 'set', `${J}/jnew`, job({ by: 'off@x.test' }), false],
  ['notifyJobs: a job created already "done" is refused', 'mgrA', 'set', `${J}/jnew`, job({ status: 'done' }), false],
  ['notifyJobs: a start time days away is refused', 'mgrA', 'set', `${J}/jnew`, job({ runAfter: 4102444800000 }), false],
  ['notifyJobs: email body over 3000 characters is refused', 'mgrA', 'set', `${J}/jnew`, job({ content: { pushTitle: 'a', pushBody: 'b', emailType: 'announcement', emailTitle: 'a', emailBody: long(3001) } }), false],
  ['notifyJobs: push body over 300 characters is refused', 'mgrA', 'set', `${J}/jnew`, job({ content: { pushTitle: 'a', pushBody: long(301), emailType: 'announcement', emailTitle: 'a', emailBody: 'b' } }), false],
  ['notifyJobs: unknown content field is refused', 'mgrA', 'set', `${J}/jnew`, job({ content: { pushTitle: 'a', pushBody: 'b', emailType: 'announcement', emailTitle: 'a', emailBody: 'b', cc: 'x' } }), false],
  ['notifyJobs: job with a path-like id is refused', 'mgrA', 'set', `${J}/j.new`, job(), false],
  ['notifyJobs: manager cancels a queued job', 'mgrA', 'set', `${J}/jq`, job({ status: 'canceled', canceledBy: 'a@x.test', canceledAt: iso }), true],
  ['notifyJobs: manager CANNOT cancel one that has started', 'mgrA', 'set', `${J}/jsend`, job({ status: 'canceled' }), false],
  ['notifyJobs: manager CANNOT re-queue a cancelled job', 'mgrA', 'set', `${J}/jcan`, job(), false],
  ['notifyJobs: manager CANNOT mark a job done', 'mgrA', 'set', `${J}/jq/status`, 'done', false],
  ['notifyJobs: manager CANNOT delete a job', 'mgrA', 'set', `${J}/jq`, null, false],
  ['notifyJobs: another hub manager CANNOT cancel', 'mgrB', 'set', `${J}/jq`, job({ status: 'canceled' }), false],

  // ── visit counters guests write on the legacy hubs ──────────────────────────────────────────────────
  ['counter: guest adds one', null, 'set', `hubs/${H}/analytics/count`, 6, true],
  ['counter: guest CANNOT add two at once', null, 'set', `hubs/${H}/analytics/count`, 7, false],
  ['counter: guest CANNOT reset to zero', null, 'set', `hubs/${H}/analytics/count`, 0, false],
  ['counter: guest CANNOT delete it (a delete is a reset)', null, 'set', `hubs/${H}/analytics/count`, null, false],
  ['counter: guest CANNOT write text', null, 'set', `hubs/${H}/analytics/count`, 'many', false],
  ['counter: guest CANNOT delete lastAccess', null, 'set', `hubs/${H}/analytics/lastAccess`, null, false],
  ['counter: guest CANNOT delete the whole analytics record', null, 'set', `hubs/${H}/analytics`, null, false],
  ['counter: guest CANNOT delete the global counter', null, 'set', '_global/parkhub_analytics/count', null, false],
  ['counter: guest CANNOT inflate the global counter', null, 'set', '_global/parkhub_analytics/count', 500, false],
  ['counter: guest still adds one to the global counter', null, 'set', '_global/parkhub_analytics/count', 11, true],
]
