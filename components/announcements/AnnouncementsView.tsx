'use client'

import TestSendButton from '@/components/ui/TestSendButton'
import { confirmNotify } from '@/components/ui/confirmNotify'
import { useRouter } from 'next/navigation'
import { useActionState, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { deleteAnnouncementAction, runDueAnnouncementsAction, saveAnnouncementAction, toggleAnnouncementAction } from '@/app/actions/hubcontent'
import type { ActionState } from '@/app/actions/content'
import Icon from '@/components/ui/Icon'
import Modal from '@/components/ui/Modal'
import StatTile from '@/components/ui/StatTile'
import { Check, Field, FormMessage, inputClass, SubmitButton } from '@/components/ui/fields'
import type { AnnouncementRow } from '@/lib/data/content'

const PAGE_SIZE = 10
type Status = 'live' | 'scheduled' | 'draft' | 'expired'

const TYPE: Record<string, { label: string; dot: string; chip: string }> = {
  info: { label: 'Info', dot: 'bg-blue-500', chip: 'bg-blue-500/10 text-blue-700' },
  warning: { label: 'Warning', dot: 'bg-amber-500', chip: 'bg-amber-500/10 text-amber-700' },
  alert: { label: 'Alert', dot: 'bg-red-500', chip: 'bg-red-500/10 text-red-700' },
  success: { label: 'Success', dot: 'bg-emerald-500', chip: 'bg-emerald-500/10 text-emerald-700' },
}

const STATUS: Record<Status, { label: string; chip: string }> = {
  live: { label: 'Live', chip: 'bg-emerald-600/10 text-emerald-700' },
  scheduled: { label: 'Scheduled', chip: 'bg-amber-500/10 text-amber-700' },
  draft: { label: 'Hidden', chip: 'bg-slate-500/10 text-ink2' },
  expired: { label: 'Expired', chip: 'bg-red-500/10 text-red-700' },
}

function statusOf(a: AnnouncementRow, now: number): Status {
  if (a.active) return a.expiresAt && Date.parse(a.expiresAt) <= now ? 'expired' : 'live'
  return a.scheduledAt && Date.parse(a.scheduledAt) > now ? 'scheduled' : 'draft'
}

const when = (iso: string | null) => (iso && Date.parse(iso) ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
/** The value a datetime-local input wants, from an ISO time, in the viewer's own time zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso || !Date.parse(iso)) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const toIso = (local: string) => (local && !Number.isNaN(new Date(local).getTime()) ? new Date(local).toISOString() : '')

const control = 'h-11 rounded-xl border border-line2 bg-surface text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_3px_rgba(26,86,219,0.10)]'

function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total]
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', current - 1, current, current + 1, '…', total]
}

function AnnouncementForm({ hubId, item, canNotify, onDone }: { hubId: string; item: AnnouncementRow | null; canNotify: boolean; onDone: (msg: string) => void }) {
  const [type, setType] = useState(item?.type ?? 'info')
  const [publish, setPublish] = useState(item ? item.active : true)
  const [scheduled, setScheduled] = useState(toLocalInput(item?.scheduledAt ?? null))
  const [expires, setExpires] = useState(toLocalInput(item?.expiresAt ?? null))

  const [state, action, pending] = useActionState(async (prev: ActionState, data: FormData) => {
    const r = await saveAnnouncementAction(prev, data)
    if (r.success) onDone(r.success)
    return r
  }, {} as ActionState)

  return (
    <form action={action} onSubmit={(e) => confirmNotify(e, 'this announcement')}>
      <FormMessage error={state.error} />
      <input type="hidden" name="hubId" value={item?.hubId ?? hubId} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="scheduledAt" value={!publish ? toIso(scheduled) : ''} />
      <input type="hidden" name="expiresAt" value={toIso(expires)} />
      {publish && <input type="hidden" name="active" value="on" />}

      <Field label="Title" htmlFor="an-title">
        <input id="an-title" name="title" required maxLength={120} defaultValue={item?.title} placeholder="e.g. Pool closes early today" className={inputClass} />
      </Field>
      <Field label="Message" htmlFor="an-msg">
        <textarea id="an-msg" name="message" required maxLength={2000} rows={5} defaultValue={item?.message} placeholder="What should guests know?" className={`${inputClass} resize-y`} />
      </Field>

      <Field label="Type">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type">
          {Object.entries(TYPE).map(([id, t]) => (
            <button key={id} type="button" aria-pressed={type === id} onClick={() => setType(id)} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors ${type === id ? 'border-brand bg-[#e8f0fe] text-brand' : 'border-line2 bg-surface2 text-ink2 hover:border-brand'}`}>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${t.dot}`} />
              {t.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Visibility">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Visibility">
          {[
            { on: true, label: 'Publish now', hint: 'Guests see it right away' },
            { on: false, label: 'Save hidden / schedule', hint: 'Keep it as a draft or set a time' },
          ].map((o) => (
            <button key={o.label} type="button" aria-pressed={publish === o.on} onClick={() => setPublish(o.on)} className={`rounded-xl border p-3 text-left transition-colors ${publish === o.on ? 'border-brand bg-[#e8f0fe]' : 'border-line2 bg-surface2 hover:border-brand'}`}>
              <div className={`text-[13px] font-semibold ${publish === o.on ? 'text-brand' : 'text-ink'}`}>{o.label}</div>
              <div className="text-[11px] text-ink3">{o.hint}</div>
            </button>
          ))}
        </div>
      </Field>

      {!publish && (
        <Field label="Publish at (optional)" htmlFor="an-sched" hint="Leave empty to keep it hidden. It goes live by itself at this time while an admin page is open.">
          <input id="an-sched" type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} className={inputClass} />
        </Field>
      )}
      <Field label="Expires at (optional)" htmlFor="an-exp" hint="Guests stop seeing it after this time.">
        <input id="an-exp" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} className={inputClass} />
      </Field>

      {canNotify && !item && publish && <Check name="notify" label="Also notify guests" hint="Sends a push notification and email to this hub's guests." />}
      {canNotify && !item && <TestSendButton hubId={hubId} titleField="title" bodyField="message" />}
      <SubmitButton pending={pending}>{item ? 'Save changes' : publish ? 'Publish announcement' : 'Save announcement'}</SubmitButton>
    </form>
  )
}

export default function AnnouncementsView({ hub, items, canNotify, isSuper }: { hub: { id: string; name: string }; items: AnnouncementRow[]; canNotify: boolean; isSuper: boolean }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [typeF, setTypeF] = useState('all')
  const [statusF, setStatusF] = useState<'all' | Status>('all')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<AnnouncementRow | 'new' | null>(null)
  const [viewing, setViewing] = useState<AnnouncementRow | null>(null)
  const [deleting, setDeleting] = useState<AnnouncementRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ text: string; error?: boolean } | null>(null)
  // Read after mount: "now" depends on the viewer's clock.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => setNow(Date.now()), [])

  // Scheduled posts go live while this page is open, as on the hub admin.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const r = await runDueAnnouncementsAction(hub.id)
      if (alive && r.published > 0) {
        setFlash({ text: `${r.published} scheduled announcement${r.published === 1 ? '' : 's'} went live.` })
        router.refresh()
      }
      if (alive) setNow(Date.now())
    }
    void tick()
    const t = setInterval(() => void tick(), 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [hub.id, router])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(t)
  }, [flash])

  const clock = now ?? 0
  const rows = useMemo(() => {
    const q = deferred.trim().toLowerCase()
    return items.filter((a) => (typeF === 'all' || a.type === typeF) && (statusF === 'all' || statusOf(a, clock) === statusF) && (!q || a.title.toLowerCase().includes(q) || a.message.toLowerCase().includes(q)))
  }, [items, deferred, typeF, statusF, clock])

  const count = (s: Status) => items.filter((a) => statusOf(a, clock) === s).length
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const start = (current - 1) * PAGE_SIZE
  const visible = rows.slice(start, start + PAGE_SIZE)
  const canEdit = (a: AnnouncementRow) => !a.global || isSuper

  async function toggle(a: AnnouncementRow) {
    const r = await toggleAnnouncementAction(a.hubId, a.id, !a.active)
    setFlash({ text: r.success ?? r.error ?? '', error: Boolean(r.error) })
    if (r.success) router.refresh()
  }

  async function remove() {
    if (!deleting) return
    setBusy(true)
    const r = await deleteAnnouncementAction(deleting.hubId, deleting.id)
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
        <StatTile icon="file" tone="blue" label="Total Announcements" value={items.length.toLocaleString('en-US')} />
        <StatTile icon="eye" tone="green" label="Live" value={now === null ? '—' : count('live').toLocaleString('en-US')} />
        <StatTile icon="clock" tone="orange" label="Scheduled" value={now === null ? '—' : count('scheduled').toLocaleString('en-US')} />
        <StatTile icon="list" tone="purple" label="Hidden / Expired" value={now === null ? '—' : (count('draft') + count('expired')).toLocaleString('en-US')} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface p-3 shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
        <div className="relative min-w-[200px] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
          <input type="search" aria-label="Search announcements" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search announcements…" className={`${control} w-full pl-10 pr-3 placeholder:text-ink3`} />
        </div>
        <select aria-label="Type" value={typeF} onChange={(e) => { setTypeF(e.target.value); setPage(1) }} className={`${control} w-full cursor-pointer px-3 font-medium sm:w-40`}>
          <option value="all">All types</option>
          {Object.entries(TYPE).map(([id, t]) => (
            <option key={id} value={id}>{t.label}</option>
          ))}
        </select>
        <select aria-label="Status" value={statusF} onChange={(e) => { setStatusF(e.target.value as 'all' | Status); setPage(1) }} className={`${control} w-full cursor-pointer px-3 font-medium sm:w-40`}>
          <option value="all">All statuses</option>
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <option key={s} value={s}>{STATUS[s].label}</option>
          ))}
        </select>
        <button type="button" onClick={() => setEditing('new')} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dim">
          <span aria-hidden="true" className="text-lg leading-none">+</span> New Announcement
        </button>
      </div>

      {flash && (
        <div role={flash.error ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2 text-[13px] font-medium ${flash.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {flash.text}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center text-[13px] text-ink3">{items.length ? 'No announcements match your filters' : 'No announcements yet. Click “New Announcement” to post one.'}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
          <ul className="divide-y divide-line">
            {visible.map((a) => {
              const st = STATUS[statusOf(a, clock)]
              const ty = TYPE[a.type] ?? TYPE.info
              return (
                <li key={`${a.hubId}/${a.id}`} className="flex flex-wrap items-start gap-3 p-4 sm:flex-nowrap">
                  <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ty.dot}`} />
                  <button type="button" onClick={() => setViewing(a)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{a.title}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${st.chip}`}>{st.label}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${ty.chip}`}>{ty.label}</span>
                      {a.global && <span className="rounded-md bg-purple-600/10 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-700">All hubs</span>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] text-ink2">{a.message}</p>
                    <p className="mt-1.5 text-[11px] text-ink3" suppressHydrationWarning>
                      {a.createdBy ? `by ${a.createdBy} · ` : ''}
                      {when(a.createdAt)}
                      {a.scheduledAt && !a.active ? ` · goes live ${when(a.scheduledAt)}` : ''}
                      {a.expiresAt ? ` · expires ${when(a.expiresAt)}` : ''}
                    </p>
                  </button>
                  {canEdit(a) ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" role="switch" aria-checked={a.active} aria-label={a.active ? 'Hide from guests' : 'Show to guests'} onClick={() => void toggle(a)} className={`relative h-6 w-11 rounded-full transition-colors ${a.active ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                        <span aria-hidden="true" className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${a.active ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                      <button type="button" onClick={() => setEditing(a)} className="h-9 rounded-lg border border-line2 bg-surface px-3 text-xs font-semibold text-ink2 hover:border-brand hover:text-brand">Edit</button>
                      <button type="button" aria-label={`Delete ${a.title}`} onClick={() => setDeleting(a)} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink2 hover:bg-red-50 hover:text-red-700">
                        <Icon name="trash" />
                      </button>
                    </div>
                  ) : (
                    <span className="shrink-0 text-[11px] text-ink3">Read only</span>
                  )}
                </li>
              )
            })}
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

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing && editing !== 'new' ? 'Edit Announcement' : 'New Announcement'} subtitle={hub.name}>
        {editing !== null && (
          <AnnouncementForm
            key={editing === 'new' ? 'new' : editing.id}
            hubId={hub.id}
            item={editing === 'new' ? null : editing}
            canNotify={canNotify}
            onDone={(msg) => {
              setEditing(null)
              setFlash({ text: msg })
              router.refresh()
            }}
          />
        )}
      </Modal>

      <Modal open={viewing !== null} onClose={() => setViewing(null)} title={viewing?.title ?? ''} subtitle={viewing ? `${viewing.global ? 'All hubs' : hub.name}${viewing.createdBy ? ` · by ${viewing.createdBy}` : ''}` : undefined}>
        {viewing && (
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS[statusOf(viewing, clock)].chip}`}>{STATUS[statusOf(viewing, clock)].label}</span>
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${(TYPE[viewing.type] ?? TYPE.info).chip}`}>{(TYPE[viewing.type] ?? TYPE.info).label}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-ink">{viewing.message}</p>
            <p className="mt-4 text-xs text-ink3" suppressHydrationWarning>
              Posted {when(viewing.createdAt)}
              {viewing.expiresAt ? ` · expires ${when(viewing.expiresAt)}` : ''}
            </p>
          </div>
        )}
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete announcement">
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
