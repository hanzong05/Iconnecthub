/** Turns the raw settings stored for one hub into the typed shape the Settings page uses. Pure: no database access. */
import { readMenuItems } from './menu'
import { DEFAULT_QUICK, HERO_IDS, MAP_MODES, QUICK_IDS, VIS_IDS, readGroups, readHouseRules, readMoreLabels, readPalette, readTabOrder, type HeroSlot, type HubSettings, type MapMode } from './settings-catalog'

export type ParsedSettings = Omit<HubSettings, 'draft'>

const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')
const https = (v: unknown) => (typeof v === 'string' && /^https:\/\//i.test(v) ? v.slice(0, 500) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

const readExtra = (v: unknown): HubSettings['contacts']['extra'] => {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as object) : []
  const out: HubSettings['contacts']['extra'] = []
  for (const x of list) {
    const o = obj(x)
    const kind = o.kind === 'phone' || o.kind === 'email' || o.kind === 'link' ? o.kind : null
    if (kind && typeof o.value === 'string' && o.value) out.push({ label: s(o.label, 60), kind, value: kind === 'link' ? https(o.value) : s(o.value, 200) })
  }
  return out.filter((e) => e.value).slice(0, 12)
}

export function parseSettings(raw: unknown, metaRaw: unknown, hubId: string, hubName: string): ParsedSettings {
  const o = obj(raw)
  const meta = obj(metaRaw)
  const c = obj(o.contacts)
  const hero = obj(o.heroImages)
  const loc = obj(o.location)
  const md = obj(o.mapDisplay)
  const wifi = obj(o.wifi)
  const pw = obj(o.passwordResetNotify)
  const qa = Array.isArray(o.quickActions) ? o.quickActions.filter((x): x is string => typeof x === 'string' && QUICK_IDS.includes(x)) : []
  const more = obj(obj(o.visibility).more)
  const visibility: Record<string, boolean> = {}
  for (const id of VIS_IDS) visibility[id] = more[id] !== false
  const heroImages = { home: '', events: '', more: '' } as Record<HeroSlot, string>
  for (const id of HERO_IDS) heroImages[id as HeroSlot] = https(hero[id])
  const mode = MAP_MODES.some((m) => m.id === md.mode) ? (md.mode as MapMode) : 'none'
  return {
    hub: {
      id: hubId,
      name: hubName,
      location: s(meta.location),
      logoUrl: https(meta.logoUrl),
      coverUrl: https(meta.coverUrl) || https(meta.bannerUrl) || https(meta.heroUrl),
      description: s(meta.description, 300),
      publicUrl: https(meta.publicUrl) || https(meta.hubUrl) || https(meta.url),
      active: meta.active !== false && s(meta.status).toLowerCase() !== 'inactive',
    },
    contacts: { extra: readExtra(c.extra), name: s(c.name, 100), phone: s(c.phone, 30), email: s(c.email), website: https(c.website), address: s(c.address, 300) },
    heroImages,
    location: { lat: num(loc.lat), lon: num(loc.lon) },
    mapDisplay: { mode, campgroundId: s(md.campgroundId, 64), embedUrl: https(md.embedUrl), imageUrl: https(md.imageUrl) },
    privacyPolicyUrl: https(o.privacyPolicyUrl),
    localGuideUrl: https(o.localGuideUrl),
    menuItems: readMenuItems(o.menuItems),
    houseRules: readHouseRules(o.houseRules),
    moreLabels: readMoreLabels(o.moreLabels),
    tabOrder: readTabOrder(o.tabOrder),
    hubName,
    wifi: { ssid: s(wifi.ssid), password: s(wifi.password) },
    quickActions: [0, 1, 2, 3].map((i) => qa[i] ?? DEFAULT_QUICK[i]),
    geofenceEnabled: o.geofenceEnabled !== false,
    guestNotify: o.guestNotifications !== false,
    pwNotify: { enabled: pw.enabled === true, email: s(pw.email) },
    palette: readPalette(o.colorPalette),
    visibility,
    groups: readGroups(o.visibilityGroups),
  }
}
