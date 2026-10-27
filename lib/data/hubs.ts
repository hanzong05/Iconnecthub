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
  /** Registered guests on the hub, or null when the count could not be read. */
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

/** How many records sit under a path. A shallow read returns only the keys, so large guest lists stay cheap. */
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
      const [visitors, posts] = await Promise.all([count(`hubs/${id}/guests`, token), count(`hubs/${id}/announcements`, token)])
      return {
        id,
        name: text(h.name) || id,
        location: text(h.location) || null,
        logoUrl: httpsUrl(h.logoUrl),
        coverUrl: httpsUrl(h.coverUrl) ?? httpsUrl(h.bannerUrl) ?? httpsUrl(h.heroUrl),
        active: h.active !== false && text(h.status).toLowerCase() !== 'inactive',
        visitors,
        posts,
      }
    }),
  )
}
