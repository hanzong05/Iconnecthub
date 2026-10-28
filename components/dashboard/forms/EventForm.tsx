'use client'

import { useActionState, useState } from 'react'
import { createEventAction, type ActionState } from '@/app/actions/content'
import type { HubOption } from '@/lib/data/dashboard'
import { Check, Field, FormMessage, HubSelect, inputClass, SubmitButton } from '@/components/ui/fields'
import RemoteImg from '@/components/ui/RemoteImg'

const INITIAL: ActionState = {}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const chip = (on: boolean) => `h-9 min-w-11 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${on ? 'border-brand bg-brand text-white' : 'border-line2 bg-surface2 text-ink2 hover:border-brand'}`

export default function EventForm({ hubs, canNotify, canUpload, onDone }: { hubs: HubOption[]; canNotify: boolean; canUpload: boolean; onDone: () => void }) {
  const [days, setDays] = useState<string[]>([])
  const [dates, setDates] = useState<string[]>([])
  const [pick, setPick] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [upload, setUpload] = useState<{ busy: boolean; error?: string }>({ busy: false })

  const [state, action, pending] = useActionState(
    async (prev: ActionState, data: FormData) => {
      const result = await createEventAction(prev, data)
      if (result.success) onDone()
      return result
    },
    INITIAL,
  )

  async function onFile(file: File | undefined) {
    if (!file) return
    setUpload({ busy: true })
    try {
      const body = new FormData()
      body.append('image', file)
      const res = await fetch('/api/upload', { method: 'POST', body })
      const json = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !json.url) throw new Error(json.error || 'Upload failed.')
      setImageUrl(json.url)
      setUpload({ busy: false })
    } catch (e) {
      setUpload({ busy: false, error: e instanceof Error ? e.message : 'Upload failed.' })
    }
  }

  const toggleDay = (d: string) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
  const addDate = () => {
    if (pick && !dates.includes(pick)) setDates((cur) => [...cur, pick].sort())
    setPick('')
  }

  return (
    <form action={action}>
      <FormMessage error={state.error} />
      <input type="hidden" name="days" value={days.join(',')} />
      <input type="hidden" name="dates" value={dates.join(',')} />
      <input type="hidden" name="imageUrl" value={imageUrl} />

      <Field label="Hub" htmlFor="ev-hub">
        <HubSelect id="ev-hub" options={hubs} />
      </Field>
      <Field label="Title" htmlFor="ev-title">
        <input id="ev-title" name="title" required maxLength={120} placeholder="e.g. Swimming Pool" className={inputClass} />
      </Field>
      <Field label="Short description" htmlFor="ev-desc" hint="Shown on the event card.">
        <input id="ev-desc" name="description" maxLength={300} className={inputClass} />
      </Field>
      <Field label="Full description" htmlFor="ev-full" hint="Shown when a guest opens the details.">
        <textarea id="ev-full" name="fullDesc" maxLength={3000} rows={3} className={`${inputClass} resize-y`} />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Hours / schedule" htmlFor="ev-hours">
          <input id="ev-hours" name="hours" maxLength={120} placeholder="9:00 AM – 8:00 PM" className={inputClass} />
        </Field>
        <Field label="Location" htmlFor="ev-loc">
          <input id="ev-loc" name="location" maxLength={120} placeholder="Pavilion" className={inputClass} />
        </Field>
      </div>

      <Field label="Repeats every week on" hint="Pick weekdays to repeat forever. This replaces any specific dates below.">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekdays">
          {DAYS.map((d) => (
            <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => toggleDay(d)} className={chip(days.includes(d))}>
              {d}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Or specific dates" htmlFor="ev-date">
        <div className="flex gap-2">
          <input id="ev-date" type="date" value={pick} onChange={(e) => setPick(e.target.value)} disabled={days.length > 0} className={inputClass} />
          <button type="button" onClick={addDate} disabled={!pick || days.length > 0} className="h-11 shrink-0 rounded-xl bg-surface2 px-4 text-sm font-semibold text-brand ring-1 ring-line2 disabled:opacity-50">
            Add
          </button>
        </div>
        {dates.length > 0 && days.length === 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {dates.map((d) => (
              <span key={d} className="flex items-center gap-1 rounded-full bg-[#e8f0fe] py-1 pl-3 pr-1 text-xs font-semibold text-brand">
                {d}
                <button type="button" aria-label={`Remove ${d}`} onClick={() => setDates((cur) => cur.filter((x) => x !== d))} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand/10">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </Field>

      <Field label="Event image" htmlFor="ev-image" hint={canUpload ? 'JPG, PNG, GIF or WebP, up to 5 MB.' : 'Image upload is not set up yet (needs IMGBB_API_KEY in .env).'}>
        {imageUrl && (
          <div className="mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <RemoteImg src={imageUrl} direct alt="Event preview" className="max-h-40 w-full rounded-xl border border-line2 object-cover" />
            <button type="button" onClick={() => setImageUrl('')} className="mt-1.5 text-xs font-semibold text-red-600 hover:underline">
              Remove image
            </button>
          </div>
        )}
        <input id="ev-image" type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={!canUpload || upload.busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} className="text-sm text-ink2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />
        {upload.busy && <p className="text-xs text-ink2">Uploading…</p>}
        {upload.error && <p role="alert" className="text-xs font-medium text-red-600">{upload.error}</p>}
      </Field>

      <Check name="active" label="Active" hint="Visible to guests on the events page." defaultChecked />
      {canNotify && <Check name="notify" label="Notify guests of this new event" hint="Push and email, only if the event is active." />}
      <SubmitButton pending={pending || upload.busy} tone="green">
        Save Event
      </SubmitButton>
    </form>
  )
}
