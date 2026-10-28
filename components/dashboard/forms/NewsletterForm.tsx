'use client'

import { useCallback, useEffect, useState } from 'react'
import { getNewsletterImageAction, saveNewsletterImageAction } from '@/app/actions/content'
import type { HubOption } from '@/lib/data/dashboard'
import { Field, FormMessage, inputClass } from '@/components/ui/fields'
import RemoteImg from '@/components/ui/RemoteImg'

export default function NewsletterForm({ hubs, canUpload, onChanged }: { hubs: HubOption[]; canUpload: boolean; onChanged: () => void }) {
  const [hubId, setHubId] = useState(hubs[0]?.id ?? '')
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({})

  const load = useCallback(async (id: string) => {
    if (!id) return
    setBusy(true)
    const r = await getNewsletterImageAction(id)
    setUrl(r.url)
    setMsg(r.error ? { error: r.error } : {})
    setBusy(false)
  }, [])

  useEffect(() => {
    void load(hubId)
  }, [hubId, load])

  async function save(next: string | null) {
    setBusy(true)
    const r = await saveNewsletterImageAction(hubId, next)
    setMsg(r)
    if (r.success) {
      setUrl(next)
      onChanged()
    }
    setBusy(false)
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setMsg({})
    try {
      const body = new FormData()
      body.append('image', file)
      const res = await fetch('/api/upload', { method: 'POST', body })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error || 'Upload failed.')
      await save(json.url)
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : 'Upload failed.' })
      setBusy(false)
    }
  }

  return (
    <div>
      <FormMessage error={msg.error} success={msg.success} />
      <Field label="Hub" htmlFor="nl-hub">
        <select id="nl-hub" value={hubId} onChange={(e) => setHubId(e.target.value)} disabled={busy} className={inputClass}>
          {hubs.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </Field>

      {url ? (
        <div className="mb-3.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink2">Current image</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <RemoteImg src={url} direct alt="Current newsletter" className="w-full rounded-xl border border-line2" />
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm('Remove the current newsletter image?') && void save(null)}
            className="mt-2 h-10 w-full rounded-xl border border-red-300 bg-red-50 text-sm font-semibold text-red-700 disabled:opacity-60"
          >
            Remove image
          </button>
        </div>
      ) : (
        <div className="mb-3.5 rounded-xl bg-surface2 p-4 text-center text-[13px] text-ink3">{busy ? 'Loading…' : 'No newsletter image set for this hub.'}</div>
      )}

      <Field label="Upload image" htmlFor="nl-file" hint={canUpload ? 'JPG, PNG, GIF or WebP, up to 5 MB. It replaces the current image.' : 'Image upload is not set up yet (needs IMGBB_API_KEY in .env).'}>
        <input id="nl-file" type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={!canUpload || busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} className="text-sm text-ink2 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />
      </Field>
    </div>
  )
}
