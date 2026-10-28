'use client'

import { useRef, useState } from 'react'
import { updateHubAction } from '@/app/actions/hubs'
import Icon from '@/components/ui/Icon'
import { FormMessage } from '@/components/ui/fields'
import type { HubCard } from '@/lib/data/hubs'
import RemoteImg from '@/components/ui/RemoteImg'

const field =
  'h-12 w-full rounded-xl border border-line2 bg-surface2 pl-11 pr-3.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow,background-color] placeholder:text-ink3 focus:border-brand focus:bg-surface focus:shadow-[0_0_0_3px_rgba(26,86,219,0.10)] sm:text-sm'

function Label({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-ink2">
      {children}
    </label>
  )
}

/** The Edit Hub Details form: name, location and logo. The hub ID is shown but never editable. */
export default function EditHubForm({ hub, canUpload, onCancel, onSaved }: { hub: HubCard; canUpload: boolean; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(hub.name)
  const [location, setLocation] = useState(hub.location ?? '')
  const [logoUrl, setLogoUrl] = useState<string | null>(hub.logoUrl)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = uploading || saving

  async function onFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const body = new FormData()
      body.append('image', file)
      const res = await fetch('/api/upload', { method: 'POST', body })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error || 'Upload failed.')
      setLogoUrl(json.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Hub name is required.')
    setSaving(true)
    setError('')
    const r = await updateHubAction(hub.id, { name, location, logoUrl })
    setSaving(false)
    if (r.success) onSaved()
    else setError(r.error ?? 'Could not save the changes.')
  }

  return (
    <form onSubmit={submit} noValidate>
      <FormMessage error={error} />

      <div className="mb-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line2 bg-gradient-to-b from-[#f4f8ff] to-surface2 px-4 py-5">
        <div className="relative">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <RemoteImg src={logoUrl} direct={logoUrl !== hub.logoUrl} w={96} alt="Hub logo" className="h-24 w-24 rounded-full border-4 border-white bg-white object-cover shadow-lg" />
          ) : (
            <div aria-hidden="true" className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-emerald-600 to-emerald-800 text-3xl font-bold text-white shadow-lg">
              {(name[0] ?? hub.name[0] ?? '?').toUpperCase()}
            </div>
          )}
          {uploading && (
            <div role="status" className="absolute inset-0 flex items-center justify-center rounded-full bg-white/80 text-[11px] font-bold text-ink2">
              Uploading…
            </div>
          )}
        </div>
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-[0.06em] text-ink2">Campground logo</div>
          <div className="text-[11px] text-ink3">JPG, PNG, GIF or WebP, up to 5 MB</div>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} />
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            disabled={busy || !canUpload}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dim disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon name="download" className="h-4 w-4 rotate-180" />
            {logoUrl ? 'Replace logo' : 'Upload logo'}
          </button>
          {logoUrl && (
            <button type="button" disabled={busy} onClick={() => setLogoUrl(null)} className="h-10 rounded-xl border border-line2 bg-surface px-4 text-[13px] font-semibold text-ink2 hover:border-red-300 hover:text-red-700 disabled:opacity-60">
              Remove
            </button>
          )}
        </div>
        {!canUpload && <p className="text-[11px] text-ink3">Logo upload is not set up on this server (add IMGBB_API_KEY to .env).</p>}
      </div>

      <p className="mb-6 rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-xs text-ink2">The hub banner is the Home page hero picture. Change it under Settings, Hero images.</p>

      <div className="mb-4">
        <Label htmlFor="hub-name">Hub name</Label>
        <div className="relative">
          <Icon name="map" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input id="hub-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nature's Touch Campground" className={field} />
        </div>
      </div>

      <div className="mb-4">
        <Label htmlFor="hub-location">Location</Label>
        <div className="relative">
          <Icon name="pin" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input id="hub-location" value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Wisconsin Dells, WI" className={field} />
        </div>
      </div>

      <div className="mb-6">
        <Label htmlFor="hub-id">Hub ID</Label>
        <div className="relative">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <input id="hub-id" value={hub.id} readOnly disabled className={`${field} cursor-not-allowed bg-line/40 font-mono text-[13px] text-ink2 opacity-80`} />
        </div>
        <p className="mt-1.5 text-[11px] text-ink3">The Hub ID can&apos;t be changed — it links the guest template and all data.</p>
      </div>

      <div className="flex gap-3 border-t border-line pt-4">
        <button type="button" onClick={onCancel} disabled={saving} className="h-11 flex-1 rounded-xl border border-line2 bg-surface text-sm font-semibold text-ink2 hover:border-brand disabled:opacity-60">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="h-11 flex-[1.4] rounded-xl bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:cursor-not-allowed disabled:opacity-70">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
