'use client'

import { useState, type ImgHTMLAttributes } from 'react'

/** Resizes and converts to WebP through a free image proxy. It also keeps a copy of images the original host later loses. */
export function proxied(src: string, width: number): string {
  return /^https?:\/\//i.test(src) ? `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${width}&q=80&output=webp` : src
}

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width'> & {
  src: string
  /** Largest on-screen width in CSS pixels (a second file at twice this width is offered to sharp screens). */
  w?: number
  /** Show the original file directly (for a just-uploaded preview). */
  direct?: boolean
}

/** An image that tries the proxy first and falls back to the original address if the proxy cannot serve it. */
export default function RemoteImg({ src, w = 400, direct = false, alt = '', ...rest }: Props) {
  const [useOriginal, setUseOriginal] = useState(direct)
  // Normal screens get the 1x file, sharp screens the 2x one, so phones and laptops do not both download the big one.
  const shown = useOriginal ? src : proxied(src, w)
  const srcSet = useOriginal ? undefined : `${proxied(src, w)} 1x, ${proxied(src, w * 2)} 2x`
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...rest} key={shown} src={shown} srcSet={srcSet} alt={alt} referrerPolicy="no-referrer" decoding="async" loading={rest.loading ?? 'lazy'} onError={() => setUseOriginal(true)} />
}

/** Asks the proxy for the sizes the guest hubs use right after an upload, so the first guest does not wait for it. Never blocks. */
export function warmGuestImageCache(url: string): void {
  if (!/^https?:\/\//i.test(url)) return
  for (const [w, q] of [[140, 75], [128, 75], [700, 80], [800, 80], [900, 80]] as const) {
    const img = new Image()
    img.decoding = 'async'
    img.src = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&q=${q}&output=webp`
  }
}
