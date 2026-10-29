/**
 * Drafts for hub settings. Staff edit a draft; Publish copies it to the live settings the guest hubs read.
 * Pure helpers, shared by the server actions, the data reader and their tests.
 *
 * A draft stores only the settings that were touched, under the same paths as the live settings
 * (hubs/{id}/settingsDraft/data/{path}). A cleared value is written as '' or false, because the database drops nulls.
 */
import { HERO_SLOTS, MAP_MODES, PALETTE_FIELDS, QUICK_ACTION_OPTIONS, TAB_LABELS, VIS_ITEMS, type SettingChange } from './settings-catalog'
import { parseSettings, type ParsedSettings } from './settings-parse'

/** Every setting that goes through a draft, by its path under hubs/{id}/settings. */
export const DRAFT_PATHS = [
  'wifi',
  'quickActions',
  'geofenceEnabled',
  'colorPalette',
  'visibility/more',
  'visibilityGroups',
  'contacts',
  'heroImages',
  'location',
  'mapDisplay',
  'privacyPolicyUrl',
  'localGuideUrl',
  'menuItems',
  'houseRules',
  'moreLabels',
  'tabOrder',
] as const
export type DraftPath = (typeof DRAFT_PATHS)[number]

export const DRAFT_LABELS: Record<DraftPath, string> = {
  wifi: 'WiFi',
  quickActions: 'Quick actions',
  geofenceEnabled: '25-mile alert radius',
  colorPalette: 'Color palette',
  'visibility/more': 'Hub visibility',
  visibilityGroups: 'Guest menu groups',
  contacts: 'Contacts',
  heroImages: 'Hero images',
  location: 'Location',
  mapDisplay: 'Map display',
  privacyPolicyUrl: 'Rules link',
  localGuideUrl: 'Local guide link',
  menuItems: 'Custom menu items',
  houseRules: 'Rules',
  moreLabels: 'Built-in item names',
  tabOrder: 'Tab order',
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Lays a draft's touched values over the live settings. Plain objects merge; everything else is replaced. */
export function mergeDraft(live: unknown, draftData: unknown): Record<string, unknown> {
  const base = isObj(live) ? live : {}
  if (!isObj(draftData)) return { ...base }
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(draftData)) {
    out[k] = isObj(v) && isObj(base[k]) && (k === 'visibility' || k === 'heroImages' || k === 'moreLabels') ? mergeDeep(base[k] as Record<string, unknown>, v) : v
  }
  return out
}
function mergeDeep(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a[k]) ? mergeDeep(a[k] as Record<string, unknown>, v) : v
  return out
}

/** The values to store for each draft path, in the shape the guest hubs read. null = nothing stored there. */
export function toLive(s: ParsedSettings): Record<DraftPath, unknown> {
  const nonEmpty = <T extends object>(o: T): T | null => (Object.values(o).some((v) => (Array.isArray(v) ? v.length : v)) ? o : null)
  const heroes: Record<string, string> = {}
  for (const h of HERO_SLOTS) if (s.heroImages[h.id]) heroes[h.id] = s.heroImages[h.id]
  const md = s.mapDisplay
  return {
    wifi: nonEmpty({ ssid: s.wifi.ssid, password: s.wifi.password }),
    quickActions: s.quickActions,
    geofenceEnabled: s.geofenceEnabled,
    colorPalette: { ...s.palette, tabDark: s.palette.dark },
    'visibility/more': Object.fromEntries(VIS_ITEMS.map((i) => [i.id, s.visibility[i.id] !== false])),
    visibilityGroups: s.groups.map((g) => ({ id: g.id, icon: g.icon, label: g.label, items: g.items })),
    contacts: nonEmpty({ name: s.contacts.name, phone: s.contacts.phone, email: s.contacts.email, website: s.contacts.website, address: s.contacts.address, extra: s.contacts.extra }),
    heroImages: Object.keys(heroes).length ? heroes : null,
    location: s.location.lat !== null && s.location.lon !== null ? { lat: s.location.lat, lon: s.location.lon } : null,
    mapDisplay: md.mode === 'none' ? null : { mode: md.mode, campgroundId: md.campgroundId, embedUrl: md.embedUrl, imageUrl: md.imageUrl },
    privacyPolicyUrl: s.privacyPolicyUrl || null,
    localGuideUrl: s.localGuideUrl || null,
    menuItems: s.menuItems.length ? s.menuItems : null,
    houseRules: s.houseRules.length ? s.houseRules : null,
    moreLabels: Object.keys(s.moreLabels).length ? s.moreLabels : null,
    tabOrder: s.tabOrder,
  }
}

const label = (list: readonly { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id
const word = (v: string) => (v ? 'set' : 'empty')

/** A short human description of one setting, for the review screen. Never prints secrets such as the WiFi password. */
function describe(path: DraftPath, s: ParsedSettings, other: ParsedSettings): string {
  switch (path) {
    case 'wifi':
      return s.wifi.ssid || s.wifi.password ? `Network "${s.wifi.ssid || '(none)'}", password ${word(s.wifi.password)}` : 'Not set'
    case 'quickActions':
      return s.quickActions.map((id) => label(QUICK_ACTION_OPTIONS, id)).join(', ')
    case 'geofenceEnabled':
      return s.geofenceEnabled ? 'On' : 'Off'
    case 'colorPalette': {
      const changed = PALETTE_FIELDS.filter((f) => s.palette[f.key] !== other.palette[f.key])
      return (changed.length ? changed : PALETTE_FIELDS).map((f) => `${f.label} ${s.palette[f.key]}`).join(', ')
    }
    case 'visibility/more': {
      const f = VIS_ITEMS.filter((i) => (s.visibility[i.id] !== false) !== (other.visibility[i.id] !== false)).map((i) => `${i.label}: ${s.visibility[i.id] === false ? 'hidden' : 'shown'}`)
      return f.join(', ') || 'Unchanged'
    }
    case 'visibilityGroups':
      return s.groups.map((g) => `${g.label} (${g.items.length})`).join(', ')
    case 'contacts': {
      const c = s.contacts
      const o = other.contacts
      const f: string[] = []
      for (const k of ['name', 'phone', 'email', 'website', 'address'] as const) if (c[k] !== o[k]) f.push(`${k}: ${c[k] || 'not set'}`)
      if (JSON.stringify(c.extra) !== JSON.stringify(o.extra)) f.push(`${c.extra.length} extra contact${c.extra.length === 1 ? '' : 's'}`)
      return f.join(', ') || 'Unchanged'
    }
    case 'heroImages': {
      const f = HERO_SLOTS.filter((h) => s.heroImages[h.id] !== other.heroImages[h.id]).map((h) => `${h.label}: ${s.heroImages[h.id] ? 'picture set' : 'no picture'}`)
      return f.join(', ') || 'Unchanged'
    }
    case 'location':
      return s.location.lat !== null && s.location.lon !== null ? `${s.location.lat}, ${s.location.lon}` : 'Not set'
    case 'mapDisplay':
      return label(MAP_MODES, s.mapDisplay.mode)
    case 'privacyPolicyUrl':
      return s.privacyPolicyUrl || 'Not set'
    case 'localGuideUrl':
      return s.localGuideUrl || 'Not set'
    case 'menuItems':
      return s.menuItems.length ? s.menuItems.map((m) => `${m.label}${m.shown ? '' : ' (hidden)'}`).join(', ') : 'None'
    case 'houseRules':
      return s.houseRules.length ? `${s.houseRules.length} rule${s.houseRules.length === 1 ? '' : 's'}: ${s.houseRules.map((r) => r.title).join(', ')}`.slice(0, 200) : 'None'
    case 'moreLabels': {
      const ids = [...new Set([...Object.keys(s.moreLabels), ...Object.keys(other.moreLabels)])]
      const f = ids.filter((id) => s.moreLabels[id] !== other.moreLabels[id]).map((id) => `${label(VIS_ITEMS, id)}: ${s.moreLabels[id] ? `"${s.moreLabels[id]}"` : 'default name'}`)
      return f.join(', ') || 'Default names'
    }
    case 'tabOrder':
      return s.tabOrder.map((t) => TAB_LABELS[t] ?? t).join(' → ')
  }
}

/** What differs between the live settings and the draft. Editing a value back to what is live shows nothing. */
export function diffSettings(live: ParsedSettings, next: ParsedSettings): SettingChange[] {
  const a = toLive(live)
  const b = toLive(next)
  const out: SettingChange[] = []
  for (const path of DRAFT_PATHS) {
    if (JSON.stringify(a[path] ?? null) === JSON.stringify(b[path] ?? null)) continue
    out.push({ path, label: DRAFT_LABELS[path], before: describe(path, live, next), after: describe(path, next, live) })
  }
  return out
}

/** Live and effective settings for one hub from the raw database values. */
export function readDraftState(rawLive: unknown, rawDraft: unknown, meta: unknown, hubId: string, hubName: string) {
  const d = isObj(rawDraft) ? rawDraft : {}
  const live = parseSettings(rawLive, meta, hubId, hubName)
  const effective = parseSettings(mergeDraft(rawLive, d.data), meta, hubId, hubName)
  return {
    live,
    effective,
    draft: {
      version: typeof d.version === 'number' && Number.isFinite(d.version) ? d.version : 0,
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
      updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : '',
      changes: diffSettings(live, effective),
    },
  }
}
