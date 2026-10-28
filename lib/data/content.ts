import 'server-only'
import { getFirebaseToken } from '@/lib/auth/session'
import { SessionExpiredError } from './dashboard'
import { readPath } from './scope'

type Row = Record<string, unknown>
const str = (v: unknown, max = 4000): string => (typeof v === 'string' ? v.slice(0, max) : '')
const httpsUrl = (v: unknown): string | null => (typeof v === 'string' && /^https:\/\//i.test(v) ? v : null)
const rows = (v: unknown): [string, Row][] => (v && typeof v === 'object' ? (Object.entries(v as Record<string, unknown>).filter(([, r]) => r && typeof r === 'object') as [string, Row][]) : [])

async function token(): Promise<string> {
  const t = await getFirebaseToken()
  if (!t) throw new SessionExpiredError('Your session has expired.')
  return t
}

export interface AnnouncementRow {
  id: string
  hubId: string
  global: boolean
  title: string
  message: string
  type: string
  active: boolean
  createdBy: string
  createdAt: string
  expiresAt: string | null
  scheduledAt: string | null
}

const TYPES = ['info', 'warning', 'alert', 'success']

/** A hub's announcements plus the ones posted to every hub (read-only here). Newest first. */
export async function getAnnouncements(hubId: string): Promise<AnnouncementRow[]> {
  const t = await token()
  const [own, global] = await Promise.all([readPath(`hubs/${hubId}/announcements`, t), readPath('hubs/_global/announcements', t).catch(() => null)])
  const map = (entries: [string, Row][], isGlobal: boolean): AnnouncementRow[] =>
    entries.map(([id, a]) => ({
      id,
      hubId: isGlobal ? '_global' : hubId,
      global: isGlobal,
      title: str(a.title, 200) || 'Untitled',
      message: str(a.message),
      type: TYPES.includes(str(a.type, 20)) ? str(a.type, 20) : 'info',
      active: a.active !== false,
      createdBy: str(a.createdBy, 200),
      createdAt: str(a.createdAt, 40),
      expiresAt: str(a.expiresAt, 40) || null,
      scheduledAt: str(a.scheduledAt, 40) || null,
    }))
  return [...map(rows(own), false), ...map(rows(global), true)].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
}

export interface EventRow {
  id: string
  hubId: string
  global: boolean
  title: string
  description: string
  fullDesc: string
  hours: string
  location: string
  imageUrl: string | null
  active: boolean
  dates: string[]
  days: string[]
  order: number
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export async function getEvents(hubId: string): Promise<EventRow[]> {
  const t = await token()
  const [own, global] = await Promise.all([readPath(`hubs/${hubId}/activities`, t), readPath('hubs/_global/activities', t).catch(() => null)])
  const map = (entries: [string, Row][], isGlobal: boolean): EventRow[] =>
    entries.map(([id, a]) => ({
      id,
      hubId: isGlobal ? '_global' : hubId,
      global: isGlobal,
      title: str(a.title, 200) || 'Untitled',
      description: str(a.description, 400),
      fullDesc: str(a.fullDesc),
      hours: str(a.hours, 200),
      location: str(a.location, 200),
      imageUrl: httpsUrl(a.imageUrl),
      active: a.active !== false,
      dates: Array.isArray(a.dates) ? a.dates.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 400) : [],
      days: Array.isArray(a.days) ? a.days.filter((d): d is string => typeof d === 'string' && DAYS.includes(d)) : [],
      order: Number(a.order) || 0,
    }))
  return [...map(rows(own), false), ...map(rows(global), true)].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
}

export interface ChatThread {
  id: string
  name: string
  last: string
  lastAt: string
  unread: boolean
}

export async function getChatThreads(hubId: string): Promise<ChatThread[]> {
  const t = await token()
  const raw = await readPath(`hubs/${hubId}/chats`, t)
  return rows(raw)
    .map(([id, c]) => ({ id, name: str(c.guestName, 120) || `Guest #${id.slice(-6)}`, last: str(c.lastMessage, 200), lastAt: str(c.lastAt, 40), unread: c.unreadAdmin === true }))
    .sort((a, b) => (Date.parse(b.lastAt) || 0) - (Date.parse(a.lastAt) || 0))
}

export interface ChatMessage {
  id: string
  sender: 'admin' | 'guest'
  senderName: string
  text: string
  at: string
}

export async function getChatMessages(hubId: string, sessionId: string): Promise<ChatMessage[]> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return []
  const t = await token()
  const raw = await readPath(`hubs/${hubId}/chats/${sessionId}/messages`, t)
  return rows(raw)
    .map(([id, m]) => ({ id, sender: m.sender === 'admin' ? ('admin' as const) : ('guest' as const), senderName: str(m.senderName, 120), text: str(m.text, 4000), at: str(m.at, 40) }))
    .sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0))
}

export interface GuestBrief {
  key: string
  name: string
}

/** Registered guests, for starting a new conversation. */
export async function getGuestBriefs(hubId: string): Promise<GuestBrief[]> {
  const t = await token()
  const raw = await readPath(`hubs/${hubId}/guests`, t)
  return rows(raw)
    .map(([key, g]) => ({ key, name: `${str(g.firstName, 80)} ${str(g.lastName, 80)}`.trim() || str(g.email, 120) || `Guest #${key.slice(-6)}` }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 500)
}

export async function getNewsletterUrl(hubId: string): Promise<string | null> {
  const t = await token()
  return httpsUrl(await readPath(`hubs/${hubId}/settings/newsletterImageUrl`, t))
}

export type FlyerKind = 'monthlyHappenings' | 'musicFestival'

/** The ordered flyer links for one of the flyer pages. */
export async function getFlyers(hubId: string, kind: FlyerKind): Promise<string[]> {
  const t = await token()
  const v = await readPath(`hubs/${hubId}/settings/${kind}`, t)
  const list = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []
  return list.map(httpsUrl).filter((u): u is string => u !== null)
}
