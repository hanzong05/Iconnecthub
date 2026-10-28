'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { deleteEventAction, runEventAlertsAction, saveEventAction, toggleEventAction } from '@/app/actions/hubcontent'
import type { ActionState } from '@/app/actions/content'
import Icon from '@/components/ui/Icon'
import Modal from '@/components/ui/Modal'
import RemoteImg from '@/components/ui/RemoteImg'
import StatTile from '@/components/ui/StatTile'
import { Check, Field, FormMessage, inputClass, SubmitButton } from '@/components/ui/fields'
import type { EventRow } from '@/lib/data/content'

const PAGE_SIZE = 8
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const control = 'h-11 rounded-xl border border-line2 bg-surface text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_3px_rgba(26,86,219,0.10)]'
const chip = (on: boolean) => `h-9 min-w-11 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${on ? 'border-brand bg-brand text-white' : 'border-line2 bg-surface2 text-ink2 hover:border-brand'}`

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const prettyDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function schedule(e: EventRow, today: string | null): string {
  if (e.days.length) return `Every ${e.days.join(', ')}`
  if (!e.dates.length) return 'No dates set'
  const next = today ? e.dates.find((d) => d >= today) : e.dates[0]
  if (today && !next) return `Ended ${prettyDate(e.dates[e.dates.length - 1])}`
  return e.dates.length === 1 ? prettyDate(e.dates[0]) : `${prettyDate(next ?? e.dates[0])} +${e.dates.length - 1} more`
}

function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total]
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', current - 1, current, current + 1, '…', total]
}

/** A month grid: click a day to add or remove it. */
function Calendar({ selected, onToggle, disabled }: { selected: string[]; onToggle: (d: string) => void; disabled: boolean }) {
  const first = selected[0] ? new Date(`${selected[0]}T00:00:00`) : new Date()
  const [y, setY] = useState(first.getFullYear())
  const [m, setM] = useState(first.getMonth())
  const lead = new Date(y, m, 1).getDay()
  const total = new Date(y, m + 1, 0).getDate()
  const cells = [...Array.from({ length: lead }, () => 0), ...Array.from({ length: total }, (_, i) => i + 1)]
  const step = (n: number) => {
    const d = new Date(y, m + n, 1)
    setY(d.getFullYear())
    setM(d.getMonth())
  }
  return (
    <div className={`rounded-xl border border-line2 bg-surface2 p-3 ${disabled ? 'pointer-events-none opacity-50' : ''}`} aria-disabled={disabled}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => step(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface"><Icon name="left" /></button>
        <div className="text-[13px] font-bold text-ink">{MONTHS[m]} {y}</div>
        <button type="button" aria-label="Next month" onClick={() => step(1)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface"><Icon name="right" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-ink3">
        {DAYS.map((d) => (
          <div key={d}>{d.slice(0, 2)}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) =>
          d === 0 ? (
            <div key={`b${i}`} />
          ) : (
            <button key={d} type="button" aria-pressed={selected.includes(iso(y, m, d))} onClick={() => onToggle(iso(y, m, d))} className={`h-9 rounded-lg text-xs font-semibold transition-colors ${selected.includes(iso(y, m, d)) ? 'bg-brand text-white' : 'text-ink hover:bg-surface'}`}>
              {d}
            </button>
          ),
        )}
      </div>
    </div>
  )
}

function EventForm({ hubId, item, canNotify, canUpload, onDone }: { hubId: string; item: EventRow | null; canNotify: boolean; canUpload: boolean; onDone: (msg: string) => void }) {
  const [days, setDays] = useState<string[]>(item?.days ?? [])
  const [dates, setDates] = useState<string[]>(item?.dates ?? [])
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '')
  const [upload, setUpload] = useState<{ busy: boolean; error?: string }>({ busy: false })
  const fileRef = useRef<HTMLInputElement>(null)

  const [state, action, pending] = useActionState(async (prev: ActionState, data: FormData) => {
    const r = await saveEventAction(prev, data)
    if (r.success) onDone(r.success)
    return r
  }, {} as ActionState)

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
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const toggleDay = (d: string) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
  const toggleDate = (d: string) => setDates((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()))

  return (
    <form action={action}>
      <FormMessage error={state.error} />
      <input type="hidden" name="hubId" value={item?.hubId ?? hubId} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="days" value={days.join(',')} />
      <input type="hidden" name="dates" value={dates.join(',')} />
      <input type="hidden" name="imageUrl" value={imageUrl} />

      <Field label="Title" htmlFor="ev-title">
        <input id="ev-title" name="title" required maxLength={120} defaultValue={item?.title} placeholder="e.g. Swimming Pool" className={inputClass} />
      </Field>
      <Field label="Short description" htmlFor="ev-desc" hint="Shown on the event card.">
        <input id="ev-desc" name="description" maxLength={300} defaultValue={item?.description} className={inputClass} />
      </Field>
      <Field label="Full description" htmlFor="ev-full" hint="Shown when a guest opens the details.">
        <textarea id="ev-full" name="fullDesc" maxLength={3000} rows={3} defaultValue={item?.fullDesc} className={`${inputClass} resize-y`} />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Hours / start time" htmlFor="ev-hours" hint="The “starting now” alert reads the first time here.">
          <input id="ev-hours" name="hours" maxLength={120} defaultValue={item?.hours} placeholder="9:00 AM – 8:00 PM" className={inputClass} />
        </Field>
        <Field label="Location" htmlFor="ev-loc">
          <input id="ev-loc" name="location" maxLength={120} defaultValue={item?.location} placeholder="Pavilion" className={inputClass} />
        </Field>
      </div>

      <Field label="Repeats every week on" hint="Pick weekdays to repeat forever. This replaces any specific dates below.">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekdays">
          {DAYS.map((d) => (
            <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => toggleDay(d)} className={chip(days.includes(d))}>{d}</button>
          ))}
        </div>
        {days.length > 0 && (
          <button type="button" onClick={() => setDays([])} className="mt-1 self-start text-xs font-semibold text-brand hover:underline">Clear weekdays</button>
        )}
      </Field>

      <Field label="Or pick specific dates" hint={days.length ? 'Clear the weekdays above to pick dates.' : `${dates.length} date${dates.length === 1 ? '' : 's'} selected.`}>
        <Calendar selected={dates} onToggle={toggleDate} disabled={days.length > 0} />
        {dates.length > 0 && days.length === 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {dates.slice(0, 40).map((d) => (
              <span key={d} className="flex items-center gap-1 rounded-full bg-[#e8f0fe] py-1 pl-3 pr-1 text-xs font-semibold text-brand">
                {prettyDate(d)}
                <button type="button" aria-label={`Remove ${d}`} onClick={() => toggleDate(d)} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand/10">×</button>
              </span>
            ))}
            {dates.length > 40 && <span className="px-2 py-1 text-xs text-ink3">+{dates.length - 40} more</span>}
          </div>
        )}
      </Field>

      <Field label="Event image" hint={canUpload ? 'JPG, PNG, GIF or WebP, up to 5 MB.' : 'Image upload is not set up yet (needs IMGBB_API_KEY in .env).'}>
        {imageUrl && (
          <div className="mb-1">
            <RemoteImg src={imageUrl} direct alt="Event preview" className="max-h-40 w-full rounded-xl border border-line2 object-cover" />
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!canUpload || upload.busy} onClick={() => fileRef.current?.click()} className="h-10 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-dim disabled:opacity-60">
            {upload.busy ? 'Uploading…' : imageUrl ? 'Replace image' : 'Choose image'}
          </button>
          {imageUrl && (
            <button type="button" onClick={() => setImageUrl('')} className="h-10 rounded-xl border border-line2 bg-surface px-4 text-[13px] font-semibold text-ink2 hover:border-red-300 hover:text-red-700">Remove</button>
          )}
        </div>
        {upload.error && <p role="alert" className="text-xs font-medium text-red-600">{upload.error}</p>}
      </Field>

      <Check name="active" label="Active" hint="Visible to guests on the events page." defaultChecked={item ? item.active : true} />
      {canNotify && !item && <Check name="notify" label="Notify guests of this new event" hint="Push and email, only if the event is active." />}
      <SubmitButton pending={pending || upload.busy} tone="green">
        {item ? 'Save changes' : 'Save event'}
      </SubmitButton>
    </form>
  )
}

export default function EventsView({ hub, items, canNotify, canUpload, isSuper }: { hub: { id: string; name: string }; items: EventRow[]; canNotify: boolean; canUpload: boolean; isSuper: boolean }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [statusF, setStatusF] = useState<'all' | 'live' | 'hidden'>('all')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<EventRow | 'new' | null>(null)
  const [deleting, setDeleting] = useState<EventRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ text: string; error?: boolean } | null>(null)
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => {
    const d = new Date()
    setToday(iso(d.getFullYear(), d.getMonth(), d.getDate()))
  }, [])

  // "Starting now" alerts to guests, as on the hub admin: checked once a minute while this page is open.
  useEffect(() => {
    if (!canNotify) return
    let alive = true
    const tick = async () => {
      const d = new Date()
      const r = await runEventAlertsAction(hub.id, iso(d.getFullYear(), d.getMonth(), d.getDate()), d.getHours() * 60 + d.getMinutes())
      if (alive && r.sent > 0) setFlash({ text: `Guests were told ${r.sent} event${r.sent === 1 ? ' is' : 's are'} starting now.` })
    }
    void tick()
    const t = setInterval(() => void tick(), 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [hub.id, canNotify])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(t)
  }, [flash])

  const rows = useMemo(() => {
    const q = deferred.trim().toLowerCase()
    return items.filter((e) => (statusF === 'all' || (statusF === 'live' ? e.active : !e.active)) && (!q || e.title.toLowerCase().includes(q) || e.location.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)))
  }, [items, deferred, statusF])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const start = (current - 1) * PAGE_SIZE
  const visible = rows.slice(start, start + PAGE_SIZE)
  const canEdit = (e: EventRow) => !e.global || isSuper

  async function toggle(e: EventRow) {
    const r = await toggleEventAction(e.hubId, e.id, !e.active)
    setFlash({ text: r.success ?? r.error ?? '', error: Boolean(r.error) })
    if (r.success) router.refresh()
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    const r = await deleteEventAction(deleting.hubId, deleting.id)
    setBusy(false)
    setFlash({ text: r.success ?? r.error ?? '', error: Boolean(r.error) })
    if (r.success) {
      setDeleting(null)
      router.refresh()
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="calendar" tone="green" label="Total Events" value={items.length.toLocaleString('en-US')} />
        <StatTile icon="eye" tone="blue" label="Live" value={items.filter((e) => e.active).length.toLocaleString('en-US')} />
        <StatTile icon="list" tone="purple" label="Hidden" value={items.filter((e) => !e.active).length.toLocaleString('en-US')} />
        <StatTile icon="clock" tone="orange" label="Repeating Weekly" value={items.filter((e) => e.days.length > 0).length.toLocaleString('en-US')} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface p-3 shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
        <div className="relative min-w-[200px] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
          <input type="search" aria-label="Search events" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search events…" className={`${control} w-full pl-10 pr-3 placeholder:text-ink3`} />
        </div>
        <select aria-label="Status" value={statusF} onChange={(e) => { setStatusF(e.target.value as 'all' | 'live' | 'hidden'); setPage(1) }} className={`${control} w-full cursor-pointer px-3 font-medium sm:w-40`}>
          <option value="all">All events</option>
          <option value="live">Live</option>
          <option value="hidden">Hidden</option>
        </select>
        <button type="button" onClick={() => setEditing('new')} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-800">
          <span aria-hidden="true" className="text-lg leading-none">+</span> Add Event
        </button>
      </div>

      {flash && (
        <div role={flash.error ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2 text-[13px] font-medium ${flash.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {flash.text}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center text-[13px] text-ink3">{items.length ? 'No events match your search' : 'No events yet. Click “Add Event” to create one.'}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
          <ul className="divide-y divide-line">
            {visible.map((e) => (
              <li key={`${e.hubId}/${e.id}`} className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap">
                {e.imageUrl ? (
                  <RemoteImg src={e.imageUrl} w={80} alt="" className="h-16 w-20 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div aria-hidden="true" className="flex h-16 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-xl font-bold text-white">{(e.title[0] ?? '?').toUpperCase()}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{e.title}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${e.active ? 'bg-emerald-600/10 text-emerald-700' : 'bg-slate-500/10 text-ink2'}`}>{e.active ? 'Live' : 'Hidden'}</span>
                    {e.global && <span className="rounded-md bg-purple-600/10 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-700">All hubs</span>}
                  </div>
                  {e.description && <p className="mt-0.5 line-clamp-1 text-[13px] text-ink2">{e.description}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink3" suppressHydrationWarning>
                    <span className="inline-flex items-center gap-1"><Icon name="calendar" className="h-3 w-3" />{schedule(e, today)}</span>
                    {e.hours && <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3 w-3" />{e.hours}</span>}
                    {e.location && <span className="inline-flex items-center gap-1"><Icon name="pin" className="h-3 w-3" />{e.location}</span>}
                  </p>
                </div>
                {canEdit(e) ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" role="switch" aria-checked={e.active} aria-label={e.active ? 'Hide from guests' : 'Show to guests'} onClick={() => void toggle(e)} className={`relative h-6 w-11 rounded-full transition-colors ${e.active ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                      <span aria-hidden="true" className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${e.active ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                    <button type="button" onClick={() => setEditing(e)} className="h-9 rounded-lg border border-line2 bg-surface px-3 text-xs font-semibold text-ink2 hover:border-brand hover:text-brand">Edit</button>
                    <button type="button" aria-label={`Delete ${e.title}`} onClick={() => setDeleting(e)} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink2 hover:bg-red-50 hover:text-red-700"><Icon name="trash" /></button>
                  </div>
                ) : (
                  <span className="shrink-0 text-[11px] text-ink3">Read only</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
            <p className="text-[13px] text-ink2" aria-live="polite">
              Showing {(start + 1).toLocaleString('en-US')} – {Math.min(start + PAGE_SIZE, rows.length).toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')}
            </p>
            {pageCount > 1 && (
              <nav aria-label="Pagination" className="flex items-center gap-1.5">
                <button type="button" aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line2 text-ink2 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"><Icon name="left" /></button>
                {pageList(current, pageCount).map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-ink3">…</span>
                  ) : (
                    <button key={p} type="button" aria-label={`Page ${p}`} aria-current={p === current ? 'page' : undefined} onClick={() => setPage(p)} className={`hidden h-9 min-w-9 rounded-lg px-2 text-[13px] font-semibold sm:block ${p === current ? 'bg-emerald-700 text-white' : 'text-ink2 hover:bg-surface2'}`}>{p}</button>
                  ),
                )}
                <span className="px-2 text-[13px] font-semibold text-ink2 sm:hidden">{current} / {pageCount}</span>
                <button type="button" aria-label="Next page" disabled={current === pageCount} onClick={() => setPage(current + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line2 text-ink2 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"><Icon name="right" /></button>
              </nav>
            )}
          </div>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing && editing !== 'new' ? 'Edit Event' : 'Add Event'} subtitle={hub.name}>
        {editing !== null && (
          <EventForm
            key={editing === 'new' ? 'new' : editing.id}
            hubId={hub.id}
            item={editing === 'new' ? null : editing}
            canNotify={canNotify}
            canUpload={canUpload}
            onDone={(msg) => {
              setEditing(null)
              setFlash({ text: msg })
              router.refresh()
            }}
          />
        )}
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete event">
        {deleting && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
            <p className="mb-3 text-[13px] font-medium text-red-700">Delete “{deleting.title}”? Guests will no longer see it. This cannot be undone.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeleting(null)} disabled={busy} className="h-10 flex-1 rounded-xl border border-line2 bg-surface text-sm font-semibold text-ink2">Cancel</button>
              <button type="button" onClick={() => void remove()} disabled={busy} className="h-10 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{busy ? 'Deleting…' : 'Yes, delete'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
