/** Pure checks for the Settings page, shared by the server actions and their tests. */
import { CONTACT_KINDS, HERO_IDS, MAP_MODES, MAX_EXTRA_CONTACTS, TAB_IDS, type ExtraContact, type HubContacts, type HubLocation, type HubMapDisplay } from './settings-catalog'

export class SettingsInvalid extends Error {}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[0-9+()\-.\s]{3,30}$/
const ID = /^[A-Za-z0-9_-]{1,64}$/

/** An https address only (empty is allowed and means "none"). */
export function httpsUrl(v: unknown, what: string, max = 500): string {
  if (v === undefined || v === null || v === '') return ''
  if (typeof v !== 'string') throw new SettingsInvalid(`${what} must be a web address.`)
  const t = v.trim()
  if (!t) return ''
  if (t.length > max) throw new SettingsInvalid(`${what} is too long.`)
  let u: URL
  try {
    u = new URL(t)
  } catch {
    throw new SettingsInvalid(`${what} is not a valid web address.`)
  }
  if (u.protocol !== 'https:' || u.username || u.password) throw new SettingsInvalid(`${what} must start with https://`)
  return u.toString()
}

export function parseExtraContacts(v: unknown): ExtraContact[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new SettingsInvalid('The extra contacts are not valid.')
  if (v.length > MAX_EXTRA_CONTACTS) throw new SettingsInvalid(`Add at most ${MAX_EXTRA_CONTACTS} extra contacts.`)
  return v.map((raw, i) => {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const kind = String(o.kind ?? '')
    if (!CONTACT_KINDS.some((k) => k.id === kind)) throw new SettingsInvalid(`Contact ${i + 1}: choose phone, email or link.`)
    const label = typeof o.label === 'string' ? o.label.trim() : ''
    if (!label) throw new SettingsInvalid(`Contact ${i + 1}: add a name such as "Emergency" or "Facebook".`)
    if (label.length > 60) throw new SettingsInvalid(`Contact ${i + 1}: the name is too long (60 characters at most).`)
    const value = typeof o.value === 'string' ? o.value.trim() : ''
    if (!value) throw new SettingsInvalid(`Contact ${i + 1} (${label}): enter the ${kind === 'phone' ? 'phone number' : kind === 'email' ? 'email address' : 'link'}.`)
    if (kind === 'phone' && !PHONE.test(value)) throw new SettingsInvalid(`Contact ${i + 1} (${label}): that phone number does not look right.`)
    if (kind === 'email' && (!EMAIL.test(value) || value.length > 200)) throw new SettingsInvalid(`Contact ${i + 1} (${label}): that email address does not look right.`)
    return { label, kind: kind as ExtraContact['kind'], value: kind === 'link' ? httpsUrl(value, `Contact ${i + 1} (${label}) link`) : value }
  })
}

export function parseContacts(v: unknown): HubContacts {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const str = (k: string, max: number) => {
    const x = o[k]
    if (x === undefined || x === null) return ''
    if (typeof x !== 'string') throw new SettingsInvalid('Contact details must be text.')
    const t = x.trim()
    if (t.length > max) throw new SettingsInvalid(`The ${k} is too long (${max} characters at most).`)
    return t
  }
  const name = str('name', 100)
  const phone = str('phone', 30)
  const email = str('email', 200)
  const address = str('address', 300)
  if (phone && !PHONE.test(phone)) throw new SettingsInvalid('That phone number does not look right.')
  if (email && !EMAIL.test(email)) throw new SettingsInvalid('That email address does not look right.')
  return { extra: parseExtraContacts(o.extra), name, phone, email, address, website: httpsUrl(o.website, 'The website') }
}

export function parseLocation(v: unknown): { lat: number; lon: number } | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const blank = (x: unknown) => x === null || x === undefined || x === ''
  if (blank(o.lat) && blank(o.lon)) return null
  if (blank(o.lat) || blank(o.lon)) throw new SettingsInvalid('Enter both latitude and longitude, or leave both empty.')
  const lat = typeof o.lat === 'number' ? o.lat : Number(o.lat)
  const lon = typeof o.lon === 'number' ? o.lon : Number(o.lon)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new SettingsInvalid('Latitude must be a number from -90 to 90.')
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new SettingsInvalid('Longitude must be a number from -180 to 180.')
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 }
}

export function parseMapDisplay(v: unknown, knownCampgrounds: string[] | null): HubMapDisplay {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const mode = String(o.mode ?? 'none')
  if (!MAP_MODES.some((m) => m.id === mode)) throw new SettingsInvalid('Choose a valid map type.')
  const out: HubMapDisplay = { mode: mode as HubMapDisplay['mode'], campgroundId: '', embedUrl: '', imageUrl: '' }
  if (mode === 'pathfinder') {
    const id = String(o.campgroundId ?? '')
    if (!ID.test(id)) throw new SettingsInvalid('Choose a Path Finder map.')
    if (knownCampgrounds && !knownCampgrounds.includes(id)) throw new SettingsInvalid('That map does not exist on this hub.')
    out.campgroundId = id
  } else if (mode === 'embed') {
    out.embedUrl = httpsUrl(o.embedUrl, 'The embed link')
    if (!out.embedUrl) throw new SettingsInvalid('Enter the embed link.')
  } else if (mode === 'image') {
    out.imageUrl = httpsUrl(o.imageUrl, 'The image link')
    if (!out.imageUrl) throw new SettingsInvalid('Enter the image link.')
  }
  return out
}

export function parseHeroSlot(v: unknown): string {
  if (typeof v !== 'string' || !HERO_IDS.includes(v)) throw new SettingsInvalid('Unknown picture slot.')
  return v
}

export function parseTabOrder(v: unknown): string[] {
  if (!Array.isArray(v) || v.length !== TAB_IDS.length || new Set(v).size !== v.length || v.some((x) => !(TAB_IDS as readonly string[]).includes(x))) throw new SettingsInvalid('Invalid tab order.')
  return v as string[]
}
