# Review files (Phases 2, 3 and staging validation) — NOTHING HERE IS DEPLOYED OR PUBLISHED

Everything in this folder is for review. Nothing has been published to Firebase, deployed to Cloudflare, or used to send a real notification.

| File | What it is |
| --- | --- |
| `database.rules.current-pasted.json` | The rules text the owner pasted. Used as the "before" in tests. |
| `database.rules.proposed.json` | Tightened rules (F-04, Phase 3 legacy-hub paths, `guestMap`). Built by `build-rules.mjs`. **Preferred.** |
| `database.rules.proposed-compat.json` | Same rules, but a guest record is one rule on the whole record instead of per-field rules. **Fallback** if the real emulator shows the preferred per-field form refuses a legacy hub write (see "Unverified" below). |
| `rollback/` | Copies of the previous configuration: the owner's three dated rules files, the rules text as pasted (treated as the live baseline), all five owner worker files, and `SHA256SUMS.txt`. **Start here to roll back.** |
| `STAGING.md` | Staging setup and the test checklist, each row marked RUN HERE or NOT RUN. |
| `delete-user-worker.original.js` / `.proposed.js` | F-01: explicit super role, no profile-less super, uid check, audit. |
| `pathfinder-worker.original.js` / `.proposed.js` | F-01: same one-line fix. |
| `push-notification-worker.original.js` / `.proposed.js` | F-17 (role/hub checks, deactivation, welcome-email limits) **plus Phase 3: a per-minute scheduler** for announcements and event alerts (F-06, F-08). |

Regenerate the rules with `node security/review/build-rules.mjs`.

## Tests (all run with `npx vitest run`)
`scripts/rules.test.ts`, `scripts/legacy-hubs.test.ts` (legacy guest flows against strict and compat rules), `scripts/scheduler.test.ts` (32 tests, fake database with ETag semantics), `scripts/{delete-user,pathfinder,push}-worker.test.ts`, `app/actions/{guestmap,hubcontent,hubs,settings,pathfinder}.test.ts`, `lib/pathfinder/guestMap.test.ts`.
Staging (`scripts/staging/`, run by hand, see each file's header): `cron.workerd.mjs` (the proposed worker in the real Workers runtime, 26/26), `rules.targaryen.cjs` (117/117) and `rules.legacy-paths.targaryen.cjs` (60/60) in the third-party targaryen engine, and `rules.emulator.test.mjs` for **Google's real emulator, NOT RUN**.
Browser: `scripts/e2e/` (see its README) — admin creates a map, chooses it, publishes; the guest app shows it.

`rules-sim.ts` is a local evaluator, **not** the Firebase emulator (its download is blocked in this environment). It models cascading `.read/.write`, `.validate` on the written node and its descendants, and `$wildcards`. Before publishing, repeat `scripts/rules.test.ts` and `scripts/legacy-hubs.test.ts` cases in the Firebase Console Rules Playground or the real emulator.

## What Phase 3 changed (summary; the full report is in the review document)
- **F-06 / F-08 scheduling.** The push worker gets `scheduled()` (cron `* * * * *`). It publishes due announcements, sends event "starting now" alerts in the **hub's own time zone** (`hubs_meta/{id}/timezone`), and notifies guests through the same rules as an immediate send: author still allowed, hub active, `settings/guestNotifications` not off, `notifyOnPublish` respected, 10-minute duplicate guard, audit entry, bounded retries with a lease. It uses the service account, so the strict rules do not affect it.
- **App.** New env `SCHEDULER_MODE` = `page` (default; old behaviour while an admin page is open, now routed through the shared notify rules) or `worker` (page timers do nothing). Hub time zone is set by a Super Admin in *Edit hub details*. Scheduled posts store `notifyOnPublish`; blocked/expired scheduled posts show a status.
- **F-05 Path Finder for guests.** New Settings option "Path Finder map" (previously impossible to choose; an existing choice was silently turned into "embed" on load). Publishing writes a public read-only copy at `hubs/{id}/guestMap` (picture + named places only; no roads, access points, calibration, editor names). The guest app reads only that copy. Private maps cannot be chosen or published.
- **Legacy hubs.** `onboardingEvents`, `webPushSubs`, `fcmTokens` were missing from the pasted rules. They are now listed with shape/size validation and key patterns; guest chat messages cannot be edited, deleted or forged as admin; visit counters can only go up by 1; guest records cannot be invented from a browser.
- **Staging-validation fixes to the proposed rules.** Replaying every write the 19 hubs make found three gaps, all fixed and tested in targaryen: (1) a guest could not mark a manager's message read (`readByGuest`), so the unread bubble would never clear; (2) the group scorecard of Carolina Camp Cedar (`scorecardRounds`) had no rule in any version, including the pasted one, so it is denied today; a bounded rule was added (room code must be 4 digits, a room is created once and cannot be overwritten, slots p1-p4 only, scores 0-99); (3) the compat variant allowed a non-https push endpoint.
- **Guest app bug fixed.** A hook was declared after an early return, which crashed the live guest page on load (React error 310). Found by the browser run; fixed in `guest-app/src/App.tsx`; `guest-app/dist/bluespot-hub.js` rebuilt.

## Before anything is deployed (needs the owner's approval, in this order)
1. **Verify, do not assume** (no access from here): the live database rules; whether sign-up is open; the owner's `users/{uid}` profile and role; the deployed versions of the three workers; where the admin app is hosted. Save a copy of the live rules in `GHL/firebase-rules/` (rollback).
2. Every staff account must have `users/{uid}` with a `role`. Without one, the new rules and workers give no access. Set `OWNER_UID` on the workers only if the owner has no profile yet, and remove it afterwards.
3. Run the rules cases in the real emulator or Rules Playground. If `update()` on a guest record is refused by `database.rules.proposed.json`, use `database.rules.proposed-compat.json` instead.
4. Deploy the push worker to a **staging** worker first with the cron `* * * * *`, `SCHEDULER_ENABLED=true`, `ADMIN_ORIGIN`, `VAPID_*`, `RESEND_*`; point it at a test database and test guests. Confirm the cron actually fires, a due post publishes with no dashboard open, and a test notification is delivered to a test device only.
5. Set a time zone on every hub (Edit hub details). Hubs without one get no server event alerts; the worker records one audit line per day saying so.
6. Publish the rules, then the workers, then set the app's `SCHEDULER_MODE=worker`. Keep `page` until the cron is proven live.
7. Choose and publish the Path Finder map per hub in Settings.

## Rollback
- Scheduler: set `SCHEDULER_ENABLED=false` on the push worker (takes effect on the next minute), remove the cron trigger, and set the app's `SCHEDULER_MODE=page`.
- Rules: re-publish the saved copy of the previous live rules.
- Workers: redeploy the `*.original.js` versions.
- Path Finder for guests: in Settings choose another map option and publish (the guest copy is removed), or delete `hubs/{id}/guestMap`.
- Nothing in this phase migrates or rewrites existing records; scheduled posts without `notifyOnPublish` are treated as "notify" (the old behaviour).

## Unverified (honest limits)
- Rules were checked in the project's own simulator and in targaryen (an independent third-party engine); **neither is Google's engine**. Whether Firebase checks a multi-field `update()` per field is therefore still unverified for the real service (hence the compat variant and `rules.emulator.test.mjs`).
- The pasted rules are a strict superset of the owner's newest dated file (they add 9 admin-only nodes and change nothing else), so the pasted text is treated as the live baseline. This could not be confirmed against the live project.
- Cloudflare Cron delivery, retries against the real Resend/Web Push services, and real time zone behaviour on Cloudflare have **not** been run. The logic is tested against a fake database and fake sends.
- The real `hubs/*/analytics` shape the 19 legacy hubs write was not available; if they write extra keys, the strict analytics rule may refuse them. Send a sample before publishing.
- Residual risk with unauthenticated guests: anyone can still add chat messages, push registrations and onboarding events (size/shape-limited). Stronger protection needs Firebase Anonymous Auth plus App Check in the 19 HTML hubs, or a rate-limited worker in front of those writes. This needs your approval because it edits the legacy hubs.
