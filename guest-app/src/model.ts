/** Pure helpers for the guest app: what to show, from the raw database values. No React, no network. */
import { VIS_ITEMS, type HubSettings } from '@/lib/settings-catalog'
import { PAGE_IDS, readPage, type Page } from '@/lib/pages'
import { isMenuId } from '@/lib/menu'

type Row = Record<string, unknown>
const rows = (v: unknown): [string, Row][] => (v && typeof v === 'object' ? (Object.entries(v as Row).filter(([, r]) => r && typeof r === 'object') as [string, Row][]) : [])
const s = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '')
const time = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : null)

export interface GuestAnnouncement { id: string; title: string; message: string; type: string; at: number }
/** Announcements guests may see now: active, already published, not expired. Newest first. */
export function liveAnnouncements(raw: unknown, now: number): GuestAnnouncement[] {
  return rows(raw)
    .filter(([, a]) => a.active !== false)
    .filter(([, a]) => {
      const start = time(a.scheduledAt)
      const end = time(a.expiresAt)
      return (start === null || start <= now) && (end === null || end > now)
    })
    .map(([id, a]) => ({ id, title: s(a.title, 120) || 'Update', message: s(a.message), type: ['info', 'warning', 'alert', 'success'].includes(s(a.type, 20)) ? s(a.type, 20) : 'info', at: time(a.createdAt) ?? 0 }))
    .sort((x, y) => y.at - x.at)
}

export interface HubEvent { id: string; title: string; description: string; hours: string; location: string; imageUrl: string; order: number; dates: string[]; days: string[] }
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const strList = (v: unknown, max = 400): string[] => (Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string').slice(0, max) : v && typeof v === 'object' ? Object.values(v as Row).filter((d): d is string => typeof d === 'string').slice(0, max) : [])

/** Active events, read the way the live hubs read them: specific dates (YYYY-MM-DD) or, for older events, days of the week. */
export function hubEvents(raw: unknown): HubEvent[] {
  return rows(raw)
    .filter(([, a]) => a.active !== false)
    .map(([id, a]) => {
      const img = s(a.imageUrl, 500)
      return { id, title: s(a.title, 120) || 'Event', description: s(a.description, 300) || s(a.fullDesc, 300), hours: s(a.hours, 80), location: s(a.location, 120), imageUrl: /^https:\/\//i.test(img) ? img : '', order: Number(a.order) || 0, dates: strList(a.dates).sort(), days: strList(a.days, 8) }
    })
}

export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseIso = (iso: string) => new Date(`${iso}T00:00:00`)

/** Is this event on that day? Dates win; without dates the weekday list is used ("Daily" means every day). */
export function eventOn(e: HubEvent, iso: string): boolean {
  if (e.dates.length) return e.dates.includes(iso)
  return e.days.includes('Daily') || e.days.includes(DAY_NAMES[parseIso(iso).getDay()])
}
const byOrder = (a: HubEvent, b: HubEvent) => a.order - b.order || a.title.localeCompare(b.title)
export const eventsOnDate = (events: HubEvent[], iso: string) => events.filter((e) => eventOn(e, iso)).sort(byOrder)

/** Events after the given day, one entry per event with all its dates in the window (so a 4-day festival is one card). */
export function upcomingEvents(events: HubEvent[], fromIso: string, days = 30): { event: HubEvent; dates: string[] }[] {
  const groups = new Map<string, { event: HubEvent; dates: string[] }>()
  for (let i = 1; i <= days; i++) {
    const d = parseIso(fromIso)
    d.setDate(d.getDate() + i)
    const iso = isoDate(d)
    for (const e of events) if (eventOn(e, iso)) (groups.get(e.id) ?? groups.set(e.id, { event: e, dates: [] }).get(e.id)!).dates.push(iso)
  }
  return [...groups.values()].sort((x, y) => x.dates[0].localeCompare(y.dates[0]) || byOrder(x.event, y.event))
}

/** "Fri, Oct 30", "Oct 30–Nov 2" for consecutive days, "Oct 30 +2 more" otherwise. */
export function dateRangeLabel(dates: string[]): string {
  const f = (iso: string, o: Intl.DateTimeFormatOptions) => parseIso(iso).toLocaleDateString('en-US', o)
  if (dates.length === 1) return f(dates[0], { weekday: 'short', month: 'short', day: 'numeric' })
  const consecutive = dates.every((d, i) => i === 0 || Math.round((parseIso(d).getTime() - parseIso(dates[i - 1]).getTime()) / 86400000) === 1)
  if (!consecutive) return `${f(dates[0], { month: 'short', day: 'numeric' })} +${dates.length - 1} more`
  const first = parseIso(dates[0])
  const last = parseIso(dates[dates.length - 1])
  return `${f(dates[0], { month: 'short', day: 'numeric' })}–${first.getMonth() === last.getMonth() ? last.getDate() : f(dates[dates.length - 1], { month: 'short', day: 'numeric' })}`
}

/** The date strip of the Events tab: a week back to a month ahead. */
export function dateStrip(todayIso: string, past = 7, ahead = 30): { iso: string; day: string; num: number; today: boolean }[] {
  const out = []
  for (let i = -past; i <= ahead; i++) {
    const d = parseIso(todayIso)
    d.setDate(d.getDate() + i)
    out.push({ iso: isoDate(d), day: i === 0 ? 'Today' : DAY_NAMES[d.getDay()], num: d.getDate(), today: i === 0 })
  }
  return out
}

export function timeAgo(at: number, now: number): string {
  if (!at) return ''
  const diff = Math.floor((now - at) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Weather code to words and a symbol, as the live hubs show them. */
export function wxCode(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: 'Clear', emoji: '☀️' }
  if (code <= 2) return { label: 'Partly Cloudy', emoji: '🌤️' }
  if (code === 3) return { label: 'Cloudy', emoji: '☁️' }
  if (code <= 49) return { label: 'Foggy', emoji: '🌫️' }
  if (code <= 55) return { label: 'Drizzle', emoji: '🌦️' }
  if (code <= 67) return { label: 'Rain', emoji: '🌧️' }
  if (code <= 77) return { label: 'Snow', emoji: '❄️' }
  if (code <= 82) return { label: 'Showers', emoji: '🌧️' }
  if (code <= 99) return { label: 'Thunderstorm', emoji: '⛈️' }
  return { label: 'Unknown', emoji: '🌡️' }
}

export type TabId = 'home' | 'map' | 'events' | 'guide' | 'more'
/** Bottom tabs as the live hubs lay them out: Home, Map, Events, Local Guide, More. Only Home, Events and More move; Map and Local Guide keep their places. */
export function tabsFor(order: string[]): TabId[] {
  const movable = order.filter((t): t is 'home' | 'events' | 'more' => t === 'home' || t === 'events' || t === 'more')
  const base: ('home' | 'events' | 'more')[] = movable.length === 3 ? movable : ['home', 'events', 'more']
  return [base[0], 'map', base[1], 'guide', base[2]]
}

export interface MenuItem { id: string; label: string }
export interface MenuGroup { id: string; label: string; items: MenuItem[] }
/** The More menu: the hub's groups, with hidden items removed and empty groups dropped. */
export function menuGroups(settings: Pick<HubSettings, 'groups' | 'visibility' | 'menuItems'>): MenuGroup[] {
  const custom = new Map((settings.menuItems ?? []).map((m) => [m.id, m]))
  const label = (id: string) => custom.get(id)?.label ?? VIS_ITEMS.find((i) => i.id === id)?.label ?? id
  // A custom item shows when the Super Admin has not hidden it; a link with no address or a sheet with no rows has nothing to open.
  const usable = (id: string) => {
    const c = custom.get(id)
    if (!c) return isMenuId(id) ? false : settings.visibility[id] !== false
    return c.shown && (c.kind === 'link' ? !!c.url : c.kind === 'sheet' ? c.rows.length > 0 : true)
  }
  return settings.groups
    .map((g) => ({ id: g.id, label: g.label, items: g.items.filter(usable).map((id) => ({ id, label: label(id) })) }))
    .filter((g) => g.items.length > 0)
}

/** Digits and a leading + only, for a tel: link. */
export const telHref = (phone: string) => {
  const d = phone.replace(/[^0-9+]/g, '')
  return d ? `tel:${d}` : ''
}

export function validHub(id: string | null): id is string {
  return !!id && /^[A-Za-z0-9_-]{1,64}$/.test(id)
}
/** Only a real https database address (or a local one for testing). */
export function validDb(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null
    return u.origin
  } catch {
    return null
  }
}

/** Pages a manager has published for this hub, by page id. A page with nothing on it is left out so the classic link still works. */
export function publishedPages(raw: unknown): Record<string, Page> {
  const out: Record<string, Page> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const id of Object.keys(raw as object).filter((k) => PAGE_IDS.includes(k) || isMenuId(k))) {
    const page = readPage((raw as Record<string, unknown>)[id])
    if (page && page.blocks.length > 0) out[id] = page
  }
  return out
}
