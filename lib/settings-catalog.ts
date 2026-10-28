/** Things a hub can switch on or off for guests, and the defaults. Shared by the Settings page and its server actions. */

export const VIS_ITEMS = [
  { id: 'bookNow', label: 'Book Now Button' },
  { id: 'bookTeeTime', label: 'Book a Tee Time' },
  { id: 'scorecard', label: 'My Scorecard' },
  { id: 'register', label: 'Register / My Profile' },
  { id: 'weather', label: 'Weather Center' },
  { id: 'wifi', label: 'WiFi' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'waystostay', label: 'Ways to Stay' },
  { id: 'rules', label: 'Rules' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'foodshopping', label: 'Food & Shopping' },
  { id: 'thingsToDo', label: 'Things to Do' },
  { id: 'tickets', label: 'Tickets & Specials' },
  { id: 'cable', label: 'Cable Channels' },
  { id: 'contact', label: 'Contact Us' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'monthlyHappenings', label: 'Monthly Happenings' },
  { id: 'musicFestival', label: 'Music Festival' },
  { id: 'review', label: 'Leave a Review' },
  { id: 'chat', label: 'Send a Message' },
  { id: 'notifSettings', label: 'Notification Settings' },
  { id: 'saloon', label: 'Ghosttown Saloon' },
] as const

export const VIS_IDS: string[] = VIS_ITEMS.map((i) => i.id)

export const GROUP_ICONS = [
  { id: 'person', label: 'Person' },
  { id: 'tent', label: 'Tent' },
  { id: 'bag', label: 'Bag' },
  { id: 'chat', label: 'Chat' },
  { id: 'wifi', label: 'WiFi' },
  { id: 'star', label: 'Star' },
] as const
export const GROUP_ICON_IDS: string[] = GROUP_ICONS.map((i) => i.id)

export interface VisGroup {
  id: string
  icon: string
  label: string
  items: string[]
}

export const DEFAULT_VIS_GROUPS: VisGroup[] = [
  { id: 'mystay', icon: 'person', label: 'My Stay', items: ['register', 'reservations', 'notifSettings', 'newsletter', 'monthlyHappenings', 'musicFestival'] },
  { id: 'campinfo', icon: 'tent', label: 'Campground Information', items: ['amenities', 'rules', 'weather', 'cable', 'wifi'] },
  { id: 'duringstay', icon: 'bag', label: 'During Your Stay', items: ['foodshopping', 'thingsToDo', 'tickets', 'waystostay', 'bookNow', 'scorecard'] },
  { id: 'help', icon: 'chat', label: 'Help & Feedback', items: ['contact', 'chat', 'review'] },
]

export const QUICK_ACTION_OPTIONS = [
  { id: 'map', label: 'Map' },
  { id: 'events', label: 'Events' },
  { id: 'contact', label: 'Contact Us' },
  { id: 'wifi', label: 'WiFi' },
  { id: 'chat', label: 'Chat / Message Us' },
  { id: 'rules', label: 'Rules' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'waystostay', label: 'Ways to Stay' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'foodshopping', label: 'Food & Shopping' },
  { id: 'tickets', label: 'Tickets & Specials' },
  { id: 'cable', label: 'Cable Channels' },
  { id: 'weather', label: 'Weather Center' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'musicFestival', label: 'Music Festival' },
  { id: 'review', label: 'Leave a Review' },
] as const
export const QUICK_IDS: string[] = QUICK_ACTION_OPTIONS.map((o) => o.id)
export const DEFAULT_QUICK = ['map', 'events', 'contact', 'rules']

export const PALETTE_FIELDS = [
  { key: 'primary', label: 'Primary', hint: 'Buttons, active nav, main brand color', fallback: '#1a56db' },
  { key: 'textPrimary', label: 'Text / Links', hint: 'Section titles, highlighted text', fallback: '#1a56db' },
  { key: 'dark', label: 'Dark / Hover', hint: 'Gradients, hover & pressed states', fallback: '#122fa0' },
  { key: 'tab', label: 'Accent / Tabs', hint: 'Active date tabs, secondary highlights', fallback: '#4a4fe0' },
  { key: 'bg', label: 'Background', hint: 'App background tint behind cards', fallback: '#e8e5ef' },
  { key: 'secondary', label: 'Secondary Text', hint: 'Muted labels & captions', fallback: '#7b85a0' },
] as const
export type PaletteKey = (typeof PALETTE_FIELDS)[number]['key']
export type Palette = Record<PaletteKey, string>
export const DEFAULT_BRAND = '#1a56db'

const LEGACY_PRIMARY: Record<string, string> = { blue: '#1a56db', green: '#16a34a', orange: '#ea580c', pink: '#db2777', teal: '#0891b2', slate: '#334155' }

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return '#' + [r + m, g + m, b + m].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}

/** Fills every colour role from one brand colour (same formula as the hub admin). */
export function generatePalette(primary: string): Palette {
  const [h, s, l] = hexToHsl(primary)
  const dark = hslToHex(h, s, Math.max(15, l - 18))
  const canLighten = l + 18 <= 82
  const tab = hslToHex(h, canLighten ? Math.min(100, s * 1.1) : s * 0.7, canLighten ? l + 18 : Math.max(l - 10, 55))
  const bg = hslToHex(h, Math.max(18, s * 0.5), Math.min(94, 88 + l * 0.06))
  const secondary = hslToHex(h, Math.max(5, s * 0.3), 52)
  return { primary, dark, tab, bg, secondary, textPrimary: l > 60 ? dark : primary }
}

/** Reads a saved palette: an object, an old preset name, or nothing. */
export function readPalette(v: unknown): Palette {
  if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).primary === 'string') {
    const o = v as Record<string, unknown>
    const base = generatePalette(DEFAULT_BRAND)
    const out = { ...base }
    for (const f of PALETTE_FIELDS) {
      const x = o[f.key]
      if (typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x)) out[f.key] = x.toLowerCase()
    }
    return out
  }
  if (typeof v === 'string' && LEGACY_PRIMARY[v]) return generatePalette(LEGACY_PRIMARY[v])
  return generatePalette(DEFAULT_BRAND)
}

export const HERO_SLOTS = [
  { id: 'home', label: 'Home' },
  { id: 'events', label: 'Events' },
  { id: 'more', label: 'More' },
] as const
export type HeroSlot = (typeof HERO_SLOTS)[number]['id']
export const HERO_IDS: string[] = HERO_SLOTS.map((h) => h.id)

export const TAB_IDS = ['home', 'events', 'more'] as const
export const TAB_LABELS: Record<string, string> = { home: 'Home', events: 'Events', more: 'More' }

export const MAP_MODES = [
  { id: 'none', label: 'No map' },
  { id: 'pathfinder', label: 'Path Finder map' },
  { id: 'embed', label: 'Embed link' },
  { id: 'image', label: 'Image link' },
] as const
export type MapMode = (typeof MAP_MODES)[number]['id']

export const CONTACT_KINDS = [
  { id: 'phone', label: 'Phone' },
  { id: 'email', label: 'Email' },
  { id: 'link', label: 'Social / website' },
] as const
export type ContactKind = (typeof CONTACT_KINDS)[number]['id']
export const MAX_EXTRA_CONTACTS = 12
export interface ExtraContact { label: string; kind: ContactKind; value: string }
export interface HubContacts { extra: ExtraContact[]; name: string; phone: string; email: string; website: string; address: string }
export interface HubLocation { lat: number | null; lon: number | null }
export interface HubMapDisplay { mode: MapMode; campgroundId: string; embedUrl: string; imageUrl: string }

export interface HubSettings {
  hub: { id: string; name: string; location: string; logoUrl: string; coverUrl: string; description: string; publicUrl: string; active: boolean }
  contacts: HubContacts
  heroImages: Record<HeroSlot, string>
  location: HubLocation
  mapDisplay: HubMapDisplay
  privacyPolicyUrl: string
  tabOrder: string[]
  hubName: string
  wifi: { ssid: string; password: string }
  quickActions: string[]
  geofenceEnabled: boolean
  pwNotify: { enabled: boolean; email: string }
  palette: Palette
  visibility: Record<string, boolean>
  groups: VisGroup[]
}

export function readGroups(v: unknown): VisGroup[] {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as object) : []
  const groups: VisGroup[] = []
  for (const g of list) {
    if (!g || typeof g !== 'object') continue
    const o = g as Record<string, unknown>
    const items = Array.isArray(o.items) ? o.items : o.items && typeof o.items === 'object' ? Object.values(o.items as object) : []
    groups.push({
      id: typeof o.id === 'string' ? o.id : `g${groups.length}`,
      icon: typeof o.icon === 'string' ? o.icon : 'person',
      label: typeof o.label === 'string' ? o.label : 'Group',
      items: items.filter((i): i is string => typeof i === 'string'),
    })
  }
  return groups.length ? groups : DEFAULT_VIS_GROUPS.map((g) => ({ ...g, items: [...g.items] }))
}

export function readTabOrder(v: unknown): string[] {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as object) : []
  const out: string[] = []
  for (const x of list) if (typeof x === 'string' && (TAB_IDS as readonly string[]).includes(x) && !out.includes(x)) out.push(x)
  for (const id of TAB_IDS) if (!out.includes(id)) out.push(id)
  return out
}

/** What the Settings cards show before a hub is chosen: nothing of any hub's, only blank defaults. */
export function emptyHubSettings(): HubSettings {
  return {
    hub: { id: '', name: '', location: '', logoUrl: '', coverUrl: '', description: '', publicUrl: '', active: true },
    contacts: { extra: [], name: '', phone: '', email: '', website: '', address: '' },
    heroImages: { home: '', events: '', more: '' },
    location: { lat: null, lon: null },
    mapDisplay: { mode: 'none', campgroundId: '', embedUrl: '', imageUrl: '' },
    privacyPolicyUrl: '',
    tabOrder: [...TAB_IDS],
    hubName: '',
    wifi: { ssid: '', password: '' },
    quickActions: [...DEFAULT_QUICK],
    geofenceEnabled: true,
    pwNotify: { enabled: false, email: '' },
    palette: readPalette(undefined),
    visibility: {},
    groups: readGroups(undefined),
  }
}
