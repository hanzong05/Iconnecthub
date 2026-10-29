# Staging setup and test checklist

Nothing here has been executed against a real staging project. This environment cannot reach Firebase, Cloudflare, Resend, FCM or any hosting dashboard (the network proxy answers 403). Every "NOT RUN" row below is something **you** must run. "RUN HERE" rows ran in a local stand-in (Miniflare/workerd, targaryen, a mock backend) and say which.

## A. Isolated staging environment (one-time)

Rule: staging shares **nothing** with production: separate Firebase project, separate worker, separate keys, separate sender and inbox.

1. **Firebase project** `iconnecthub-staging` (new). Enable Realtime Database and Email/Password sign-in. Create a database; do not import production data. Seed 2 hubs (`stg-hub-a`, `stg-hub-b`) with `hubs_meta/{id}` = `{name, active:true, timezone}` and **fake guests**.
2. **Staff accounts** (fake emails on an inbox you control) with `users/{uid}`: one `super`, one `super_manager` and one `manager` per hub, one `manager` with `active:false`, one signed-in user with **no** `users/{uid}` profile.
3. **Rules**: paste `database.rules.proposed.json` into the staging project only.
4. **Test inbox**: a Resend test domain or Mailtrap inbox. Set `RESEND_*` on the staging worker only.
5. **Test push device**: one phone (iOS 16.4+ installed to the home screen, or Android Chrome) subscribed to a staging guest hub only. Use FCM/VAPID keys generated for staging.
6. **Staging worker**: deploy `push-notification-worker.proposed.js` as `iconnecthub-push-staging`. Settings: cron `* * * * *`; `SCHEDULER_ENABLED=true`; `ADMIN_ORIGIN=<staging admin URL>`; `VAPID_*`, `RESEND_*`, service-account secret for the **staging** project; `FIREBASE_DATABASE_URL=<staging url>`. Never reuse a production secret.
7. **Admin app**: a separate deployment or local run with `.env` pointing at the staging project and `SCHEDULER_MODE=worker`.
8. **Guest hub copy**: copy ONE legacy hub HTML to a scratch location, change only its `databaseURL`/project config to staging, serve it from a non-production host. Do not touch the production files.

## B. Test checklist

| # | Test | How | Status |
|---|---|---|---|
| 1 | Rules, strict, 117 cases (roles, cross-hub, deactivated, no profile, guests, chat, analytics, onboarding, push, FCM, guestMap) | `rules.targaryen.cjs` | RUN HERE: 117/117 (targaryen, third-party engine) |
| 2 | Rules, every write the 19 hubs make, replayed with real payload shapes | `rules.legacy-paths.targaryen.cjs` | RUN HERE: 60/60 (targaryen) |
| 3 | Same cases in Google's real emulator, strict | `rules.emulator.test.mjs` | **PASS 48/48** (2026-10-29, run on the owner's PC: Node 24, JDK 21.0.12, emulator jar v4.11.2, RULES=strict). Compat: not needed, not run |
| 4 | Rules Playground spot checks on staging for `update()` on a guest record | Firebase console | **NOT RUN** |
| 5 | Cron: no dashboard open, due announcement publishes once | `cron.workerd.mjs` | RUN HERE: 26/26 in workerd with fake database/sends. **NOT RUN** on real Cloudflare cron |
| 6 | Duplicate prevention, retries (1/5/15 min, 3 attempts), lease, notification preferences off, inactive hub, time zones, DST, recovery after a crash | `cron.workerd.mjs`, `scheduler.test.ts` | RUN HERE (fake clock). **NOT RUN** against real services |
| 7 | Real cron trigger fires every minute and cold-start time stays within limits | Cloudflare dashboard logs for 30 min | **NOT RUN** |
| 8 | Real delivery of one test push to the test device, one test email to the test inbox | staging worker | **NOT RUN** |
| 9 | Event alert at a real DST boundary (US: 2026-11-01 01:30 America/New_York) | set a staging event at that local time | **NOT RUN** (logic RUN HERE with fake clock) |
| 10 | Path Finder: map creation, selection, publish, guest display | `scripts/e2e/guest-map.e2e.cjs` against a mock backend | RUN HERE: 22/22 in Chromium (admin at 1400 px, guest at an emulated 390 px width; no touch emulation, no horizontal scroll at 390 px). **NOT RUN** on real staging or a real phone |
| 11 | Path Finder on a phone (touch, pinch, rotate) | real device against the staging guest hub | **NOT RUN** |
| 12 | All 19 legacy hubs: paths and payload shapes covered by the rules | static analysis of the 19 files (see report) | RUN HERE (read-only). **NOT RUN** in a browser |
| 13 | One legacy hub copy pointed at staging: register guest, subscribe push, chat both ways, visit counter, departure clean-up | manual, browser + phone | **NOT RUN** |
| 14 | Carolina Camp Cedar group scorecard (needs the new `scorecardRounds` rule) | manual on the staging copy | **NOT RUN** (rule RUN HERE in targaryen) |
| 15 | Kill switch: `SCHEDULER_ENABLED=false` stops the cron on the next minute | staging worker | RUN HERE in workerd. **NOT RUN** on Cloudflare |
| 16 | Rollback drill: re-paste `rollback/live-rules-AS-PASTED-by-owner.json` into staging; redeploy `*.original.js` | staging only | **NOT RUN** |

## C. Pass criteria before asking for production approval
- Rows 3, 4, 7, 8, 11, 13, 14, 16 done and green; any failure of row 3 for the strict file means switch to compat only after the trade-off in the report is accepted.
- No production secret, URL or data used anywhere above.
- The owner's profile and every staff profile exist in the production `users` node with a `role` (checked read-only in the Firebase console), the sign-up setting is verified, and the deployed worker versions match `rollback/*.owner-copy.js` by checksum.
