# Guest app (React) for GoHighLevel

A read-only React guest hub that builds to **one script**, `bluespot-hub.js` (about 75 KB gzipped). It reads the hub's published settings, announcements and events from the database, so Settings changes show up without editing any HTML.

## Embed (GHL custom code / HTML block)
```html
<div data-bluespot-hub="stone-mountain-park-hub"
     data-db="https://bluespot-hub-default-rtdb.firebaseio.com"
     data-classic-url="https://hub.bluespotguide.com/stone-mountain-park"></div>
<script src="https://hub.bluespotguide.com/bluespot-hub.js" defer></script>
```
- `data-bluespot-hub`: the hub id. `data-db`: the database address (must be https). `data-classic-url` (optional): the current HTML hub, used for features not in the new app yet.
- The app lives in a shadow DOM, so the GHL page's styles cannot change it.

## Build and test
- `npm run build:guest` writes `guest-app/dist/bluespot-hub.js`. Host that file next to `hub-corev1.js` on the Cloudflare worker.
- `npm test` covers the pure logic in `src/model.ts`.

## What is in this pilot
Home (hero picture, quick actions, announcements, today's events), Events, Map (embed or image, plus directions), More (menu groups with hidden items removed), WiFi and Contact sheets, Rules link, colors, tab order. All come from the Settings page.

## Not in this pilot (still in the current HTML hubs)
Guest sign-up and sign-in, chat, push registration, geofence alerts, weather, Local Guide, and the content pages (amenities, rules text, things to do, and so on). Those menu items open `data-classic-url` when it is set, and show "not available here yet" when not.

## Notes
- Reads only, over the database's public REST address; refreshes every 30 s while the page is visible. The database rules must allow public read of `hubs/{id}/settings`, `announcements`, `activities` and `hubs_meta/{id}`, as the current hubs already rely on.
- Settings include the WiFi password, as in the current hubs. Anyone who can open the hub can read it.
