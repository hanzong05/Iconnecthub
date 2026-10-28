# Settings drafts, publishing and history

Settings edits are saved as a **draft**. Guests only see **published** settings (`hubs/{hubId}/settings/*`, unchanged location).

New database nodes, all under `hubs/{hubId}` (additive; guest apps never read them):

| Node | Holds | Written by |
|---|---|---|
| `settingsDraft` | `version`, `updatedAt`, `updatedBy`, `data/<path>` with only the touched settings | Settings actions (Super Admin) |
| `releases/{id}` | Snapshot of the settings at each publish / restore / first-publish baseline | publish, restore |
| `releaseCurrent` | Id of the release that is live | publish, restore |
| `audit/{YYYY-MM}/{id}` | Who changed what, when | every Settings change |

## Rules to add (Super Admin write; managers no access)

```json
"settingsDraft": { ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'super'",
                   ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'super'" },
"releases":       { same as settingsDraft },
"releaseCurrent": { same as settingsDraft },
"audit":          { same as settingsDraft }
```
Adapt the role check to the rules already used for `settings`. Publishing writes `settings/*`, `releases`, `releaseCurrent`, `audit` and clears `settingsDraft` in one atomic update.

## Notes
- Restoring a version rewrites the draft from the snapshot and publishes it as a new release; sent notifications are not undone.
- Conflict warning: each save sends the draft version the page loaded; if someone saved since, the save is refused and the page offers a reload. Small race window (read, compare, write); acceptable for a handful of admins.
- Hub name, hub status and the password-reset notice apply immediately and are audited.

## Push safety (guest notifications)
- `hubs/{id}/settings/guestNotifications`: `false` = this hub never sends push or email to guests. Missing = on. Changed on the Settings page, takes effect at once, and is written to the history.
- `hubs/{id}/notifyLog/{hash}`: time the same message was last sent. The same message to the same hub within 10 minutes is refused. Managers need write access to this node and to `audit` for it to work; if rules refuse, the guard does nothing (it never blocks a send by itself failing).
- Every send is recorded in `audit` with who sent it and whether the worker accepted push and email.
- Announcement and event forms ask "Send now?" before saving when the notify box is ticked; Cancel saves and sends nothing.
- **Test send**: "Send a test to my device" on the announcement and event forms sends the message, marked [TEST], to the signed-in manager's own saved device only. It needs the patched push worker (`/send-test` route, in `GHL-new/cloudflare-worker/push-worker.patched.js`) and notifications turned on for that device first.
- **Worker patch** (not deployed by this project): the worker now checks the caller's role and hub before any send (before, any signed-in user, including a guest, could send to any hub or `_global`), refuses sends when `guestNotifications` is `false`, and escapes HTML in emails. Review and deploy it, then test with one hub.
