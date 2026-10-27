import 'server-only'
import { getFirebaseToken, type Session } from '@/lib/auth/session'
import { getAuthEnv } from '@/lib/env'
import { SessionExpiredError } from './dashboard'

export interface SubscriberRow {
  key: string
  hubId: string
  hubName: string
  firstName: string
  lastName: string
  phone: string
  email: string
  /** ISO time the guest registered, or empty. */
  registeredAt: string
  arrivalDate: string
  departureDate: string
}

type Row = Record<string, unknown>
const text = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 200) : '')
const entries = (v: unknown): [string, Row][] =>
  v && typeof v === 'object' ? (Object.entries(v as Record<string, unknown>).filter(([, r]) => r && typeof r === 'object') as [string, Row][]) : []

async function read(path: string, token: string): Promise<unknown> {
  const { firebaseDatabaseUrl } = getAuthEnv()
  const res = await fetch(`${firebaseDatabaseUrl}/${path}.json?auth=${encodeURIComponent(token)}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  if (res.status === 401) throw new SessionExpiredError('Firebase rejected the session token.')
  if (!res.ok) throw new Error(`Realtime Database read of ${path.split('/')[0]} failed (HTTP ${res.status})`)
  return res.json()
}

/**
 * Registered guests for every hub the user may see. Only the fields shown on the page are returned:
 * push tokens and anything else on the guest record stay on the server.
 */
export async function getSubscribers(session: Session): Promise<{ hubs: { id: string; name: string }[]; guests: SubscriberRow[] }> {
  const token = await getFirebaseToken()
  if (!token) throw new SessionExpiredError('Your session has expired.')

  const meta =
    session.role === 'super'
      ? entries(await read('hubs_meta', token))
      : session.hubId
        ? ([[session.hubId, ((await read(`hubs_meta/${session.hubId}`, token)) as Row | null) ?? {}]] as [string, Row][])
        : []
  const hubs = meta.map(([id, h]) => ({ id, name: text(h.name) || id }))

  const perHub = await Promise.all(hubs.map(async (h) => ({ hub: h, data: await read(`hubs/${h.id}/guests`, token) })))
  const guests = perHub.flatMap(({ hub, data }) =>
    entries(data).map(([key, g]) => {
      const stay = (g.stayDetails && typeof g.stayDetails === 'object' ? g.stayDetails : {}) as Row
      return {
        key,
        hubId: hub.id,
        hubName: hub.name,
        firstName: text(g.firstName),
        lastName: text(g.lastName),
        phone: text(g.phone),
        email: text(g.email),
        registeredAt: text(g.registeredAt),
        arrivalDate: text(stay.arrivalDate),
        departureDate: text(stay.departureDate),
      }
    }),
  )
  return { hubs, guests }
}
