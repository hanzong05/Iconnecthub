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
  email?: string
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

  return {
    ok: true,
    user: await loadUser(data.localId, data.idToken, data.email ?? email),
    refreshToken: data.refreshToken ?? '',
  }
}

/** Role and hub live in the Realtime Database at users/{uid}, as in the hub admin. */
async function loadUser(uid: string, idToken: string, email: string, preferProfileEmail = false): Promise<AuthUser> {
  const env = getAuthEnv()
  let profile: Profile = {}
  try {
    const p = await fetch(`${env.firebaseDatabaseUrl}/users/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(idToken)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (p.ok) profile = ((await p.json()) as Profile | null) ?? {}
  } catch {
    // fall through with the least-privileged default
  }
  return {
    id: uid,
    // A social sign-in reports the provider's email, which may differ from the account's: the session keeps the account's.
    email: (preferProfileEmail && profile.email) || email,
    name: profile.name ?? null,
    // Least privilege: a user with no profile is a manager, not a super admin.
    role: profile.role ?? 'manager',
    hubName: profile.hubName ?? profile.hubId ?? null,
    hubId: profile.hubId ?? null,
  }
}

export type SocialProviderId = 'google.com' | 'apple.com'

export type SocialSignInResult = SignInResult | { ok: false; reason: 'not_linked' }

interface IdpResponse extends SignInResponse {
  isNewUser?: boolean
  needConfirmation?: boolean
}

async function idpCall(path: string, body: object): Promise<{ res: Response; data: Record<string, unknown> }> {
  const env = getAuthEnv()
  const res = await fetch(`${env.identityBase}/v1/${path}?key=${encodeURIComponent(env.firebaseApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  return { res, data: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

const idpBody = (providerId: SocialProviderId, providerIdToken: string, requestUri: string) => ({
  postBody: `id_token=${encodeURIComponent(providerIdToken)}&providerId=${providerId}`,
  requestUri,
  returnSecureToken: true,
  returnIdpCredential: true,
})

/**
 * Signs in with Google or Apple. This never signs anyone up: Firebase creates an account for an unknown identity, so a
 * brand-new account is deleted again straight away and the sign-in is refused. Only a person who already bound the
 * provider (from the Account page) gets in.
 */
export async function signInWithProvider(providerId: SocialProviderId, providerIdToken: string, requestUri: string): Promise<SocialSignInResult> {
  let call: Awaited<ReturnType<typeof idpCall>>
  try {
    call = await idpCall('accounts:signInWithIdp', idpBody(providerId, providerIdToken, requestUri))
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
  const { res } = call
  const data = call.data as IdpResponse
  if (!res.ok) {
    const code = data.error?.message ?? ''
    console.error(`[auth] Firebase ${providerId} sign-in failed: HTTP ${res.status} ${code || '(no code)'}`)
    if (code === 'USER_DISABLED') return { ok: false, reason: 'disabled' }
    return { ok: false, reason: res.status >= 500 ? 'unavailable' : 'invalid' }
  }
  if (data.isNewUser) {
    if (data.idToken) await idpCall('accounts:delete', { idToken: data.idToken }).catch(() => null)
    return { ok: false, reason: 'not_linked' }
  }
  if (!data.localId || !data.idToken || data.needConfirmation) return { ok: false, reason: 'not_linked' }
  return { ok: true, user: await loadUser(data.localId, data.idToken, data.email ?? '', true), refreshToken: data.refreshToken ?? '' }
}

export type LinkResult = { ok: true } | { ok: false; reason: 'already_linked' | 'unavailable' | 'failed' }

/** Binds a Google or Apple identity to the signed-in account (identified by their own Firebase ID token). */
export async function linkProvider(idToken: string, providerId: SocialProviderId, providerIdToken: string, requestUri: string): Promise<LinkResult> {
  try {
    const { res, data } = await idpCall('accounts:signInWithIdp', { ...idpBody(providerId, providerIdToken, requestUri), idToken })
    if (res.ok) return { ok: true }
    const code = (data.error as { message?: string } | undefined)?.message ?? ''
    console.error(`[auth] Firebase ${providerId} link failed: HTTP ${res.status} ${code || '(no code)'}`)
    if (code.startsWith('FEDERATED_USER_ID_ALREADY_LINKED') || code.startsWith('CREDENTIAL_ALREADY_IN_USE')) return { ok: false, reason: 'already_linked' }
    return { ok: false, reason: res.status >= 500 ? 'unavailable' : 'failed' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

export interface LinkedProvider {
  providerId: string
  email: string | null
}

/** The sign-in methods on the account: 'password', 'google.com', 'apple.com'. Null when Firebase cannot be reached. */
export async function listProviders(idToken: string): Promise<LinkedProvider[] | null> {
  try {
    const { res, data } = await idpCall('accounts:lookup', { idToken })
    if (!res.ok) return null
    const user = (data.users as { providerUserInfo?: { providerId?: string; email?: string }[] }[] | undefined)?.[0]
    return (user?.providerUserInfo ?? []).filter((p) => typeof p.providerId === 'string').map((p) => ({ providerId: p.providerId as string, email: p.email ?? null }))
  } catch {
    return null
  }
}

export type UnlinkResult = { ok: true } | { ok: false; reason: 'last_method' | 'not_linked' | 'unavailable' }

/** Removes a bound provider. The account always keeps at least one other way to sign in. */
export async function unlinkProvider(idToken: string, providerId: SocialProviderId): Promise<UnlinkResult> {
  const linked = await listProviders(idToken)
  if (!linked) return { ok: false, reason: 'unavailable' }
  if (!linked.some((p) => p.providerId === providerId)) return { ok: false, reason: 'not_linked' }
  if (!linked.some((p) => p.providerId !== providerId)) return { ok: false, reason: 'last_method' }
  try {
    const { res } = await idpCall('accounts:update', { idToken, deleteProvider: [providerId] })
    return res.ok ? { ok: true } : { ok: false, reason: 'unavailable' }
  } catch {
    return { ok: false, reason: 'unavailable' }
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
