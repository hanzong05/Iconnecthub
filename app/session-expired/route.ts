import { NextResponse } from 'next/server'
import { endSession } from '@/lib/auth/session'

/** Clears a login that can no longer read data, then sends the person to sign in again. */
export async function GET(request: Request) {
  await endSession()
  return NextResponse.redirect(new URL('/', request.url))
}
