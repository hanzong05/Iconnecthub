import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getAuthEnv } from '@/lib/env'

const MAX_BYTES = 5 * 1024 * 1024

/** The real file type from its first bytes, never from the name or the browser's claim. */
function imageKind(b: Uint8Array): { type: string; ext: string } | null {
  const is = (...sig: number[]) => sig.every((v, i) => b[i] === v)
  if (is(0xff, 0xd8, 0xff)) return { type: 'image/jpeg', ext: 'jpg' }
  if (is(0x89, 0x50, 0x4e, 0x47)) return { type: 'image/png', ext: 'png' }
  if (is(0x47, 0x49, 0x46, 0x38)) return { type: 'image/gif', ext: 'gif' }
  if (is(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { type: 'image/webp', ext: 'webp' }
  return null
}

/** Sends an image to the image host with the server's key (the key never reaches the browser). */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const origin = request.headers.get('origin')
  let originHost: string | null = null
  try {
    originHost = origin ? new URL(origin).host : null
  } catch {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  }
  if (originHost && originHost !== request.headers.get('host')) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })

  const env = getAuthEnv()
  if (!env.imgbbApiKey) return NextResponse.json({ error: 'Image upload is not set up.' }, { status: 501 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('image')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image.' }, { status: 400 })
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'The image must be under 5 MB.' }, { status: 413 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!imageKind(bytes)) return NextResponse.json({ error: 'Use a JPG, PNG, GIF or WebP image.' }, { status: 415 })

  const body = new FormData()
  body.append('image', Buffer.from(bytes).toString('base64'))
  try {
    const res = await fetch(`${env.imgbbUploadUrl}?key=${encodeURIComponent(env.imgbbApiKey)}`, { method: 'POST', body, signal: AbortSignal.timeout(30_000) })
    const json = (await res.json()) as { success?: boolean; data?: { url?: string } }
    if (!json.success || !json.data?.url?.startsWith('https://')) throw new Error('upload rejected')
    return NextResponse.json({ url: json.data.url })
  } catch {
    return NextResponse.json({ error: 'The image could not be uploaded. Try again.' }, { status: 502 })
  }
}
