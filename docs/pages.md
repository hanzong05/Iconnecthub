# Pages: structured content for guest hubs

Managers fill fixed block types in **Pages** (admin) instead of editing hub HTML. Today: **Reservations** and **Rules** are drawn by the guest hubs; Amenities, Ways to Stay, Things to Do, Food & Shopping and Tickets & Specials can already be edited and published, and the guest app opens them from the More menu when published.

## Who can do what
- Manager: edits only their own hub. Super manager: their own hub. Super admin: the hub they are viewing (`?hub=`). Every action re-checks role and hub on the server.
- Block types: section heading, rule or detail, phone/link/email, picture, info card. Text supports only `**bold**` and line breaks. Links must be `https://`; phones become `tel:` links; no HTML is ever stored or rendered.

## Database nodes
- `hubs/{id}/pages/{pageId}`: the live page. Guests read this (public read, like `settings`).
- `hubs/{id}/pagesDraft/{pageId}`: the one draft per page (`version`, `baseAt`, `updatedAt`, `updatedBy`).
- `hubs/{id}/pageHistory/{pageId}/{historyId}`: published versions (newest 15 are shown) plus a `baseline` of the page before the first publish.
- Publishing is one atomic update: live page, history entry, audit line, draft removed. Publishing is refused if the live page changed after the draft was started, or if someone else saved the draft meanwhile.
- Restore loads a past version into the draft only; nothing changes for guests until it is published.

## Suggested rules (adapt the role checks to your existing ones)
```json
"pages":       { ".read": true,
                 ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'super' || root.child('users').child(auth.uid).child('hubId').val() === $hubId)" },
"pagesDraft":  { ".read": "<same as pages .write>", ".write": "<same as pages .write>" },
"pageHistory": { ".read": "<same as pages .write>", ".write": "<same as pages .write>" }
```
(inside `hubs/$hubId`). `audit` and `notifyLog` need the same manager write access described in `settings-publishing.md`.

## What guests see
- Guest app (React): More menu item opens the published page in a sheet; if the page is not published the item keeps its old behaviour.
- HTML hubs: `hub-corev1` replaces the Rules page body and the Reservations picker list from `hubs/{HUB_ID}/pages/rules` and `.../reservations`. If a page is missing, empty, or a hub lacks the element, the hardcoded content stays. Deploy the new `hub-corev1` to turn this on.

## One-time import of the content already in a hub's HTML
`node scripts/import-hub-pages.mjs path/to/hub.html` reads the HTML file and prints the Rules and Reservations pages as JSON. It is a **dry run**: it never edits the HTML and never writes to the database (there is no write option). Check the output, then add the blocks in the admin.

## Not covered yet
- Other hubs' HTML may use different markup; the importer and `hub-corev1` were checked against Stone Mountain Park's page only.
- Amenities and the other pages are not drawn by the HTML hubs yet (only by the guest app).
- Unpublishing a page is done by publishing an emptied page; an emptied page makes the hub fall back to its built-in content.

## The guest app matches the live hub layout

`guest-app` now draws the same screens as the live Stone Mountain hub (Home, Map, Events, Local Guide, More, Guest Services, WiFi, alerts sheet, event details, page overlay). Everything on screen comes from data managers edit:

| On screen | Managed in |
| --- | --- |
| Hub name, logo, three hero pictures, colors | Settings |
| Quick actions, tab order, More menu groups and visibility | Settings |
| WiFi, contacts, weather location, map, rules link, **local guide link** | Settings |
| Alerts | Announcements |
| Events and the date strip | Events |
| Reservations, Rules, Amenities and the other pages | Pages |

Notes:
- The local guide link is new (Settings → Local guide). With no link the Discover banner is hidden and the Local Guide tab says it is not set up.
- Styles live in `guest-app/src/hub.css` (taken from the live hub) plus `theme.ts` (manager colors). The old `styles.css` is gone.
- Embed height: the app fills `100dvh`; add `data-height="760px"` to the embed element to fix a height.
- Not in the guest app yet (it links to the classic hub when `data-classic-url` is set): registration, chat, reviews, newsletter, notification settings, cable, weather center.
