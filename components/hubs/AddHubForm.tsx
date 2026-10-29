'use client'

import { useState } from 'react'
import { createHubAction } from '@/app/actions/hubs'
import { FormMessage } from '@/components/ui/fields'

const field = 'h-12 w-full rounded-xl border border-line2 bg-surface2 px-3.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow,background-color] placeholder:text-ink3 focus:border-brand focus:bg-surface focus:shadow-[0_0_0_3px_rgba(26,86,219,0.10)] sm:text-sm'

const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)

/** Add a hub: a name, an optional location and the hub ID (suggested from the name). The ID cannot be changed later. */
export default function AddHubForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (name: string) => void }) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [id, setId] = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Hub name is required.')
    setSaving(true)
    setError('')
    const r = await createHubAction({ id, name, location })
    setSaving(false)
    if (r.success) onCreated(name.trim())
    else setError(r.error ?? 'Could not create the hub.')
  }

  return (
    <form onSubmit={submit} noValidate>
      <FormMessage error={error} />
      <div className="mb-4">
        <label htmlFor="new-hub-name" className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-ink2">Hub name</label>
        <input id="new-hub-name" autoFocus value={name} maxLength={120} placeholder="e.g. Test Campground" className={field} onChange={(e) => { setName(e.target.value); if (!idTouched) setId(slug(e.target.value)) }} />
      </div>
      <div className="mb-4">
        <label htmlFor="new-hub-location" className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-ink2">Location (optional)</label>
        <input id="new-hub-location" value={location} maxLength={120} placeholder="e.g. Wisconsin Dells, WI" className={field} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="mb-6">
        <label htmlFor="new-hub-id" className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-ink2">Hub ID</label>
        <input id="new-hub-id" value={id} maxLength={48} spellCheck={false} className={`${field} font-mono text-[13px]`} onChange={(e) => { setIdTouched(true); setId(e.target.value.toLowerCase()) }} aria-describedby="new-hub-id-hint" />
        <p id="new-hub-id-hint" className="mt-1.5 text-[11px] text-ink3">Letters, numbers and dashes. It links the guest app and all hub data, so it can&apos;t be changed later.</p>
      </div>
      <div className="flex gap-3 border-t border-line pt-4">
        <button type="button" onClick={onCancel} disabled={saving} className="h-11 flex-1 rounded-xl border border-line2 bg-surface text-sm font-semibold text-ink2 hover:border-brand disabled:opacity-60">Cancel</button>
        <button type="submit" disabled={saving} className="h-11 flex-[1.4] rounded-xl bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:cursor-not-allowed disabled:opacity-70">{saving ? 'Creating…' : 'Create hub'}</button>
      </div>
    </form>
  )
}
