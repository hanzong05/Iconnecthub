# Path Finder → iConnectHub migration

iConnectHub is now the home of the campground map tools. Campgrounds, Map & Locations and Calibration are built into the admin, per hub, and no longer link out to the old Path Finder site.

## What was moved

| Old Path Finder screen | New iConnectHub page | Notes |
|---|---|---|
| Campgrounds (`/campgrounds`) | `/dashboard/campgrounds` | List, add, edit, delete. Embed code removed (see "Not migrated"). |
| Map & Locations (`/maplocations`, admin mode) | `/dashboard/map-locations?map=<id>` | Locations, roads, obstacles, campground details, route preview. |
| Calibration (`/calibration`) | `/dashboard/calibration?map=<id>` | Reference points, checkpoints, georeference (satellite overlay), detail image, undo/redo, Ctrl+S. |

Sidebar: Tools → Path Finder → the three pages. Super Admin only. Choose a hub first (the pages list hubs when none is chosen); links then keep `?hub=`.

## Where the code is

- `lib/pathfinder/` – the calculation engines ported unchanged from the old project (geo, calibration fit, road editing, routing, smoothing, detail layer, undo history) with their tests, plus `model.ts` (shared types) and `validate.ts` (server-side checks).
- `lib/data/pathfinder.ts` – server-only reads for a hub.
- `app/actions/pathfinder.ts` – server actions for every save (create, update, layers, network, calibration, delete).
- `components/pathfinder/` – the editor screens (dark "studio" look kept from the original), the campground list, image helpers.
- `app/dashboard/{campgrounds,map-locations,calibration}/page.tsx`.

## Data model (Realtime Database)

```
hubs/{hubId}/pathfinder/
  campgrounds/{id}  name, public, mapImage (https), mapWidth, mapHeight, centerLat, centerLon,
                    detail?, extended?, createdBy, createdAt, updatedAt
  network/{id}      json (text: {pins, walkways, obstacles, roads}), updatedAt, updatedBy
  calibration/{id}  json (text: controlPoints, checkpoints, georef, image, orientation, layerZoom), updatedAt, updatedBy
```

Old (Firestore): `campgrounds/{id}`, `pathfinder/cg-{id}`, `pathfinder_calibration/cg-{id}`. Differences: data is scoped by hub; map images are uploaded to the image host and stored as an https address (the old app stored a WebP data-URL inside the record); the ids are database push keys.

## Security

- Every save runs on the server, checks the session, then `assertHubAccess` (a super admin: any existing hub; everyone else: own hub only), then checks the campground really exists in that hub, then validates the payload (types, ranges, id patterns, https-only image addresses, counts, 2.5 MB size cap). Unknown fields are dropped.
- Saves for an id that does not exist (for example after a delete) are refused, so a late save cannot bring a deleted map back.
- Limit: 20 campgrounds per hub.
- Tested: `app/actions/pathfinder.test.ts` (managers and super managers are refused; a campground is only reachable through its own hub; path-walking ids; super admin on missing hub; invalid payloads write nothing) and `lib/pathfinder/validate.test.ts`.

## Verified / inferred / unknown

Verified (read in the old source or run here): the three screens and their data shapes; the engines and their behaviour (40 ported tests pass); the new pages in a real browser against a mock database (create + image upload, add location, draw road/obstacle, rename, calibrate with 3 points and save, reload keeps everything, delete; manager of another hub sees nothing; `?hub=` ignored for managers; no horizontal scroll at 390 px).

Inferred: that the live database rules allow a hub's manager to write under `hubs/{hubId}/pathfinder` (see below). That the new look is acceptable for the studio screens (they keep the original dark theme with the iConnectHub blue).

Unknown: the live Realtime Database rules; the real image host's behaviour for large images; Safari/iOS behaviour of the WebP encoder (the screens need a browser that can write WebP; Chrome, Edge and Firefox can).

## Required before use

1. **Database rules (Super Admin only).** In Firebase Console → Realtime Database → Rules, inside `hubs` → `$hubId`, add:

```
"pathfinder": {
  ".read":  "auth != null && root.child('users/'+auth.uid+'/role').val() === 'super'",
  ".write": "auth != null && root.child('users/'+auth.uid+'/role').val() === 'super'"
}
```
   Then press Publish. Without this the Maps pages show "Firebase is refusing access".
2. `IMGBB_API_KEY` set (map images use the existing `/api/upload`).
3. Move any existing maps (below).

## Not migrated (decisions needed)

- **Existing data.** Campgrounds already saved in the old Firestore are not imported. Their images are data-URLs inside Firestore and would need to be re-uploaded to the image host. Easiest: re-add each campground (a few minutes each) and re-calibrate; or ask for an import script.
- **Visitor side:** live GPS, compass and step tracking, guest search and turn-by-turn navigation, the landing page, embed keys and the embedded campground map, and public (guest) read access. The visitor app continues to use its own Firestore until it is moved to read from the hub's data.
- The open-ground route server (Flask) – routes preview only over drawn roads.

## Known limits

- No realtime sync: two admins editing the same map at once overwrite each other (last save wins, in order). A save in progress warns before leaving the page.
- A save racing a delete of the same campground could leave a partial campground record; such records are ignored when listing.
- The campground picture can be replaced, but existing locations keep their pixel positions, so keep the same proportions.

## Rollback

Nothing existing was removed except the sidebar link-outs and the `NEXT_PUBLIC_PATHFINDER_URL` setting. To roll back: restore `components/dashboard/{nav.ts,NavItem.tsx,Sidebar.tsx}` from the previous copy and delete the three `app/dashboard/*` pages. Data under `hubs/*/pathfinder` can stay untouched. The old Path Finder site is unaffected.
