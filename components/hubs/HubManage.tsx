'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { saveWifiAction } from '@/app/actions/hubs'
import EventForm from '@/components/dashboard/forms/EventForm'
import NewsletterForm from '@/components/dashboard/forms/NewsletterForm'
import QuickPostForm from '@/components/dashboard/forms/QuickPostForm'
import NavIcon from '@/components/dashboard/NavIcon'
import type { IconName as NavIconName } from '@/components/dashboard/nav'
import Icon from '@/components/ui/Icon'
import Modal from '@/components/ui/Modal'
import StatTile from '@/components/ui/StatTile'
import { Field, FormMessage, inputClass } from '@/components/ui/fields'
import type { HubManageData } from '@/lib/data/hubs'
import RemoteImg from '@/components/ui/RemoteImg'

type Open = 'post' | 'event' | 'newsletter' | null
type Ev = HubManageData['events'][number]

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const card = 'flex min-w-0 flex-col rounded-[18px] border border-line bg-surface p-4 shadow-[0_2px_8px_rgba(15,31,74,0.04)] sm:p-5'
const outlineBtn = 'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-brand bg-surface px-3 text-[13px] font-semibold text-brand transition-colors hover:bg-[#e8f0fe]'

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The next day an event happens, on or after today: its next listed date, or the next matching weekday. Null when it has neither. */
function nextDay(e: Ev, from: Date): Date | null {
  const today = localDay(from)
  const next = e.dates.filter((d) => d >= today).sort()[0]
  if (next) return new Date(`${next}T00:00`)
  if (e.days.length) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
      if (e.days.includes(WEEKDAYS[d.getDay()])) return d
    }
  }
  return null
}

const shortDate = (iso: string) => {
  const t = Date.parse(iso)
  return t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
}
const chatTime = (iso: string) => {
  const t = Date.parse(iso)
  return t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
}

function SectionHead({ icon, tone, title, subtitle, action }: { icon: ReactNode; tone: string; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-bold text-ink">{title}</h3>
        <p className="text-xs leading-snug text-ink3">{subtitle}</p>
      </div>
      {action}
    </div>
  )
}

const nav = (name: NavIconName) => <NavIcon name={name} className="h-5 w-5" />
const Empty = ({ children }: { children: string }) => <div className="rounded-xl bg-surface2 px-3 py-3 text-[12px] font-medium text-ink3">{children}</div>

function Hero({ hub }: { hub: HubManageData['hub'] }) {
  return (
    <section className="relative overflow-hidden rounded-[20px] border border-line bg-gradient-to-br from-sky-200 via-emerald-100 to-emerald-200 shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
      {hub.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <RemoteImg src={hub.coverUrl} w={900} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/55 to-white/0" />
      <div className="relative flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-4">
        {hub.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <RemoteImg src={hub.logoUrl} w={64} alt="" className="h-14 w-14 shrink-0 rounded-full border-[3px] border-white bg-white object-cover shadow-md sm:h-16 sm:w-16" />
        ) : (
          <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-br from-emerald-600 to-emerald-800 text-xl font-bold text-white shadow-md sm:h-16 sm:w-16 sm:text-2xl">
            {(hub.name[0] ?? '?').toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${hub.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${hub.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {hub.active ? 'Active' : 'Inactive'}
          </span>
          <h1 className="mt-1 break-words text-xl font-extrabold tracking-tight text-ink sm:text-2xl sm:leading-tight">{hub.name}</h1>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] font-medium text-ink2">
            <Icon name="pin" className="h-3.5 w-3.5" />
            {hub.location ?? 'No location'}
          </div>
          {hub.description && <p className="mt-1 line-clamp-2 max-w-xl text-xs leading-relaxed text-ink2">{hub.description}</p>}
        </div>
        {hub.publicUrl && (
          <a href={hub.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 self-start rounded-lg bg-white px-3.5 text-[13px] font-semibold text-ink shadow-sm transition-colors hover:bg-surface2 sm:self-center">
            View Public Hub
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
          </a>
        )}
      </div>
    </section>
  )
}

function WifiCard({ hubId, initial }: { hubId: string; initial: { ssid: string; password: string } }) {
  const [saved, setSaved] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [ssid, setSsid] = useState(initial.ssid)
  const [password, setPassword] = useState(initial.password)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({})

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await saveWifiAction(hubId, ssid, password)
    setBusy(false)
    if (r.success) {
      setSaved({ ssid: ssid.trim(), password })
      setEditing(false)
    }
    setMsg(r)
  }

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value)
      setMsg({ success: `${what} copied.` })
    } catch {
      setMsg({ error: 'Could not copy.' })
    }
  }

  const row = 'flex h-12 items-center gap-3 rounded-xl border border-line bg-surface2 px-3.5 text-sm text-ink'
  const iconBtn = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink2 hover:bg-white'

  return (
    <section className={card}>
      <SectionHead
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
          </svg>
        }
        tone="bg-[#e8f0fe] text-brand"
        title="WiFi Settings"
        subtitle="Update the WiFi name and password for this campground."
        action={
          !editing && (
            <button type="button" onClick={() => { setEditing(true); setMsg({}); setSsid(saved.ssid); setPassword(saved.password) }} className={outlineBtn}>
              <Icon name="settings" className="h-3.5 w-3.5" />
              Edit
            </button>
          )
        }
      />
      <FormMessage error={msg.error} success={msg.success} />
      {editing ? (
        <form onSubmit={save}>
          <Field label="WiFi Name (SSID)" htmlFor="wifi-ssid">
            <input id="wifi-ssid" value={ssid} maxLength={64} onChange={(e) => setSsid(e.target.value)} placeholder="Network name" className={inputClass} />
          </Field>
          <Field label="WiFi Password" htmlFor="wifi-pass">
            <input id="wifi-pass" value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} placeholder="WiFi password" autoComplete="off" className={inputClass} />
          </Field>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => { setEditing(false); setMsg({}) }} className="h-11 flex-1 rounded-xl border border-line2 bg-surface text-sm font-semibold text-ink2 hover:border-brand">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="h-11 flex-1 rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-dim disabled:opacity-70">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-ink2">WiFi Name (SSID)</div>
            <div className={row}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-ink2">
                <path d="M5 12.55a11 11 0 0 1 14.08 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
              </svg>
              <span className="min-w-0 flex-1 truncate">{saved.ssid || <span className="text-ink3">Not set</span>}</span>
              {saved.ssid && (
                <button type="button" aria-label="Copy WiFi name" onClick={() => void copy(saved.ssid, 'WiFi name')} className={iconBtn}>
                  <Icon name="copy" />
                </button>
              )}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-ink2">WiFi Password</div>
            <div className={row}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-ink2">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <span className="min-w-0 flex-1 truncate">{!saved.password ? <span className="text-ink3">Not set</span> : show ? saved.password : '•'.repeat(Math.min(saved.password.length, 12))}</span>
              {saved.password && (
                <>
                  <button type="button" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((s) => !s)} className={iconBtn}>
                    <Icon name="eye" />
                  </button>
                  <button type="button" aria-label="Copy password" onClick={() => void copy(saved.password, 'Password')} className={iconBtn}>
                    <Icon name="copy" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ChatCard({ chats }: { chats: HubManageData['chats'] }) {
  return (
    <section className={card}>
      <SectionHead
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
          </svg>
        }
        tone="bg-[#e8f0fe] text-brand"
        title="Guest Chat"
        subtitle="Recent conversations with guests."
      />
      {chats === null ? (
        <Empty>The conversations could not be loaded.</Empty>
      ) : chats.length === 0 ? (
        <Empty>No guest messages yet.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {chats.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-3">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-sm font-bold text-red-600">
                {(c.name.replace(/^Guest #/, '')[0] ?? 'G').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-ink">
                  {c.unread && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
                  {c.name}
                </div>
                <div className="truncate text-xs text-ink3">{c.last || '—'}</div>
              </div>
              <span className="hidden shrink-0 text-right text-[11px] leading-tight text-ink3 sm:block" suppressHydrationWarning>{chatTime(c.lastAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** One hub's dashboard: banner, key figures, announcements, events, newsletter, WiFi and guest chat. Used for a manager's own hub and for a super admin's "Manage hub". */
export default function HubManage({ data, features }: { data: HubManageData; features: { notify: boolean; upload: boolean } }) {
  const router = useRouter()
  const [open, setOpen] = useState<Open>(null)
  const [toast, setToast] = useState('')
  // Upcoming depends on the viewer's own clock, so it is worked out after mount.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(new Date()), [])
  const hubs = [{ id: data.hub.id, name: data.hub.name }]

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const upcoming = useMemo(() => {
    if (!now) return data.events.slice(0, 3).map((e) => ({ e, day: null as Date | null }))
    return data.events
      .map((e) => ({ e, day: nextDay(e, now) }))
      // An event whose listed dates have all passed (and that does not repeat weekly) is no longer upcoming.
      .filter(({ e, day }) => day || e.dates.length === 0)
      .sort((a, b) => (a.day && b.day ? a.day.getTime() - b.day.getTime() : a.day ? -1 : b.day ? 1 : 0))
      .slice(0, 3)
  }, [data.events, now])

  const close = () => setOpen(null)
  const done = (message: string) => () => {
    setToast(message)
    close()
    router.refresh()
  }
  const num = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-US'))

  return (
    <div className="flex flex-col gap-4">
      <Hero hub={data.hub} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="eye" tone="blue" label="Page Loads" value={num(data.visits)} />
        <StatTile icon="calendar" tone="green" label="Total Events" value={num(data.totals.events)} />
        <StatTile icon="users" tone="blue" label="Registered Guests" value={num(data.totals.guests)} />
        <StatTile icon="file" tone="purple" label="Announcements" value={num(data.totals.announcements)} />
      </div>

      <div className="grid grid-cols-1 gap-4 min-[1000px]:grid-cols-2 min-[1400px]:grid-cols-3">
        <section className={card}>
          <SectionHead
            icon={nav('announcements')}
            tone="bg-[#e8f0fe] text-brand"
            title="Announcements"
            subtitle="Keep your guests informed with important updates."
            action={
              <button type="button" onClick={() => setOpen('post')} className={outlineBtn}>
                + Create New
              </button>
            }
          />
          {data.announcements.length === 0 ? (
            <Empty>No announcements yet</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data.announcements.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <RemoteImg src={a.imageUrl} w={64} alt="" className="h-14 w-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span aria-hidden="true" className="flex h-14 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#e8f0fe] to-[#dfe9f8] text-brand">
                      {nav('announcements')}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">{a.title}</div>
                    <div className="line-clamp-1 text-xs text-ink3">{a.message}</div>
                    <div className="mt-0.5 text-[11px] text-ink3" suppressHydrationWarning>{shortDate(a.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card}>
          <SectionHead
            icon={nav('events')}
            tone="bg-[#d9f7e8] text-emerald-600"
            title="Upcoming Events"
            subtitle="Manage events and activities for this hub."
            action={
              <button type="button" onClick={() => setOpen('event')} className={outlineBtn}>
                + Add Event
              </button>
            }
          />
          {upcoming.length === 0 ? (
            <Empty>No events yet</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map(({ e, day }) => (
                <li key={e.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-surface2 text-center">
                    <span className="text-[10px] font-bold tracking-wide text-ink3" suppressHydrationWarning>{day ? MONTHS[day.getMonth()] : '—'}</span>
                    <span className="text-lg font-extrabold leading-none text-ink" suppressHydrationWarning>{day ? day.getDate() : ''}</span>
                  </div>
                  {e.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <RemoteImg src={e.imageUrl} w={64} alt="" className="h-14 w-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span aria-hidden="true" className="flex h-14 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#d9f7e8] to-[#c6f0db] text-emerald-600">
                      {nav('events')}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">{e.title}</div>
                    {e.hours && (
                      <div className="flex items-center gap-1.5 truncate text-xs text-ink3">
                        <Icon name="clock" className="h-3 w-3" />
                        <span className="truncate">{e.hours}</span>
                      </div>
                    )}
                    {(e.location || e.days.length > 0) && (
                      <div className="flex items-center gap-1.5 truncate text-xs text-ink3">
                        <Icon name="pin" className="h-3 w-3" />
                        <span className="truncate">{[e.location, e.days.length ? `Every ${e.days.join(', ')}` : ''].filter(Boolean).join(' · ')}</span>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${card} min-[1000px]:col-span-2 min-[1400px]:col-span-1`}>
          <SectionHead
            icon={nav('newsletter')}
            tone="bg-[#ece2fb] text-violet-600"
            title="Newsletter"
            subtitle="Upload and manage your hub newsletter."
            action={
              <button type="button" onClick={() => setOpen('newsletter')} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dim">
                <Icon name="download" className="h-3.5 w-3.5 rotate-180" />
                Upload Image
              </button>
            }
          />
          {data.newsletterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <RemoteImg src={data.newsletterUrl} w={450} alt="Newsletter" className="max-h-[260px] w-full rounded-xl border border-line2 object-cover object-top" />
          ) : (
            <Empty>Upload images and content for newsletter.</Empty>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 min-[1000px]:grid-cols-[5fr_7fr]">
        <WifiCard hubId={data.hub.id} initial={data.wifi} />
        <ChatCard chats={data.chats} />
      </div>

      <Modal open={open === 'post'} onClose={close} title="Create Announcement" subtitle={`Publish an announcement to ${data.hub.name}.`}>
        <QuickPostForm hubs={hubs} canNotify={features.notify} onDone={done('Announcement published.')} />
      </Modal>
      <Modal open={open === 'event'} onClose={close} title="Add Event" subtitle={`Create an event guests will see on ${data.hub.name}.`}>
        <EventForm hubs={hubs} canNotify={features.notify} canUpload={features.upload} onDone={done('Event added.')} />
      </Modal>
      <Modal open={open === 'newsletter'} onClose={close} title="Newsletter Image" subtitle="Upload or replace the newsletter image.">
        <NewsletterForm hubs={hubs} canUpload={features.upload} onChanged={() => router.refresh()} />
      </Modal>

      {toast && (
        <div role="status" className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-[13px] font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
