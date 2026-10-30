import { NextResponse, type NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { recordFailure, retryAfter } from '@/lib/auth/rate-limit'
import { beginFlow, OAUTH_COOKIE, OAUTH_COOKIE_PATH, parseProvider, siteOrigin } from '@/lib/auth/oauth'
import { getSession } from '@/lib/auth/session'
import { getAuthEnv } from '@/lib/env'

/**
 * Sends the browser to Google or Apple. mode=link needs a signed-in user (it binds the provider to their account);
 * mode=login is for people who already bound it. Starting a flow changes nothing by itself.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const key = parseProvider((await ctx.params).provider)
  const mode = request.nextUrl.searchParams.get('mode') === 'link' ? 'link' : 'login'
  const origin = siteOrigin(request.nextUrl.origin)
  const back = (path: string) => NextResponse.redirect(new URL(path, origin))
  if (!key) return new NextResponse('Not found', { status: 404 })

  const env = getAuthEnv()
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = `oauth-start|${ip}`
  if (retryAfter(limit, env.maxAttempts * 4)) return back(mode === 'link' ? '/dashboard/account?oauth=throttled' : '/?oauth=throttled')
  recordFailure(limit, env.windowMs) // every start counts

  let uid = ''
  if (mode === 'link') {
    const session = await getSession()
    if (!session) return back('/')
    uid = session.sub
  }

  const flow = beginFlow(key, mode, uid, request.nextUrl.origin)
  if (!flow) return back(mode === 'link' ? '/dashboard/account?oauth=unavailable' : '/?oauth=unavailable')

  const res = NextResponse.redirect(flow.url)
  res.cookies.set(OAUTH_COOKIE, flow.cookie, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: OAUTH_COOKIE_PATH, maxAge: 600 })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
