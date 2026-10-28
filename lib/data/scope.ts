import 'server-only'
import { redirect } from 'next/navigation'
import { getFirebaseToken, getSession, type Session } from '@/lib/auth/session'
import { getAuthEnv } from '@/lib/env'
import { SessionExpiredError } from './dashboard'

export interface HubScope {
  hubId: string
  hubName: string
  /** Set when a super admin is looking at one hub, so the sidebar shows that hub's manager menu. */
  viewAs?: { hubId: string; hubName: string }
}

/** Reads one value from the Realtime Database as the signed-in user. */
export async function readPath(path: string, token: string): Promise<unknown> {
  const { firebaseDatabaseUrl } = getAuthEnv()
  const res = await fetch(`${firebaseDatabaseUrl}/${path}.json?auth=${encodeURIComponent(token)}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  if (res.status === 401) throw new SessionExpiredError('Firebase rejected the session token.')
  if (!res.ok) throw new Error(`Realtime Database read of ${path.split('/')[0]} failed (HTTP ${res.status})`)
  return res.json()
}

/**
 * Which hub a hub-content page is about. A manager always gets their own hub; a super admin must pick one
 * (?hub=…) and then sees that hub as its manager would. Returns null when there is no hub to show.
 */
export async function resolveHubScope(session: Session, hubParam?: string | string[]): Promise<HubScope | null> {
  const token = await getFirebaseToken()
  if (!token) throw new SessionExpiredError('Your session has expired.')
  if (session.role !== 'super') {
    if (!session.hubId) return null
    return { hubId: session.hubId, hubName: session.hub ?? session.hubId }
  }
  const id = typeof hubParam === 'string' ? hubParam : ''
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
  const name = await readPath(`hubs_meta/${id}/name`, token)
  if (typeof name !== 'string') return null
  return { hubId: id, hubName: name, viewAs: { hubId: id, hubName: name } }
}

/** Path Finder pages: Super Admin only. Returns a null scope when no hub has been chosen yet (the page then lists hubs). */
export async function requireSuperHubContext(hubParam?: string | string[]) {
  const session = await getSession()
  if (!session) redirect('/')
  if (session.role !== 'super') redirect('/dashboard')
  try {
    return { session, scope: await resolveHubScope(session, hubParam) }
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    throw e
  }
}

/** The start of every hub-content page: signed in, and looking at a hub. */
export async function requireHubContext(hubParam?: string | string[]) {
  const session = await getSession()
  if (!session) redirect('/')
  let scope: HubScope | null = null
  try {
    scope = await resolveHubScope(session, hubParam)
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    throw e
  }
  if (!scope) redirect(session.role === 'super' ? '/dashboard/hubs' : '/dashboard')
  return { session, scope }
}
