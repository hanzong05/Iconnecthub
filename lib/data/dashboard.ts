import 'server-only'
import { getAuthEnv } from '@/lib/env'
import { getFirebaseToken, type Session } from '@/lib/auth/session'

export interface AnnouncementItem {
  id: string
  title: string
  type: string
  hubName: string
}
export interface EventItem {
  id: string
  title: string
  detail: string
  imageUrl: string | null
  hubName: string
}
export interface HubItem {
  id: string
  name: string
  location: string | null
  logoUrl: string | null
}
export interface UserItem {
  id: string
  name: string
  roleLabel: string
  hubName: string
}
export interface NavCounts {
  subscribers: number
  announcements: number
  events: number
  hubs: number
  users: number
}
export interface HubOption {
  id: string
  name: string
}
export interface DashboardData {
  hubOptions: HubOption[]
  counts: NavCounts
  isSuper: boolean
  stats: { label: string; value: string; tone: 'purple' | 'green' | 'amber' | 'blue' | 'cyan'; icon: 'hubs' | 'group' | 'person' | 'bell' }[]
  announcements: AnnouncementItem[]
  events: EventItem[]
  hubs: HubItem[]
  recentHubs: HubItem[]
  recentUsers: UserItem[]
}

export class SessionExpiredError extends Error {}

type Json = Record<string, unknown>
type Row = Record<string, unknown>

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
/** Only http(s) image links are passed to the page. */
const safeUrl = (v: unknown): string | null => (typeof v === 'string' && /^https:\/\//i.test(v) ? v : null)
const rows = (v: unknown): [string, Row][] => (v && typeof v === 'object' ? (Object.entries(v as Json) as [string, Row][]).filter(([, r]) => r && typeof r === 'object') : [])

const ROLE_LABEL: Record<string, string> = { super: 'Super Admin', manager: 'Hub Manager', super_manager: 'Super Manager' }

async function read(path: string, token: string): Promise<unknown> {
  const { firebaseDatabaseUrl } = getAuthEnv()
  const res = await fetch(`${firebaseDatabaseUrl}/${path}.json?auth=${encodeURIComponent(token)}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (res.status === 401) throw new SessionExpiredError('Firebase rejected the session token.')
  if (!res.ok) throw new Error(`Realtime Database read of ${path.split('/')[0]} failed (HTTP ${res.status})`)
  return res.json()
}

/**
 * Builds the dashboard numbers and lists on the server, using the signed-in user's own Firebase access,
 * so database rules still decide what they can see. A super admin gets every hub; anyone else only their own.
 */
export async function getDashboardData(session: Session): Promise<DashboardData> {
  const token = await getFirebaseToken()
  if (!token) throw new SessionExpiredError('Your session has expired. Sign in again.')

  const isSuper = session.role === 'super'
  const canSeeUsers = isSuper || session.role === 'super_manager'

  let hubMeta: [string, Row][]
  if (isSuper) hubMeta = rows(await read('hubs_meta', token))
  else if (session.hubId) hubMeta = [[session.hubId, ((await read(`hubs_meta/${session.hubId}`, token)) as Row | null) ?? {}]]
  else hubMeta = []

  const hubName = (id: string) => (id === '_global' ? 'All Hubs' : text(hubMeta.find(([h]) => h === id)?.[1]?.name, id))
  const hubIds = hubMeta.map(([id]) => id)
  const contentIds = [...new Set(['_global', ...hubIds])]

  const [anns, acts, guests, users] = await Promise.all([
    Promise.all(contentIds.map(async (id) => [id, await read(`hubs/${id}/announcements`, token)] as const)),
    Promise.all(contentIds.map(async (id) => [id, await read(`hubs/${id}/activities`, token)] as const)),
    Promise.all(hubIds.map((id) => read(`hubs/${id}/guests`, token))),
    canSeeUsers ? read('users', token) : Promise.resolve(null),
  ])

  // Sidebar badges, as on the hub admin: live announcements, all events, hubs, users, subscribers.
  const liveAnnouncements = anns.reduce((n, [, v]) => n + rows(v).filter(([, a]) => a.active).length, 0)
  const totalEvents = acts.reduce((n, [, v]) => n + rows(v).length, 0)

  const announcements = anns
    .flatMap(([id, v]) => rows(v).map(([key, a]) => ({ key, id, a })))
    .sort((x, y) => Date.parse(text(y.a.createdAt)) - Date.parse(text(x.a.createdAt)) || 0)
    .slice(0, 3)
    .map(({ key, id, a }) => ({ id: `${id}/${key}`, title: text(a.title, 'Untitled'), type: text(a.type, 'info'), hubName: hubName(id) }))

  const events = acts
    .flatMap(([id, v]) => rows(v).filter(([, a]) => a.active !== false).map(([key, a]) => ({ key, id, a })))
    .sort((x, y) => (Number(x.a.order) || 0) - (Number(y.a.order) || 0) || text(x.a.title).localeCompare(text(y.a.title)))
    .slice(0, 3)
    .map(({ key, id, a }) => {
      const detail = text(a.description) || text(a.hours) || '—'
      return { id: `${id}/${key}`, title: text(a.title, 'Untitled'), detail: detail.length > 60 ? `${detail.slice(0, 60)}…` : detail, imageUrl: safeUrl(a.imageUrl), hubName: hubName(id) }
    })

  const guestList = guests.flatMap((g) => rows(g).map(([, r]) => r))
  const subscribers = guestList.length
  const notificationsOn = guestList.filter((g) => g.webPushSub || g.fcmToken).length

  const hubs: HubItem[] = hubMeta.map(([id, h]) => ({ id, name: text(h.name, id), location: text(h.location) || null, logoUrl: safeUrl(h.logoUrl) }))

  // A super manager only ever sees accounts on their own hub.
  const userRows = rows(users).filter(([, u]) => isSuper || u.hubId === session.hubId)
  const recentUsers = userRows
    .sort(([, a], [, b]) => Date.parse(text(b.createdAt)) - Date.parse(text(a.createdAt)) || 0)
    .slice(0, 3)
    .map(([id, u]) => ({ id, name: text(u.name) || text(u.email, 'User'), roleLabel: ROLE_LABEL[text(u.role)] ?? text(u.role, 'User'), hubName: hubName(text(u.hubId)) }))

  const stats: DashboardData['stats'] = isSuper
    ? [
        { label: 'Total Hubs', value: String(hubs.length), tone: 'purple', icon: 'hubs' },
        { label: 'Total Users', value: String(userRows.length), tone: 'green', icon: 'group' },
        { label: 'Active Managers', value: String(userRows.filter(([, u]) => u.role === 'manager').length), tone: 'amber', icon: 'person' },
        { label: 'Subscribers', value: subscribers.toLocaleString('en-US'), tone: 'blue', icon: 'bell' },
        { label: 'Notifications On', value: notificationsOn.toLocaleString('en-US'), tone: 'cyan', icon: 'bell' },
      ]
    : [
        { label: 'Subscribers', value: subscribers.toLocaleString('en-US'), tone: 'blue', icon: 'bell' },
        { label: 'Notifications On', value: notificationsOn.toLocaleString('en-US'), tone: 'cyan', icon: 'bell' },
      ]

  const counts: NavCounts = { subscribers, announcements: liveAnnouncements, events: totalEvents, hubs: hubs.length, users: userRows.length }

  const hubOptions = hubs.map((h) => ({ id: h.id, name: h.name }))

  return { hubOptions, counts, isSuper, stats, announcements, events, hubs, recentHubs: hubs.slice(0, 3), recentUsers }
}

export interface UserRow {
  id: string
  name: string
  email: string
  roleLabel: string
  role: string
  hubId: string
  hubName: string
  active: boolean
}

/** Every hub the signed-in user may see (a super admin sees all; others only their own). */
export async function getHubsList(session: Session): Promise<HubItem[]> {
  const token = await getFirebaseToken()
  if (!token) throw new SessionExpiredError('Your session has expired.')
  const meta =
    session.role === 'super'
      ? rows(await read('hubs_meta', token))
      : session.hubId
        ? ([[session.hubId, ((await read(`hubs_meta/${session.hubId}`, token)) as Row | null) ?? {}]] as [string, Row][])
        : []
  return meta.map(([id, h]) => ({ id, name: text(h.name, id), location: text(h.location) || null, logoUrl: safeUrl(h.logoUrl) }))
}

/** Users: all of them for a super admin, only the people on their own hub for a super manager. */
export async function getUsersList(session: Session): Promise<UserRow[]> {
  const token = await getFirebaseToken()
  if (!token) throw new SessionExpiredError('Your session has expired.')
  if (session.role !== 'super' && session.role !== 'super_manager') return []
  const [users, hubs] = await Promise.all([read('users', token), session.role === 'super' ? read('hubs_meta', token) : Promise.resolve(null)])
  const hubName = (id: string) => (id === '_global' ? 'All Hubs' : text((hubs as Json | null)?.[id] && ((hubs as Json)[id] as Row).name, session.hub ?? id))
  return rows(users)
    .filter(([, u]) => session.role === 'super' || u.hubId === session.hubId)
    .map(([id, u]) => ({ id, name: text(u.name), email: text(u.email), roleLabel: ROLE_LABEL[text(u.role)] ?? text(u.role, 'User'), role: text(u.role), hubId: text(u.hubId), active: u.active !== false, hubName: hubName(text(u.hubId)) }))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
}
