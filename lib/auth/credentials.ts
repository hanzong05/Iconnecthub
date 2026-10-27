import 'server-only'
import { getAuthEnv } from '@/lib/env'

export type Role = 'super' | 'manager' | string

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: Role
  hubName: string | null
  hubId: string | null
}

export type SignInResult = { ok: true; user: AuthUser; refreshToken: string } | { ok: false; reason: 'invalid' | 'disabled' | 'throttled' | 'unavailable'; detail?: string }

interface SignInResponse {
  localId?: string
  email?: string
  idToken?: string
  refreshToken?: string
  error?: { message?: string }
}

interface Profile {
  name?: string
  role?: string
  hubName?: string
  hubId?: string
}

/**
 * Signs in with the same Firebase project the hub admin uses (email and password), on the server.
 * The password never reaches any third party except Firebase. Wrong email and wrong password
 * give the same result so accounts cannot be guessed.
 */
export async function signInWithFirebase(email: string, password: string): Promise<SignInResult> {
  const env = getAuthEnv()
  let res: Response
  try {
    res = await fetch(`${env.identityBase}/v1/accounts:signInWithPassword?key=${encodeURIComponent(env.firebaseApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, reason: 'unavailable' }
  }

  const data = (await res.json().catch(() => ({}))) as SignInResponse
  if (!res.ok || !data.localId || !data.idToken) {
    const code = data.error?.message ?? ''
    // Server log only: the error code from Firebase, never the email or password.
    console.error(`[auth] Firebase sign-in failed: HTTP ${res.status} ${code || '(no code)'}`)
    if (code.startsWith('TOO_MANY_ATTEMPTS')) return { ok: false, reason: 'throttled' }
    if (code === 'USER_DISABLED') return { ok: false, reason: 'disabled' }
    if (res.status >= 500) return { ok: false, reason: 'unavailable', detail: `HTTP ${res.status} ${code}` }
    return { ok: false, reason: 'invalid', detail: `HTTP ${res.status} ${code || '(no code)'}` }
  }

  // Role and hub live in the Realtime Database at users/{uid}, as in the hub admin.
  let profile: Profile = {}
  try {
    const p = await fetch(`${env.firebaseDatabaseUrl}/users/${encodeURIComponent(data.localId)}.json?auth=${encodeURIComponent(data.idToken)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (p.ok) profile = ((await p.json()) as Profile | null) ?? {}
  } catch {
    // fall through with the least-privileged default
  }

  return {
    ok: true,
    user: {
      id: data.localId,
      email: data.email ?? email,
      name: profile.name ?? null,
      // Least privilege: a user with no profile is a manager, not a super admin.
      role: profile.role ?? 'manager',
      hubName: profile.hubName ?? profile.hubId ?? null,
      hubId: profile.hubId ?? null,
    },
    refreshToken: data.refreshToken ?? '',
  }
}

/** Asks the password reset worker to email a reset link. Always reports success for unknown emails. */
export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message?: string }> {
  const env = getAuthEnv()
  try {
    const res = await fetch(`${env.passwordResetWorkerUrl}/send-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) return { ok: true }
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: false, message: data.error || 'Could not send reset email.' }
  } catch {
    return { ok: false, message: 'Could not reach the reset service. Try again.' }
  }
}
