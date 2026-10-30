import { NextResponse, type NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { linkProvider, signInWithProvider } from '@/lib/auth/credentials'
import { exchangeCode, OAUTH_COOKIE, OAUTH_COOKIE_PATH, parseProvider, providerInfo, readState, redirectUri, siteOrigin } from '@/lib/auth/oauth'
import { clearFailures, recordFailure, retryAfter } from '@/lib/auth/rate-limit'
import { getFirebaseToken, getSession, startSession } from '@/lib/auth/session'
import { getAuthEnv } from '@/lib/env'

/**
 * Where Google / Apple send the person back. The state cookie set by /start must match, so a link crafted by someone
 * else cannot sign you in to, or bind, their identity. Sign-in never creates an account; binding needs the same
 * signed-in user who started it.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const key = parseProvider((await ctx.params).provider)
  if (!key) return new NextResponse('Not found', { status: 404 })

  const origin = siteOrigin(request.nextUrl.origin)
  const q = request.nextUrl.searchParams
  const state = readState(request.cookies.get(OAUTH_COOKIE)?.value, key, q.get('state'))
  const link = state?.m === 'link'

  const done = (path: string) => {
    const res = NextResponse.redirect(new URL(path, origin))
    res.cookies.set(OAUTH_COOKIE, '', { path: OAUTH_COOKIE_PATH, maxAge: 0 })
    res.headers.set('Cache-Control', 'no-store')
    return res
  }
  const fail = (code: string) => done(`${link ? '/dashboard/account' : '/'}?oauth=${code}`)

  if (!state) return done('/?oauth=cancelled')

  const env = getAuthEnv()
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = `oauth|${ip}`
  if (retryAfter(limit, env.maxAttempts)) return fail('throttled')

  const code = q.get('code')
  if (q.get('error') || !code) return fail('cancelled')

  const providerToken = await exchangeCode(key, code, state, request.nextUrl.origin)
  if (!providerToken) {
    recordFailure(limit, env.windowMs)
    return fail('failed')
  }
  const def = providerInfo(key)
  const requestUri = redirectUri(key, request.nextUrl.origin)

  if (state.m === 'link') {
    const session = await getSession()
    if (!session || session.sub !== state.u) return done('/')
    const idToken = await getFirebaseToken()
    if (!idToken) return done('/session-expired')
    const result = await linkProvider(idToken, def.firebaseId, providerToken, requestUri)
    if (!result.ok) return fail(result.reason)
    return done('/dashboard/account?oauth=linked')
  }

  const result = await signInWithProvider(def.firebaseId, providerToken, requestUri)
  if (!result.ok) {
    recordFailure(limit, env.windowMs)
    return fail(result.reason === 'invalid' ? 'failed' : result.reason)
  }
  clearFailures(limit)
  await startSession(result.user, result.refreshToken)
  return done('/dashboard')
}
