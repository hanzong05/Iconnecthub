'use client'

/** Browser-side image preparation for the map screens. Pictures are encoded to WebP, then uploaded to the image host. */
export interface Prepared {
  blob: Blob
  width: number
  height: number
}

const MAP_LIMIT = 4_500_000 // /api/upload accepts up to 5 MB
const TARGET = 1_800_000

async function bitmapOf(file: File): Promise<ImageBitmap> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (PNG, JPG or WebP).')
  try {
    // Apply the photo's own rotation (phones store it as metadata) so the map keeps its orientation.
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Could not read that image.')
  }
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
}

async function draw(bitmap: ImageBitmap, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image processing is not available in this browser.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

/** Main map picture: shrunk so its longest side is at most 2400 px (smaller until it is about 1.8 MB or less). */
export async function prepareMapImage(file: File): Promise<Prepared> {
  const bitmap = await bitmapOf(file)
  let max = 2400
  let fallback: Prepared | null = null
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = await draw(bitmap, width, height)
    for (const q of [0.82, 0.68, 0.55]) {
      const blob = await encode(canvas, q)
      if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot create WebP images. Use Chrome, Edge or Firefox.')
      if (blob.size <= TARGET) return { blob, width, height }
      if (blob.size <= MAP_LIMIT && !fallback) fallback = { blob, width, height }
    }
    max = Math.round(max * 0.8)
  }
  if (fallback) return fallback
  throw new Error('This image is still too large after compression. Use a smaller image.')
}

/** Second (detail) picture: kept at its own pixel size so it lines up with the main image. */
export async function prepareExactImage(file: File): Promise<Prepared> {
  const bitmap = await bitmapOf(file)
  const canvas = await draw(bitmap, bitmap.width, bitmap.height)
  for (const q of [0.82, 0.68, 0.55, 0.4]) {
    const blob = await encode(canvas, q)
    if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot create WebP images. Use Chrome, Edge or Firefox.')
    if (blob.size <= MAP_LIMIT) return { blob, width: bitmap.width, height: bitmap.height }
  }
  throw new Error('This image is too large to keep at its full size. Make it smaller, keeping the same proportions as the first image.')
}

/** Sends a prepared image to the image host through the project's upload route and returns its https address. */
export async function uploadPrepared(p: Prepared): Promise<{ url: string; width: number; height: number }> {
  const form = new FormData()
  form.append('image', new File([p.blob], 'map.webp', { type: 'image/webp' }))
  let res: Response
  try {
    res = await fetch('/api/upload', { method: 'POST', body: form })
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok || !data.url) throw new Error(data.error || 'The image could not be uploaded.')
  return { url: data.url, width: p.width, height: p.height }
}
