'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { saveNewsletterImageAction } from '@/app/actions/content'
import Icon from '@/components/ui/Icon'
import Modal from '@/components/ui/Modal'
import RemoteImg, { warmGuestImageCache } from '@/components/ui/RemoteImg'

export default function NewsletterView({ hub, initialUrl, canUpload }: { hub: { id: string; name: string }; initialUrl: string | null; canUpload: boolean }) {
  const router = useRouter()
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [fresh, setFresh] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setStatus({ text: 'Uploading image…' })
    try {
      const body = new FormData()
      body.append('image', file)
      const res = await fetch('/api/upload', { method: 'POST', body })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error || 'Upload failed.')
      const saved = await saveNewsletterImageAction(hub.id, json.url)
      if (saved.error) throw new Error(saved.error)
      setUrl(json.url)
      setFresh(true)
      warmGuestImageCache(json.url)
      setStatus({ text: 'Newsletter image saved. Guests will see it now.' })
      router.refresh()
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : 'Upload failed.', error: true })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove() {
    setBusy(true)
    const r = await saveNewsletterImageAction(hub.id, null)
    setBusy(false)
    setConfirming(false)
    if (r.error) return setStatus({ text: r.error, error: true })
    setUrl(null)
    setStatus({ text: 'Newsletter image removed.' })
    router.refresh()
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600/10 text-purple-700">
            <Icon name="file" />
          </div>
          <div>
            <div className="text-sm font-bold text-ink">Newsletter image</div>
            <div className="text-xs text-ink3">Shown to guests of {hub.name}. One image at a time.</div>
          </div>
        </div>

        <div className="p-5">
          {url ? (
            <RemoteImg src={url} w={700} direct={fresh} alt="Current newsletter" className="max-h-[480px] w-full rounded-xl border border-line2 object-contain" />
          ) : (
            <div className="rounded-xl border border-dashed border-line2 bg-surface2 p-10 text-center text-[13px] text-ink2">No newsletter image set for this hub.</div>
          )}

          {status && (
            <p role={status.error ? 'alert' : 'status'} className={`mt-3 text-center text-[13px] font-medium ${status.error ? 'text-red-600' : 'text-emerald-700'}`}>
              {status.text}
            </p>
          )}

          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !canUpload} onClick={() => fileRef.current?.click()} className="h-11 flex-1 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? 'Working…' : url ? 'Replace image' : 'Upload image'}
            </button>
            {url && (
              <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="h-11 rounded-xl border border-red-300 bg-red-50 px-5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">
                Remove
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-ink3">{canUpload ? 'JPG, PNG, GIF or WebP, up to 5 MB. It replaces the current image.' : 'Image upload is not set up yet (needs IMGBB_API_KEY in .env).'}</p>
        </div>
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Remove newsletter image">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
          <p className="mb-3 text-[13px] font-medium text-red-700">Remove the current newsletter image? Guests will no longer see it.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-10 flex-1 rounded-xl border border-line2 bg-surface text-sm font-semibold text-ink2">Cancel</button>
            <button type="button" onClick={() => void remove()} disabled={busy} className="h-10 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{busy ? 'Removing…' : 'Yes, remove'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
