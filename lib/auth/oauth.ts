import 'server-only'
import { createHash, createSign, randomBytes, timingSafeEqual } from 'node:crypto'
import { getOAuthEnv, type OAuthProviderKey, type OAuthSettings } from '@/lib/env'
import type { SocialProviderId } from './credentials'
import { seal, unseal } from './vault'

export const OAUTH_COOKIE = 'ich_oauth'
export const OAUTH_COOKIE_PATH = '/api/auth/oauth'
const STATE_SECONDS = 600

export type OAuthMode = 'login' | 'link'

interface ProviderDef {
  key: OAuthProviderKey
  label: string
  firebaseId: SocialProviderId
  authorizeUrl: string
  tokenUrl: string
}

const PROVIDERS: Record<OAuthProviderKey, ProviderDef> = {
  google: { key: 'google', label: 'Google', firebaseId: 'google.com', authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token' },
  apple: { key: 'apple', label: 'Apple', firebaseId: 'apple.com', authorizeUrl: 'https://appleid.apple.com/auth/authorize', tokenUrl: 'https://appleid.apple.com/auth/token' },
}

export function parseProvider(value: string | undefined): OAuthProviderKey | null {
  return value === 'google' || value === 'apple' ? value : null
}

export function providerFromFirebaseId(id: string): OAuthProviderKey | null {
  return (Object.values(PROVIDERS).find((p) => p.firebaseId === id)?.key) ?? null
}

export const providerInfo = (key: OAuthProviderKey) => PROVIDERS[key]

/** The providers that are fully configured on the server. */
export function enabledProviders(): OAuthProviderKey[] {
  const env = getOAuthEnv()
  return (['google', 'apple'] as const).filter((k) => env[k])
}

function settings(key: OAuthProviderKey): OAuthSettings | null {
  return getOAuthEnv()[key]
}

/** The address the provider sends the person back to. It must match what is registered with Google / Apple exactly. */
export function redirectUri(key: OAuthProviderKey, requestOrigin: string): string {
  const base = getOAuthEnv().siteUrl ?? requestOrigin
  return `${base}${OAUTH_COOKIE_PATH}/${key}/callback`
}

/** The site origin used for redirects back into the app. */
export function siteOrigin(requestOrigin: string): string {
  return getOAuthEnv().siteUrl ?? requestOrigin
}

export interface OAuthState {
  p: OAuthProviderKey
  m: OAuthMode
  s: string // random state, echoed back by the provider
  v: string // PKCE verifier (Google)
  u: string // account being linked (link mode), empty for sign-in
  x: number // expiry, ms since epoch
}

const b64 = (buf: Buffer) => buf.toString('base64url')

/** Starts a flow: the provider address to send the browser to, and the sealed state to keep in a short-lived cookie. */
export function beginFlow(key: OAuthProviderKey, mode: OAuthMode, uid: string, requestOrigin: string): { url: string; cookie: string } | null {
  const cfg = settings(key)
  if (!cfg) return null
  const def = PROVIDERS[key]
  const state: OAuthState = { p: key, m: mode, s: b64(randomBytes(24)), v: b64(randomBytes(32)), u: uid, x: Date.now() + STATE_SECONDS * 1000 }

  const url = new URL(def.authorizeUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', cfg.clientId)
  url.searchParams.set('redirect_uri', redirectUri(key, requestOrigin))
  url.searchParams.set('state', state.s)
  if (key === 'google') {
    url.searchParams.set('scope', 'openid email')
    url.searchParams.set('prompt', 'select_account')
    url.searchParams.set('code_challenge', b64(createHash('sha256').update(state.v).digest()))
    url.searchParams.set('code_challenge_method', 'S256')
  } else {
    // No scopes are asked for, so Apple allows a plain redirect (no cross-site POST). We only need the stable Apple ID.
    url.searchParams.set('response_mode', 'query')
  }
  return { url: url.toString(), cookie: seal(JSON.stringify(state)) }
}

/** Checks the cookie and the state echoed by the provider. Returns the saved state only when they match and are fresh. */
export function readState(cookie: string | undefined, key: OAuthProviderKey, echoed: string | null): OAuthState | null {
  const raw = unseal(cookie)
  if (!raw || !echoed) return null
  try {
    const s = JSON.parse(raw) as OAuthState
    if (s.p !== key || (s.m !== 'login' && s.m !== 'link') || typeof s.s !== 'string' || typeof s.x !== 'number' || s.x < Date.now()) return null
    const a = Buffer.from(s.s)
    const b = Buffer.from(echoed)
    return a.length === b.length && timingSafeEqual(a, b) ? s : null
  } catch {
    return null
  }
}

/** Apple's client secret is a short-lived token signed with the key downloaded from the Apple developer account. */
export function appleClientSecret(cfg: OAuthSettings, now = Math.floor(Date.now() / 1000)): string {
  const apple = cfg.apple
  if (!apple) throw new Error('Apple sign-in is not configured.')
  const part = (o: object) => b64(Buffer.from(JSON.stringify(o)))
  const head = part({ alg: 'ES256', kid: apple.keyId, typ: 'JWT' })
  const body = part({ iss: apple.teamId, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: cfg.clientId })
  const sig = createSign('SHA256').update(`${head}.${body}`).sign({ key: apple.privateKey, dsaEncoding: 'ieee-p1363' })
  return `${head}.${body}.${b64(sig)}`
}

/** Trades the one-time code for the person's ID token, from the server. The secret and the token never reach the browser. */
export async function exchangeCode(key: OAuthProviderKey, code: string, state: OAuthState, requestOrigin: string): Promise<string | null> {
  const cfg = settings(key)
  if (!cfg) return null
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: cfg.clientId,
    redirect_uri: redirectUri(key, requestOrigin),
    client_secret: key === 'apple' ? appleClientSecret(cfg) : (cfg.clientSecret ?? ''),
  })
  if (key === 'google') body.set('code_verifier', state.v)
  try {
    const res = await fetch(PROVIDERS[key].tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error(`[auth] ${key} token exchange failed: HTTP ${res.status}`)
      return null
    }
    const data = (await res.json()) as { id_token?: string }
    return data.id_token || null
  } catch {
    return null
  }
}
