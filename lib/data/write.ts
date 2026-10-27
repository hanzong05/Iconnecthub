import 'server-only'
import { getAuthEnv } from '@/lib/env'
import { getFirebaseToken, type Session } from '@/lib/auth/session'

export class AccessError extends Error {}

/** Reads or writes the Realtime Database as the signed-in user, so database rules still apply. */
export async function rtdb(method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE', path: string, token: string, body?: unknown): Promise<unknown> {
  const { firebaseDatabaseUrl } = getAuthEnv()
  const res = await fetch(`${firebaseDatabaseUrl}/${path}.json?auth=${encodeURIComponent(token)}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 401 || res.status === 403) throw new AccessError('You do not have permission to do that.')
  if (!res.ok) throw new Error(`Database request failed (HTTP ${res.status})`)
  return res.json()
}

export interface Writer {
  token: string
  session: Session
}

/** Signed-in user plus a fresh database token. Throws AccessError when there is neither. */
export async function requireWriter(session: Session | null): Promise<Writer> {
  if (!session) throw new AccessError('Please sign in again.')
  const token = await getFirebaseToken()
  if (!token) throw new AccessError('Your session has expired. Please sign in again.')
  return { token, session }
}

/**
 * The server-side hub check: a super admin may act on any existing hub, everyone else only on their own.
 * Never rely on the form's hub choice alone.
 */
export async function assertHubAccess({ token, session }: Writer, hubId: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(hubId)) throw new AccessError('Choose a hub.')
  if (session.role === 'super') {
    const meta = await rtdb('GET', `hubs_meta/${hubId}/name`, token)
    if (meta === null) throw new AccessError('That hub does not exist.')
  } else if (session.hubId !== hubId) {
    throw new AccessError('You can only change your own hub.')
  }
  return hubId
}
