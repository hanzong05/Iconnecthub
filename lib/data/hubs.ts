import 'server-only'
import { getFirebaseToken, type Session } from '@/lib/auth/session'
import { getAuthEnv } from '@/lib/env'
import { SessionExpiredError } from './dashboard'

export interface HubCard {
  id: string
  name: string
  location: string | null
  logoUrl: string | null
  coverUrl: string | null
  active: boolean
  /** Visits to the hub (every camper who opened it), or null when the count could not be read. */
  visitors: number | null
  /** Announcements posted on the hub, or null when the count could not be read. */
  posts: number | null
}

type Row = Record<string, unknown>
const text = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 200) : '')
const httpsUrl = (v: unknown): string | null => (typeof v === 'string' && /^https:\/\//i.test(v) ? v : null)

async function read(path: string, token: string, shallow = false): Promise<unknown> {
  const { firebaseDatabaseUrl } = getAuthEnv()
  const res = await fetch(`${firebaseDatabaseUrl}/${path}.json?${shallow ? 'shallow=true&' : ''}auth=${encodeURIComponent(token)}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  if (res.status === 401) throw new SessionExpiredError('Firebase rejected the session token.')
  if (!res.ok) throw new Error(`Realtime Database read of ${path.split('/')[0]} failed (HTTP ${res.status})`)
  return res.json()
}

/** How many records sit under a path. A shallow read returns only the keys, so large lists stay cheap. */
async function count(path: string, token: string): Promise<number | null> {
  try {
    const v = await read(path, token, true)
    return v && typeof v === 'object' ? Object.keys(v).length : 0
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e
    console.error('[hubs] count failed for', path.split('/').slice(0, 3).join('/'))
    return null
  }
}

/** Visits to a hub: the counter the guest app bumps on every page load (hubs/{id}/analytics/count), as on the hub admin. */
async function visitCount(hubId: string, token: string): Promise<number | null> {
  try {
    const v = await read(`hubs/${hubId}/analytics/count`, token)
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e
    console.error('[hubs] visit count failed for', hubId)
    return null
  }
}

/** The picture uploaded as the hub's Home hero in Settings. It is the hub's banner everywhere. Null when none (or it cannot be read). */
async function homeHero(hubId: string, token: string): Promise<string | null> {
  try {
    return httpsUrl(await read(`hubs/${hubId}/settings/heroImages/home`, token))
  } catch (e) {
    if (e instanceof SessionExpiredError) throw e
    return null
  }
}

/** Every hub the user may see, with its visitor and post counts. Super admins see all hubs; others only their own. */
export async function getHubCards(session: Session): Promise<HubCard[]> {
  const token = await getFirebaseToken()
  if (!token) throw new SessionExpiredError('Your session has expired.')

  const meta: [string, Row][] =
    session.role === 'super'
      ? (Object.entries(((await read('hubs_meta', token)) as Record<string, unknown> | null) ?? {}).filter(([, h]) => h && typeof h === 'object') as [string, Row][])
      : session.hubId
        ? [[session.hubId, ((await read(`hubs_meta/${session.hubId}`, token)) as Row | null) ?? {}]]
        : []

  return Promise.all(
    meta.map(async ([id, h]) => {
      const [visitors, posts, hero] = await Promise.all([visitCount(id, token), count(`hubs/${id}/announcements`, token), homeHero(id, token)])
      return {
        id,
        name: text(h.name) || id,
        location: text(h.location) || null,
        logoUrl: httpsUrl(h.logoUrl),
        coverUrl: hero,
        active: h.active !== false && text(h.status).toLowerCase() !== 'inactive',
        visitors,
        posts,
      }
    }),
  )
}

export interface HubManageData {
  hub: { id: string; name: string; location: string | null; logoUrl: string | null; coverUrl: string | null; description: string | null; publicUrl: string | null; active: boolean }
  visits: number | null
  totals: { events: number; guests: number | null; announcements: number }
  announcements: { id: string; title: string; message: string; createdAt: string; imageUrl: string | null }[]
  /** Active events, soonest first is decided on the page from the viewer's clock. */
  events: { id: string; title: string; hours: string; location: string; imageUrl: string | null; dates: string[]; days: string[]; createdAt: string }[]
  newsletterUrl: string | null
  wifi: { ssid: string; password: string }
  /** null when the conversations could not be read. */
  chats: { id: string; name: string; last: string; lastAt: string; unread: boolean }[] | null
}

const rows = (v: unknown): [string, Row][] =>
  v && typeof v === 'object' ? (Object.entries(v as Record<string, unknown>).filter(([, r]) => r && typeof r === 'object') as [string, Row][]) : []
const strings = (v: unknown, re: RegExp): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && re.test(x)).slice(0, 400) : [])

/** Everything the hub dashboard shows for one hub. Returns null when the hub does not exist or the user may not see it. */
export async function getHubManage(session: Session, hubId: string): Promise<HubManageData | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(hubId)) return null
  if (session.role !== 'super' && session.hubId !== hubId) return null
  const token = await getFirebaseToken()
  if (!token) throw new SessionExpiredError('Your session has expired.')

  const meta = (await read(`hubs_meta/${hubId}`, token)) as Row | null
  if (!meta || typeof meta !== 'object') return null

  const [visits, guestCount, anns, globalAnns, acts, globalActs, newsletter, wifi, chatsRaw, hero] = await Promise.all([
    visitCount(hubId, token),
    count(`hubs/${hubId}/guests`, token),
    read(`hubs/${hubId}/announcements`, token),
    read('hubs/_global/announcements', token).catch(() => null),
    read(`hubs/${hubId}/activities`, token),
    read('hubs/_global/activities', token).catch(() => null),
    read(`hubs/${hubId}/settings/newsletterImageUrl`, token),
    read(`hubs/${hubId}/settings/wifi`, token),
    read(`hubs/${hubId}/chats`, token).catch((e) => {
      if (e instanceof SessionExpiredError) throw e
      console.error('[hubs] chats could not be read for', hubId)
      return undefined
    }),
    homeHero(hubId, token),
  ])

  const when = (r: Row) => Date.parse(text(r.createdAt)) || 0
  const allAnns = [...rows(anns), ...rows(globalAnns)]
  const announcements = [...allAnns]
    .sort(([, a], [, b]) => when(b) - when(a))
    .slice(0, 3)
    .map(([id, a]) => ({ id, title: text(a.title) || 'Untitled', message: text(a.message).slice(0, 90), createdAt: text(a.createdAt), imageUrl: httpsUrl(a.imageUrl) }))

  const allActs = [...rows(acts), ...rows(globalActs)]
  const events = allActs
    .filter(([, a]) => a.active !== false)
    .sort(([, a], [, b]) => (Number(a.order) || 0) - (Number(b.order) || 0) || text(a.title).localeCompare(text(b.title)))
    .slice(0, 40)
    .map(([id, a]) => ({
      id,
      title: text(a.title) || 'Untitled',
      hours: text(a.hours),
      location: text(a.location),
      imageUrl: httpsUrl(a.imageUrl),
      dates: strings(a.dates, /^\d{4}-\d{2}-\d{2}$/),
      days: strings(a.days, /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/),
      createdAt: text(a.createdAt),
    }))

  const w = (wifi && typeof wifi === 'object' ? wifi : {}) as Row
  const chats =
    chatsRaw === undefined
      ? null
      : rows(chatsRaw)
          .map(([id, c]) => ({ id, name: text(c.guestName) || `Guest #${id.slice(-6)}`, last: text(c.lastMessage).slice(0, 70), lastAt: text(c.lastAt), unread: c.unreadAdmin === true }))
          .sort((a, b) => (Date.parse(b.lastAt) || 0) - (Date.parse(a.lastAt) || 0))
          .slice(0, 5)

  return {
    hub: {
      id: hubId,
      name: text(meta.name) || hubId,
      location: text(meta.location) || null,
      logoUrl: httpsUrl(meta.logoUrl),
      coverUrl: hero,
      description: text(meta.description) || null,
      publicUrl: httpsUrl(meta.publicUrl) ?? httpsUrl(meta.hubUrl) ?? httpsUrl(meta.url),
      active: meta.active !== false && text(meta.status).toLowerCase() !== 'inactive',
    },
    visits,
    totals: { events: allActs.length, guests: guestCount, announcements: allAnns.length },
    announcements,
    events,
    newsletterUrl: httpsUrl(newsletter),
    wifi: { ssid: text(w.ssid), password: typeof w.password === 'string' ? w.password.slice(0, 200) : '' },
    chats,
  }
}
