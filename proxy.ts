import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifyToken } from '@/lib/auth/session'

/**
 * First gate only: sends visitors to the right page. Every protected page still checks the
 * session itself with getSession(), so this is never the only protection.
 */
export function proxy(request: NextRequest) {
  const secret = process.env.AUTH_SECRET
  const signedIn = Boolean(secret && verifyToken(request.cookies.get(SESSION_COOKIE)?.value, secret))
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/dashboard') && !signedIn) return NextResponse.redirect(new URL('/', request.url))
  if (pathname === '/' && signedIn) return NextResponse.redirect(new URL('/dashboard', request.url))
  return NextResponse.next()
}

export const config = { matcher: ['/', '/dashboard/:path*'] }
