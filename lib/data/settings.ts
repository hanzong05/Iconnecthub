import 'server-only'
import { getFirebaseToken } from '@/lib/auth/session'
import { DEFAULT_QUICK, HERO_IDS, MAP_MODES, QUICK_IDS, VIS_IDS, readGroups, readPalette, readTabOrder, type HeroSlot, type HubSettings, type MapMode } from '@/lib/settings-catalog'
import { SessionExpiredError } from './dashboard'
import { readPath } from './scope'

const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')
const https = (v: unknown) => (typeof v === 'string' && /^https:\/\//i.test(v) ? v.slice(0, 500) : '')
const readExtra = (v: unknown): HubSettings['contacts']['extra'] => {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as object) : []
  const out: HubSettings['contacts']['extra'] = []
  for (const x of list) {
    const o = (x ?? {}) as Record<string, unknown>
    const kind = o.kind === 'phone' || o.kind === 'email' || o.kind === 'link' ? o.kind : null
    if (kind && typeof o.value === 'string' && o.value) out.push({ label: s(o.label, 60), kind, value: kind === 'link' ? https(o.value) : s(o.value, 200) })
  }
  return out.filter((e) => e.value).slice(0, 12)
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Everything on the Settings page for one hub, read as the signed-in user. */
export async function getHubSettings(hubId: string, hubName: string): Promise<HubSettings> {
  const t = await getFirebaseToken()
  if (!t) throw new SessionExpiredError('Your session has expired.')
  const raw = (await readPath(`hubs/${hubId}/settings`, t)) as Record<string, unknown> | null
  const o = raw ?? {}
  const metaRaw = await readPath(`hubs_meta/${hubId}`, t).catch(() => null)
  const meta = (metaRaw && typeof metaRaw === 'object' ? metaRaw : {}) as Record<string, unknown>
  const c = (o.contacts ?? {}) as Record<string, unknown>
  const hero = (o.heroImages ?? {}) as Record<string, unknown>
  const loc = (o.location ?? {}) as Record<string, unknown>
  const md = (o.mapDisplay ?? {}) as Record<string, unknown>
  const wifi = (o.wifi ?? {}) as Record<string, unknown>
  const pw = (o.passwordResetNotify ?? {}) as Record<string, unknown>
  const qa = Array.isArray(o.quickActions) ? o.quickActions.filter((x): x is string => typeof x === 'string' && QUICK_IDS.includes(x)) : []
  const more = (((o.visibility ?? {}) as Record<string, unknown>).more ?? {}) as Record<string, unknown>
  const visibility: Record<string, boolean> = {}
  for (const id of VIS_IDS) visibility[id] = more[id] !== false
  const heroImages = { home: '', events: '', more: '' } as Record<HeroSlot, string>
  for (const id of HERO_IDS) heroImages[id as HeroSlot] = https(hero[id])
  const mode = MAP_MODES.some((m) => m.id === md.mode) ? (md.mode as MapMode) : 'none'
  return {
    hub: { id: hubId, name: hubName, location: s(meta.location), logoUrl: https(meta.logoUrl), coverUrl: https(meta.coverUrl) || https(meta.bannerUrl) || https(meta.heroUrl), description: s(meta.description, 300), publicUrl: https(meta.publicUrl) || https(meta.hubUrl) || https(meta.url), active: meta.active !== false && s(meta.status).toLowerCase() !== 'inactive' },
    contacts: { extra: readExtra(c.extra), name: s(c.name, 100), phone: s(c.phone, 30), email: s(c.email), website: https(c.website), address: s(c.address, 300) },
    heroImages,
    location: { lat: num(loc.lat), lon: num(loc.lon) },
    mapDisplay: { mode, campgroundId: s(md.campgroundId, 64), embedUrl: https(md.embedUrl), imageUrl: https(md.imageUrl) },
    privacyPolicyUrl: https(o.privacyPolicyUrl),
    tabOrder: readTabOrder(o.tabOrder),
    hubName,
    wifi: { ssid: s(wifi.ssid), password: s(wifi.password) },
    quickActions: [0, 1, 2, 3].map((i) => qa[i] ?? DEFAULT_QUICK[i]),
    geofenceEnabled: o.geofenceEnabled !== false,
    pwNotify: { enabled: pw.enabled === true, email: s(pw.email) },
    palette: readPalette(o.colorPalette),
    visibility,
    groups: readGroups(o.visibilityGroups),
  }
}
