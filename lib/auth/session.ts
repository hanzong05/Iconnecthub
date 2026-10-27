import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { getAuthEnv } from '@/lib/env'
import type { AuthUser } from './credentials'
import { seal, unseal } from './vault'

export const SESSION_COOKIE = 'ich_session'
const FIREBASE_COOKIE = 'ich_fb'

export interface Session {
  sub: string
  email: string
  name: string | null
  role: string
  hub: string | null
  hubId: string | null
  exp: number // seconds since epoch
}

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url')

/** Builds a signed token: base64url(payload).signature */
export function createToken(user: AuthUser, secret: string, seconds: number): string {
  const session: Session = { sub: user.id, email: user.email, name: user.name, role: user.role, hub: user.hubName, hubId: user.hubId, exp: Math.floor(Date.now() / 1000) + seconds }
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

/** Returns the session when the signature is valid and it has not expired, otherwise null. */
export function verifyToken(token: string | undefined, secret: string): Session | null {
  if (!token) return null
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null
  const expected = Buffer.from(sign(payload, secret))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session
    if (typeof s.sub !== 'string' || typeof s.email !== 'string' || typeof s.role !== 'string' || typeof s.exp !== 'number') return null
    return s.exp > Math.floor(Date.now() / 1000) ? s : null
  } catch {
    return null
  }
}

export async function startSession(user: AuthUser, refreshToken: string): Promise<void> {
  const env = getAuthEnv()
  const store = await cookies()
  store.set(SESSION_COOKIE, createToken(user, env.secret, env.sessionSeconds), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: env.sessionSeconds,
  })
  // Lets the server read Firebase data as this user. Encrypted, HttpOnly, never sent to page code.
  store.set(FIREBASE_COOKIE, seal(refreshToken), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: env.sessionSeconds,
  })
}

export async function endSession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  store.delete(FIREBASE_COOKIE)
}

/** The signed-in user, or null. Call this next to any protected data access, not just in the proxy. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  return verifyToken(store.get(SESSION_COOKIE)?.value, getAuthEnv().secret)
}

const tokenCache = new Map<string, { idToken: string; expires: number }>()

/** A fresh Firebase ID token for the signed-in user (to read the Realtime Database with their own access). */
export async function getFirebaseToken(): Promise<string | null> {
  const store = await cookies()
  const refresh = unseal(store.get(FIREBASE_COOKIE)?.value)
  if (!refresh) return null
  const cached = tokenCache.get(refresh)
  if (cached && cached.expires > Date.now() + 60_000) return cached.idToken

  const env = getAuthEnv()
  try {
    const res = await fetch(`${env.tokenBase}/v1/token?key=${encodeURIComponent(env.firebaseApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { id_token?: string; expires_in?: string }
    if (!data.id_token) return null
    if (tokenCache.size > 500) tokenCache.clear()
    tokenCache.set(refresh, { idToken: data.id_token, expires: Date.now() + Number(data.expires_in ?? 3600) * 1000 })
    return data.id_token
  } catch {
    return null
  }
}
