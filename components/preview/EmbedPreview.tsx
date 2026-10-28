'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import GuestApp, { type Preview } from '@/guest-app/src/App'
import { ensureFont } from '@/guest-app/src/font'

const W = 375
const H = 720

/**
 * The real guest app (the same code and styles as the embed on the hub), drawn from the values being edited.
 * It lives in its own isolated shadow root like the embed does. Links do nothing here and the app writes nothing,
 * so previewing can never open or change anything. Announcements and events are the hub's real ones when a database address is given.
 */
export default function EmbedPreview({ hubId, dbUrl, css, preview, scale = 0.62, framed = true, caption = true }: { hubId: string; dbUrl: string; css: string; preview: Preview; scale?: number; framed?: boolean; caption?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    ensureFont()
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' })
    root.replaceChildren()
    const style = document.createElement('style')
    // The app normally fills the browser window; here it fills the phone and scrolls inside it.
    style.textContent = `${css}\n.bs-app{min-height:0!important;height:100%}.page-content{scrollbar-width:none}`
    const m = document.createElement('div')
    m.style.cssText = 'width:100%;height:100%'
    root.append(style, m)
    // Nothing inside the preview may navigate away or open a window.
    const stop = (e: Event) => {
      const a = (e.composedPath() as Element[]).find((n) => n instanceof HTMLAnchorElement)
      if (a) e.preventDefault()
    }
    root.addEventListener('click', stop, true)
    setMount(m)
    return () => root.removeEventListener('click', stop, true)
  }, [css])
  const screen = (
    <div style={{ width: W * scale, height: H * scale, overflow: 'hidden', position: 'relative' }}>
      <div ref={host} aria-label="Hub preview" role="group" style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
      {mount && createPortal(<GuestApp config={{ hubId, dbUrl, classicUrl: '' }} preview={preview} />, mount)}
    </div>
  )
  if (!framed) return <div className="mx-auto w-fit overflow-hidden rounded-2xl border border-line">{screen}</div>
  return (
    <figure aria-label="Live preview" className="m-0 flex flex-col items-center">
      <div className="overflow-hidden rounded-[30px] border-[6px] border-ink bg-ink shadow-[0_8px_24px_rgba(15,31,74,0.2)]"><div className="overflow-hidden rounded-[24px]">{screen}</div></div>
      {caption && <figcaption className="mt-2 max-w-[240px] text-center text-[11px] text-ink3">The hub as guests see it, with your edits. Tap around: nothing is saved or opened.</figcaption>}
    </figure>
  )
}
