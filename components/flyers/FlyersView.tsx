'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { addFlyersAction, removeFlyerAction } from '@/app/actions/content'
import Modal from '@/components/ui/Modal'
import RemoteImg, { warmGuestImageCache } from '@/components/ui/RemoteImg'

export default function FlyersView({ hubId, hubName, kind, noun, initial, canUpload }: { hubId: string; hubName: string; kind: string; noun: string; initial: string[]; canUpload: boolean }) {
  const router = useRouter()
  const [flyers, setFlyers] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (!files.length) return
    setBusy(true)
    const urls: string[] = []
    let failed = 0
    for (let i = 0; i < files.length; i++) {
      setStatus({ text: `Uploading image ${i + 1} of ${files.length}…` })
      try {
        const body = new FormData()
        body.append('image', files[i])
        const res = await fetch('/api/upload', { method: 'POST', body })
        const json = (await res.json()) as { url?: string; error?: string }
        if (!res.ok || !json.url) throw new Error(json.error || 'Upload failed.')
        urls.push(json.url)
      } catch (e) {
        failed++
        if (files.length === 1) setStatus({ text: e instanceof Error ? e.message : 'Upload failed.', error: true })
      }
    }
    if (urls.length) {
      const r = await addFlyersAction(hubId, kind, urls)
      if (r.error) setStatus({ text: r.error, error: true })
      else {
        setFlyers((cur) => [...cur, ...urls])
        urls.forEach(warmGuestImageCache)
        setStatus({ text: failed ? `Added ${urls.length}, ${failed} failed.` : `Added ${urls.length} flyer${urls.length === 1 ? '' : 's'}.`, error: failed > 0 })
        router.refresh()
      }
    } else if (files.length > 1) setStatus({ text: 'None of the images could be uploaded.', error: true })
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function remove() {
    if (removing === null) return
    setBusy(true)
    const r = await removeFlyerAction(hubId, kind, removing, flyers[removing])
    setBusy(false)
    setRemoving(null)
    if (r.error) return setStatus({ text: r.error, error: true })
    setFlyers((cur) => cur.filter((_, i) => i !== removing))
    setStatus({ text: 'Flyer removed.' })
    router.refresh()
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-ink">{noun}</h2>
            <p className="text-xs text-ink3">Shown to guests of {hubName}, in this order. Add as many as you like; guests swipe through them.</p>
          </div>
          <div>
            <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" id="flyer-file" onChange={(e) => onFiles(e.target.files)} disabled={!canUpload || busy} />
            <label htmlFor="flyer-file" className={`inline-flex h-10 cursor-pointer items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dim ${!canUpload || busy ? 'pointer-events-none opacity-60' : ''}`}>
              {busy ? 'Working…' : 'Choose images to upload'}
            </label>
          </div>
        </div>
        <div className="p-5">
          {!canUpload && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">Image upload is not set up. Add IMGBB_API_KEY to the server settings.</p>}
          <div role="status" aria-live="polite" className="empty:hidden">
            {status && <p className={`mb-3 rounded-xl border px-3.5 py-2.5 text-[13px] font-medium ${status.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{status.text}</p>}
          </div>
          {flyers.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink3">No flyers yet. Upload your first one.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {flyers.map((u, i) => (
                <li key={`${u}-${i}`} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-line2 bg-surface2">
                  <RemoteImg src={u} w={400} alt={`Flyer ${i + 1}`} className="h-full w-full object-cover" />
                  <button type="button" aria-label={`Remove flyer ${i + 1}`} onClick={() => setRemoving(i)} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-base text-white hover:bg-black/80">×</button>
                  <span className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white">#{i + 1}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Modal open={removing !== null} onClose={() => setRemoving(null)} title="Remove this flyer?">
        <p className="mb-4 text-sm text-ink2">Guests will no longer see it. This cannot be undone.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRemoving(null)} className="h-11 flex-1 rounded-xl border border-line2 text-sm font-semibold text-ink">Cancel</button>
          <button type="button" disabled={busy} onClick={remove} className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-60">Remove</button>
        </div>
      </Modal>
    </div>
  )
}
