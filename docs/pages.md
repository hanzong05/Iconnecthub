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

## Menu items and page layouts (Super Admin)

The Super Admin adds custom More-menu items in Settings (Custom menu items): a direct link, a details page, or an items sheet. A details page can have a layout (`lib/template.ts`): components such as title, hero picture, description, gallery, list (rule, channel, contact or item rows), main call card, button and section heading, each with a name, required flag and row limit. Managers only fill the layout in; filling produces an ordinary page (`fillToPage`), so every length and https check in `lib/pages.ts` still applies. The layout is stored with the menu item in the settings draft and publishes with it. Without a layout, managers add blocks freely as before. The admin mini phone shows a layout with made-up content (`samplePage`) until real content exists; guests never see that.

### Filling a layout (managers)

A manager opens the page in Pages and sees one field group per component of the layout (no adding, removing or moving components). `savePageValuesAction` cleans the values (`cleanValues`), builds the page guests see (`fillToPage`) and stores it with the typed values under `pagesDraft/{id}/values`; publishing rebuilds the page from the values and the layout as it is then, refuses while a required field is empty, and keeps the values in `pages/{id}/values` and in the history so Restore brings the form back. A page with a layout refuses the free-form block action, so the layout cannot be bypassed. The database rules must allow a `values` child under `pages`, `pagesDraft` and `pageHistory` entries.

## Importing a hub's More-menu items (Super Admin, dry run first)
`node scripts/import-hub-menu.mjs path/to/hub.html > plan.json` reads a guest hub HTML file and prints a **plan**: custom menu items (link, sheet and details-page items with a layout and filled values). It never edits the HTML and never writes to the database.

In Settings → Custom menu items → "Import from a hub file", the Super Admin chooses `plan.json`. The server re-validates every item (same rules as the builder), then saves **drafts only**:
- menu items are merged by id into the settings draft; nothing reaches guests until the Super Admin places them in a group and publishes;
- each details-page item also gets a page draft (`pagesDraft/{id}`) with its values; pages that already have live or draft content are left alone (reported as "skipped");
- importing the same plan twice changes nothing (ids are deterministic).

Sheet rows can open a details page instead of an address ("A details page" in the row editor).

Known limits: pill chips and styling are folded into plain text; built-in features (Book Now, WiFi, Contact, …) are not imported; Amenities and Cable become custom items next to the built-in switches (hide the built-in ones if duplicated); pages whose source only held placeholder text are imported with an empty description. Checked against Stone Mountain Park's file only.

## Naming built-in menu items (Super Admin)
In Settings → Guest menu, each built-in item (WiFi, Contact, Weather, Newsletter, Send a Message, Leave a Review, Notification Settings, Register …) has a **Rename** link. The Super Admin types the name guests should see in More (40 characters at most, no `<` or `>`); empty puts the default name back.
- Saved as a draft under `settingsDraft/data/moreLabels/{itemId}` and published to `hubs/{id}/settings/moreLabels` with the other settings. Only built-in ids are accepted.
- An empty value stays in the draft (it is how a name that is already live gets cleared); readers ignore empty names, and publishing removes `moreLabels` when no names are left.
- The name wins over a manager's page title for that item in the More list. Custom items keep their own name (edited in the builder).
- The existing guest HTML hubs do not read `moreLabels`; only the new guest app does.
- Firebase rules: the new `settings/moreLabels` child must be writable by the same people who can write other `settings/*` children. Check this before publishing on a real hub.

## Adding a hub (Super Admin)
Hubs → **Add hub** asks for a name, an optional location and a Hub ID (suggested from the name; letters, numbers and dashes, 2–48, cannot be changed later). It creates `hubs_meta/{id}` (name, location, active, createdAt, createdBy) and never replaces an existing hub. Everything else (settings, pages, announcements) is created the first time it is saved. The new hub then appears in the list and can be opened in Settings. There is no delete button yet.
Firebase rules: the Super Admin must be allowed to create a new child under `hubs_meta`.

## Rules list (Super Admin, Settings → Rules)
Works like Contact: the Super Admin adds rules, each with a **title** (120 characters) and **details** (1500; line breaks and **bold** work), up to 40, and can reorder or remove them. Saved as a draft under `houseRules` and published with the other settings.
- Guests: when a hub has rules, the Rules item opens a page built from them (same look as a Rules page), with the optional "Rules link" shown last as "Full rules". With no rules, the Rules item works as before (the manager's published Rules page, or the link).
- The rules list wins over a manager's Rules page while it has rules. Emptying the list and saving clears it (stored as `false` in the draft; removed from live on publish).
- The old guest HTML hubs do not read `houseRules`; only the new guest app does.
