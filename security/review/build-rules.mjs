// Builds database.rules.proposed.json. REVIEW ONLY — nothing here is published.
// Run: node security/review/build-rules.mjs
import { writeFileSync } from 'node:fs'

const ME = "root.child('users').child(auth.uid)"
// Signed in, has a profile with a role, and is not deactivated (active missing counts as active).
const LIVE = `auth != null && ${ME}.child('role').exists() && ${ME}.child('active').val() !== false`
const ROLE = `${ME}.child('role').val()`
const SUPER = `${LIVE} && ${ROLE} === 'super'`
const SM = `${LIVE} && ${ROLE} === 'super_manager'`
const MY_HUB = `${ME}.child('hubId').val()`
// Super, or manager / super_manager of THIS hub ($hubId must be in scope).
const HUB_STAFF = `${LIVE} && (${ROLE} === 'super' || ((${ROLE} === 'manager' || ${ROLE} === 'super_manager') && ${MY_HUB} === $hubId))`
// ── Guest-facing (not signed in) writes the 19 legacy hubs make today ─────────────────────────────
// Guest records are CREATED by the registration worker (service account, bypasses rules). Browsers only
// update fields of a record that already exists, so unknown ids cannot create records or overwrite identity fields.
const GUEST_EXISTS = "root.child('hubs').child($hubId).child('guests').child($guestId).exists()"
const STR = (n) => `newData.isString() && newData.val().length <= ${n}`
const DATE_OR_EMPTY = "newData.isString() && newData.val().length <= 10"
const PUSH_SUB = "newData.hasChildren(['endpoint']) && newData.child('endpoint').isString() && newData.child('endpoint').val().length <= 2000 && newData.child('endpoint').val().matches(/^https:\\/\\//)"
const FCM_TOKEN = "newData.hasChildren(['token']) && newData.child('token').isString() && newData.child('token').val().length <= 4096"
const KEY_OK = '$k.matches(/^[A-Za-z0-9_:-]{1,200}$/)'
const SUPER_ONLY_NODE = { '.read': SUPER, '.write': SUPER }
const STAFF_NODE = { '.read': HUB_STAFF, '.write': HUB_STAFF }
const ROLES_OK = "(newData.child('role').val() === 'super' || newData.child('role').val() === 'super_manager' || newData.child('role').val() === 'manager')"

const rules = {
  rules: {
    hubs_meta: {
      '.read': true,
      $hubId: {
        // Create and delete: super only. Update an existing hub: its own staff (name, logo, active flag).
        '.write': `(${SUPER}) || ((${HUB_STAFF}) && data.exists() && newData.exists())`,
      },
    },
    users: {
      // Whole list: super and super_manager only (it holds every email address).
      '.read': `(${SUPER}) || (${SM})`,
      $uid: {
        // A person can always read their own profile (the app does this on every request).
        '.read': 'auth != null && auth.uid === $uid',
        // super: anyone. super_manager: only people in its own hub, never a super, never itself,
        // and cannot move someone into another hub or raise them to super.
        '.write': `(${SUPER}) || ((${SM}) && auth.uid !== $uid && data.child('role').val() !== 'super' && newData.child('role').val() !== 'super' && (data.child('hubId').val() === ${MY_HUB} || !data.exists()) && (newData.child('hubId').val() === ${MY_HUB} || !newData.exists()))`,
        '.validate': `!newData.exists() || (${ROLES_OK} && (!newData.child('active').exists() || newData.child('active').isBoolean()))`,
        // Own push subscription only.
        webPushSub: { '.write': 'auth != null && auth.uid === $uid' },
      },
    },
    _global: {
      parkhub_analytics: {
        '.read': true,
        '.write': SUPER,
        count: { '.write': true, '.validate': "newData.isNumber() && newData.val() >= (data.exists() ? data.val() : 0) && newData.val() <= (data.exists() ? data.val() : 0) + 1" },
        lastAccess: { '.write': true, '.validate': STR(40) },
        accessTimes: { '.write': true, $i: { '.validate': '$i.matches(/^[0-9]{1,3}$/)', timestamp: { '.validate': STR(40) } } },
      },
    },
    hubs: {
      $hubId: {
        guests: {
          '.read': HUB_STAFF, // was: any signed-in account
          '.write': HUB_STAFF, // the admin app deletes guests
          $guestId: {
            '.read': true, // a guest reads their own record by their private id (unchanged)
            // COMPAT variant (see bottom): a single rule on the whole record instead of per-field rules.
            webPushSub: { '.write': GUEST_EXISTS, '.validate': `!newData.exists() || (${PUSH_SUB})` },
            fcmToken: { '.write': GUEST_EXISTS, '.validate': `!newData.exists() || (${FCM_TOKEN})` },
            stayDetails: {
              '.write': GUEST_EXISTS,
              arrivalDate: { '.validate': DATE_OR_EMPTY },
              departureDate: { '.validate': DATE_OR_EMPTY },
              $other: { '.validate': false },
            },
            geofence: {
              '.write': GUEST_EXISTS,
              active: { '.validate': 'newData.isBoolean()' },
              updatedAt: { '.validate': STR(40) },
              $other: { '.validate': false },
            },
            arrivalDate: { '.write': GUEST_EXISTS, '.validate': `!newData.exists() || (${DATE_OR_EMPTY})` },
            departureDate: { '.write': GUEST_EXISTS, '.validate': `!newData.exists() || (${DATE_OR_EMPTY})` },
          },
        },
        chats: {
          '.read': HUB_STAFF, // was: any signed-in account
          '.write': HUB_STAFF,
          $sessionId: {
            '.read': true, // a guest reads their own thread by its private id (unchanged)
            // Guests may only add their own messages and update the thread summary fields they already update.
            messages: {
              $messageId: {
                '.write': "!data.exists()", // a posted message cannot be edited or removed by a guest
                '.validate': "newData.hasChildren(['text', 'sender']) && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 2000 && (auth != null || newData.child('sender').val() === 'guest' || (data.exists() && newData.child('sender').val() === data.child('sender').val()))",
                id: { '.validate': STR(64) },
                text: { '.validate': STR(2000) },
                sender: { '.validate': "newData.val() === 'guest' || newData.val() === 'admin'" },
                senderName: { '.validate': STR(120) },
                at: { '.validate': STR(40) },
                readByAdmin: { '.validate': 'newData.isBoolean()' },
                // A guest marking a manager's message as read (legacy hubs do this when the thread is opened): false -> true only.
                readByGuest: { '.write': 'data.exists() && data.val() === false && newData.val() === true', '.validate': 'newData.isBoolean()' },
                $other: { '.validate': false },
              },
            },
            guestName: { '.write': true, '.validate': STR(120) },
            lastMessage: { '.write': true, '.validate': STR(2000) },
            lastAt: { '.write': true, '.validate': STR(40) },
            unreadAdmin: { '.write': true, '.validate': 'newData.isBoolean()' },
            unreadGuest: { '.write': true, '.validate': 'newData.isBoolean()' },
          },
        },
        announcements: { '.read': true, '.write': HUB_STAFF }, // was: any signed-in account
        activities: { '.read': true, '.write': HUB_STAFF },
        // Visit counter: public write is how the legacy hubs count visits. It may only count up by one at a time.
        analytics: {
          '.read': true,
          '.write': HUB_STAFF,
          count: { '.write': true, '.validate': "newData.isNumber() && newData.val() >= (data.exists() ? data.val() : 0) && newData.val() <= (data.exists() ? data.val() : 0) + 1" },
          lastAccess: { '.write': true, '.validate': STR(40) },
        },
        // Public, read-only copy of the chosen Path Finder map (picture and named places only). Written by a Super Admin.
        guestMap: { '.read': true, '.write': SUPER, '.validate': "newData.hasChildren(['campgroundId', 'imageUrl', 'width', 'height'])" },
        settings: { '.read': true, '.write': HUB_STAFF }, // was: any signed-in account
        // Paths the old guest hubs write today but the pasted rules do not list (see report).
        // Anonymous, shape-checked: a push registration or a funnel event has no guest account behind it.
        onboardingEvents: {
          '.read': HUB_STAFF,
          '.write': HUB_STAFF,
          $eventId: {
            '.write': '!data.exists()',
            '.validate': "newData.hasChildren(['event']) && newData.child('event').isString() && newData.child('event').val().length <= 80",
            event: { '.validate': STR(80) },
            at: { '.validate': STR(40) },
            $other: { '.validate': "newData.isString() && newData.val().length <= 200 || newData.isNumber() || newData.isBoolean()" },
          },
        },
        // Group mini-golf scorecard (only carolina-camp-cedar uses it). Anonymous by design: a round is a 4-digit room code.
        // No listing of rooms; a room can be created once (never overwritten), a player slot claimed once, a score is a small number.
        scorecardRounds: {
          '.write': HUB_STAFF,
          $course: {
            $code: {
              '.read': true,
              '.write': '!data.exists() && $code.matches(/^[0-9]{4}$/) && $course.matches(/^[a-z0-9_]{1,20}$/)',
              '.validate': "newData.hasChildren(['players'])",
              createdAt: { '.validate': STR(40) },
              course: { '.validate': STR(80) },
              players: {
                $slot: {
                  '.write': '!data.exists() && $slot.matches(/^p[1-4]$/)',
                  '.validate': "newData.hasChildren(['name']) && newData.child('name').isString() && newData.child('name').val().length <= 60",
                  name: { '.validate': STR(60) },
                  scores: { $hole: { '.write': true, '.validate': "$hole.matches(/^[0-9]{1,2}$/) && newData.isNumber() && newData.val() >= 0 && newData.val() <= 99" } },
                  $other: { '.validate': false },
                },
              },
              $other: { '.validate': false },
            },
          },
        },
        webPushSubs: { '.read': HUB_STAFF, '.write': HUB_STAFF, $k: { '.write': KEY_OK, '.validate': PUSH_SUB } },
        fcmTokens: { '.read': HUB_STAFF, '.write': HUB_STAFF, $k: { '.write': KEY_OK, '.validate': FCM_TOKEN } },
        pathfinder: SUPER_ONLY_NODE,
        settingsDraft: SUPER_ONLY_NODE,
        releases: SUPER_ONLY_NODE,
        releaseCurrent: SUPER_ONLY_NODE,
        audit: { '.read': SUPER, '.write': HUB_STAFF },
        notifyLog: STAFF_NODE,
        pages: { '.read': true, '.write': HUB_STAFF },
        pagesDraft: STAFF_NODE,
        pageHistory: STAFF_NODE,
      },
    },
    hub_intake: { '.read': `${LIVE}`, '.write': true },
    hub_intake_v2: { '.read': `${LIVE}`, '.write': true },
    hub_intake_drafts: { '.read': `${LIVE}`, '.write': true },
    '.read': false,
    '.write': false,
  },
}

writeFileSync(new URL('./database.rules.proposed.json', import.meta.url), JSON.stringify(rules, null, 2) + '\n')

// Fallback if the real emulator shows that update() on a guest record is checked at the record, not per field:
// the record is writable by anyone, but only when it already exists (the registration worker creates it).
const compat = structuredClone(rules)
// Keep the SHAPE checks (https push endpoint, size limits, no stray keys) but grant the write once, at the record.
const stripWrites = (n) => Object.fromEntries(Object.entries(n).filter(([k]) => k !== '.write').map(([k, v]) => [k, v && typeof v === 'object' ? stripWrites(v) : v]))
const strictChildren = Object.fromEntries(Object.entries(rules.rules.hubs.$hubId.guests.$guestId).filter(([k]) => !k.startsWith('.')))
compat.rules.hubs.$hubId.guests.$guestId = { '.read': true, '.write': GUEST_EXISTS, ...stripWrites(strictChildren) }
writeFileSync(new URL('./database.rules.proposed-compat.json', import.meta.url), JSON.stringify(compat, null, 2) + '\n')
console.log('written')
