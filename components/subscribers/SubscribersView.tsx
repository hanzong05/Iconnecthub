'use client'

import { useRouter } from 'next/navigation'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { deleteSubscriberAction } from '@/app/actions/content'
import Icon, { type IconName } from '@/components/ui/Icon'
import Modal from '@/components/ui/Modal'
import StatTile from '@/components/ui/StatTile'
import { FormMessage } from '@/components/ui/fields'
import type { SubscriberRow } from '@/lib/data/subscribers'

const PAGE_SIZE = 10
type Sort = 'registered' | 'name' | 'email' | 'hub'
type Range = 'any' | 'today' | '7' | '30'

const RANGES: { id: Range; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: 'today', label: 'Today' },
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
]

const idOf = (g: SubscriberRow) => `${g.hubId}/${g.key}`
const fullName = (g: SubscriberRow) => `${g.firstName} ${g.lastName}`.trim()
const initials = (g: SubscriberRow) => ((g.firstName[0] ?? '') + (g.lastName[0] ?? '')).toUpperCase() || '?'
const time = (iso: string) => (iso ? Date.parse(iso) || 0 : 0)
const fmt = (opts: Intl.DateTimeFormatOptions) => (iso: string) => (time(iso) ? new Date(iso).toLocaleDateString('en-US', opts) : '—')
const shortDate = fmt({ month: 'short', day: 'numeric', year: 'numeric' })
const stayDate = (d: string) => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

/** Page numbers with gaps, e.g. 1 2 3 4 5 … 80. */
function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total]
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', current - 1, current, current + 1, '…', total]
}

function Avatar({ g, size = 'h-10 w-10 text-xs' }: { g: SubscriberRow; size?: string }) {
  return (
    <div aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-emerald-700 font-bold text-white ${size}`}>
      {initials(g)}
    </div>
  )
}

function Detail({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-line bg-surface2 p-3.5 ${wide ? 'col-span-2' : ''}`}>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-ink3">{label}</div>
      <div className="break-words text-sm font-semibold text-ink">{children}</div>
    </div>
  )
}

const control = 'h-11 rounded-xl border border-line2 bg-surface text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_3px_rgba(26,86,219,0.10)]'

function SelectBox({ icon, label, value, onChange, children, className = '' }: { icon: IconName; label: string; value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Icon name={icon} className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${control} w-full cursor-pointer appearance-none pl-10 pr-9 font-medium`}>
        {children}
      </select>
      <Icon name="chevron" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
    </div>
  )
}

export default function SubscribersView({ hubs, guests, isSuper, initialHub }: { hubs: { id: string; name: string }[]; guests: SubscriberRow[]; isSuper: boolean; initialHub?: string }) {
  const router = useRouter()
  const [hub, setHub] = useState(isSuper ? (hubs.some((h) => h.id === initialHub) ? (initialHub as string) : '__all__') : (hubs[0]?.id ?? ''))
  const [sort, setSort] = useState<Sort>('registered')
  const [range, setRange] = useState<Range>('any')
  const [filterOpen, setFilterOpen] = useState(false)
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<SubscriberRow | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error?: string; success?: string }>({})
  const [menu, setMenu] = useState<{ g: SubscriberRow; style: React.CSSProperties } | null>(null)
  const [flash, setFlash] = useState('')
  // "Today" depends on the viewer's clock, so it is read after mount rather than during the server render.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => setNow(Date.now()), [])

  const inHubList = useMemo(() => guests.filter((g) => hub === '__all__' || g.hubId === hub), [guests, hub])

  const rows = useMemo(() => {
    const q = deferred.trim().toLowerCase()
    const since = now === null || range === 'any' ? 0 : range === 'today' ? new Date(now).setHours(0, 0, 0, 0) : now - Number(range) * 86_400_000
    const list = inHubList.filter(
      (g) => (!since || time(g.registeredAt) >= since) && (!q || fullName(g).toLowerCase().includes(q) || g.phone.toLowerCase().includes(q) || g.email.toLowerCase().includes(q)),
    )
    const by: Record<Sort, (a: SubscriberRow, b: SubscriberRow) => number> = {
      registered: (a, b) => time(b.registeredAt) - time(a.registeredAt),
      name: (a, b) => fullName(a).localeCompare(fullName(b)),
      email: (a, b) => a.email.localeCompare(b.email),
      hub: (a, b) => a.hubName.localeCompare(b.hubName) || fullName(a).localeCompare(fullName(b)),
    }
    return [...list].sort(by[sort])
  }, [inHubList, deferred, sort, range, now])

  const stats = useMemo(() => {
    const latest = inHubList.reduce((m, g) => Math.max(m, time(g.registeredAt)), 0)
    return {
      total: inHubList.length,
      today: now === null ? null : inHubList.filter((g) => sameDay(time(g.registeredAt), now) && time(g.registeredAt) > 0).length,
      hubs: new Set(inHubList.map((g) => g.hubId)).size,
      latest: latest ? new Date(latest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    }
  }, [inHubList, now])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const start = (current - 1) * PAGE_SIZE
  const visible = rows.slice(start, start + PAGE_SIZE)
  const allOnPage = visible.length > 0 && visible.every((g) => picked.has(idOf(g)))
  const someOnPage = visible.some((g) => picked.has(idOf(g)))

  const headBox = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (headBox.current) headBox.current.indeterminate = someOnPage && !allOnPage
  }, [someOnPage, allOnPage])

  // Close the row menu when anything else happens.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    // A scroll that was already under way when the menu opened (the browser bringing the button into view) must not close it.
    const opened = Date.now()
    const onScroll = () => Date.now() - opened > 200 && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 2500)
    return () => clearTimeout(t)
  }, [flash])

  function open(g: SubscriberRow, ask = false) {
    setMenu(null)
    setSelected(g)
    setConfirming(ask)
    setMessage({})
  }

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, g: SubscriberRow) {
    e.stopPropagation()
    if (menu?.g && idOf(menu.g) === idOf(g)) return setMenu(null)
    const r = e.currentTarget.getBoundingClientRect()
    const flip = r.bottom + 150 > window.innerHeight
    setMenu({ g, style: { right: Math.max(8, window.innerWidth - r.right), ...(flip ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) } })
  }

  async function copyEmail(g: SubscriberRow) {
    setMenu(null)
    try {
      await navigator.clipboard.writeText(g.email)
      setFlash('Email copied')
    } catch {
      setFlash('Could not copy the email')
    }
  }

  function togglePick(g: SubscriberRow) {
    setPicked((p) => {
      const n = new Set(p)
      if (!n.delete(idOf(g))) n.add(idOf(g))
      return n
    })
  }

  function togglePage() {
    setPicked((p) => {
      const n = new Set(p)
      for (const g of visible) allOnPage ? n.delete(idOf(g)) : n.add(idOf(g))
      return n
    })
  }

  async function remove() {
    if (!selected) return
    setBusy(true)
    const r = await deleteSubscriberAction(selected.hubId, selected.key)
    setBusy(false)
    if (r.success) {
      setPicked((p) => {
        const n = new Set(p)
        n.delete(idOf(selected))
        return n
      })
      setSelected(null)
      router.refresh()
    } else setMessage(r)
  }

  const emptyText = guests.length ? 'No guests match your search' : 'No guest profiles yet'

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="users" tone="green" label="Total Guests" value={stats.total.toLocaleString('en-US')} />
        <StatTile icon="calendar" tone="blue" label="Registered Today" value={stats.today === null ? '—' : stats.today.toLocaleString('en-US')} />
        <StatTile icon="pin" tone="green" label="Active Hubs" value={stats.hubs.toLocaleString('en-US')} />
        <StatTile icon="clock" tone="purple" label="Latest Registration" value={stats.latest} />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
        <div className="flex flex-wrap items-center gap-2.5">
          {(isSuper || hubs.length > 1) && (
            <SelectBox icon="pin" label="Hub" value={hub} onChange={(v) => { setHub(v); setPage(1) }} className="w-full sm:w-52">
              {isSuper && <option value="__all__">All Hubs</option>}
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </SelectBox>
          )}
          <div className="relative min-w-[200px] flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
            <input type="search" aria-label="Search guests" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search name, phone, email…" className={`${control} w-full pl-10 pr-3 placeholder:text-ink3`} />
          </div>
          <SelectBox icon="sort" label="Sort" value={sort} onChange={(v) => { setSort(v as Sort); setPage(1) }} className="w-full sm:w-56">
            <option value="registered">Sort: Newest First</option>
            <option value="name">Sort: Name (A–Z)</option>
            <option value="email">Sort: Email (A–Z)</option>
            <option value="hub">Sort: Hub (A–Z)</option>
          </SelectBox>
          <button
            type="button"
            aria-expanded={filterOpen}
            aria-controls="guest-filter"
            onClick={() => setFilterOpen((o) => !o)}
            className={`${control} inline-flex items-center justify-center gap-2 px-4 font-semibold hover:border-brand ${range !== 'any' ? 'border-emerald-600 text-emerald-700' : ''}`}
          >
            <Icon name="filter" />
            Filter
            {range !== 'any' && <span className="h-2 w-2 rounded-full bg-emerald-600" aria-label="1 filter applied" />}
          </button>
        </div>
        {filterOpen && (
          <div id="guest-filter" className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="mr-1 text-xs font-semibold text-ink2">Registered</span>
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={range === r.id}
                onClick={() => { setRange(r.id); setPage(1) }}
                className={`h-9 rounded-full border px-3.5 text-xs font-semibold transition-colors ${range === r.id ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-line2 text-ink2 hover:border-brand'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {flash && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[13px] font-medium text-emerald-700">
          {flash}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center text-[13px] text-ink3">{emptyText}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
          {/* Wide screens: a table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-surface2 text-[11px] uppercase tracking-wide text-ink3">
                  <th scope="col" className="w-12 py-3 pl-5 pr-2">
                    <input ref={headBox} type="checkbox" aria-label="Select all guests on this page" checked={allOnPage} onChange={togglePage} className="h-4 w-4 cursor-pointer accent-emerald-700" />
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">Guest</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Contact</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Hub</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Registration date</th>
                  <th scope="col" className="py-3 pl-3 pr-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((g) => (
                  <tr key={idOf(g)} onClick={() => open(g)} className={`cursor-pointer border-b border-line last:border-0 hover:bg-surface2 ${picked.has(idOf(g)) ? 'bg-emerald-50/50' : ''}`}>
                    <td className="py-3 pl-5 pr-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${fullName(g) || 'guest'}`} checked={picked.has(idOf(g))} onChange={() => togglePick(g)} className="h-4 w-4 cursor-pointer accent-emerald-700" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar g={g} />
                        <div className="min-w-0">
                          <div className="font-semibold text-ink">{fullName(g) || '—'}</div>
                          <div className="max-w-[160px] truncate text-xs text-ink3">ID: {g.key}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-ink2">
                      <div className="flex items-center gap-2">
                        <Icon name="phone" className="h-3.5 w-3.5 text-ink3" />
                        {g.phone || '—'}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Icon name="mail" className="h-3.5 w-3.5 text-ink3" />
                        <span className="max-w-[220px] truncate">{g.email || '—'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-block max-w-[200px] truncate rounded-md bg-emerald-600/10 px-2.5 py-1 align-middle text-xs font-semibold text-emerald-700">{g.hubName}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-ink2">
                      <span className="inline-flex items-center gap-2" suppressHydrationWarning>
                        <Icon name="calendar" className="h-3.5 w-3.5 text-ink3" />
                        {shortDate(g.registeredAt)}
                      </span>
                    </td>
                    <td className="py-3 pl-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={(e) => { e.stopPropagation(); open(g) }} className="h-9 whitespace-nowrap rounded-lg border border-line2 bg-surface px-3.5 text-xs font-semibold text-ink2 hover:border-emerald-600 hover:text-emerald-700">
                          View details
                        </button>
                        <button type="button" aria-label={`More actions for ${fullName(g) || 'guest'}`} aria-haspopup="menu" aria-expanded={menu ? idOf(menu.g) === idOf(g) : false} onClick={(e) => openMenu(e, g)} className="flex h-9 w-8 items-center justify-center rounded-lg text-ink2 hover:bg-surface2">
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: a list of cards */}
          <ul className="divide-y divide-line md:hidden">
            {visible.map((g) => (
              <li key={idOf(g)} className="flex items-center gap-1 pr-2">
                <button type="button" onClick={() => open(g)} className="flex min-w-0 flex-1 items-center gap-3 p-3.5 text-left">
                  <Avatar g={g} size="h-11 w-11 text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{fullName(g) || '—'}</div>
                    <div className="truncate text-xs text-ink2">{g.phone || g.email || '—'}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="truncate rounded-md bg-emerald-600/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{g.hubName}</span>
                      <span className="shrink-0 text-[10px] text-ink3" suppressHydrationWarning>{shortDate(g.registeredAt)}</span>
                    </div>
                  </div>
                </button>
                <button type="button" aria-label={`More actions for ${fullName(g) || 'guest'}`} aria-haspopup="menu" onClick={(e) => openMenu(e, g)} className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg text-ink2 hover:bg-surface2">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
            <p className="text-[13px] text-ink2" aria-live="polite">
              Showing {(start + 1).toLocaleString('en-US')} – {Math.min(start + PAGE_SIZE, rows.length).toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} guest{rows.length === 1 ? '' : 's'}
            </p>
            {pageCount > 1 && (
              <nav aria-label="Pagination" className="flex items-center gap-1.5">
                <button type="button" aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line2 text-ink2 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
                  <Icon name="left" />
                </button>
                {pageList(current, pageCount).map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-ink3">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      aria-label={`Page ${p}`}
                      aria-current={p === current ? 'page' : undefined}
                      onClick={() => setPage(p)}
                      className={`hidden h-9 min-w-9 rounded-lg px-2 text-[13px] font-semibold sm:block ${p === current ? 'bg-emerald-700 text-white' : 'text-ink2 hover:bg-surface2'}`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <span className="px-2 text-[13px] font-semibold text-ink2 sm:hidden">
                  {current} / {pageCount}
                </span>
                <button type="button" aria-label="Next page" disabled={current === pageCount} onClick={() => setPage(current + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line2 text-ink2 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
                  <Icon name="right" />
                </button>
              </nav>
            )}
          </div>
        </div>
      )}

      {menu && (
        <>
          <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setMenu(null)} className="fixed inset-0 z-40 cursor-default" />
          <div role="menu" style={menu.style} className="fixed z-50 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[0_10px_30px_rgba(15,31,74,0.15)]">
            <button role="menuitem" type="button" onClick={() => open(menu.g)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-surface2">
              <Icon name="eye" /> View details
            </button>
            <button role="menuitem" type="button" disabled={!menu.g.email} onClick={() => void copyEmail(menu.g)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-surface2 disabled:opacity-40">
              <Icon name="copy" /> Copy email
            </button>
            <button role="menuitem" type="button" onClick={() => open(menu.g, true)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-red-700 hover:bg-red-50">
              <Icon name="trash" /> Delete profile
            </button>
          </div>
        </>
      )}

      <Modal open={selected !== null} onClose={() => setSelected(null)} title="Guest Profile">
        {selected && (
          <div>
            <div className="mb-5 flex items-center gap-4 border-b border-line pb-5">
              <Avatar g={selected} size="h-[54px] w-[54px] text-base" />
              <div className="min-w-0">
                <div className="truncate text-lg font-bold text-ink">{fullName(selected) || '—'}</div>
                <span className="mt-1 inline-block rounded-full bg-emerald-600/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">REGISTERED GUEST</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Detail label="Phone">{selected.phone || '—'}</Detail>
              <Detail label="Hub">{selected.hubName}</Detail>
              <Detail label="Email" wide>{selected.email || '—'}</Detail>
              <Detail label="Registered" wide>
                <span suppressHydrationWarning>
                  {time(selected.registeredAt)
                    ? new Date(selected.registeredAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : '—'}
                </span>
              </Detail>
              <Detail label="Arrival"><span suppressHydrationWarning>{stayDate(selected.arrivalDate)}</span></Detail>
              <Detail label="Departure"><span suppressHydrationWarning>{stayDate(selected.departureDate)}</span></Detail>
            </div>

            <div className="mt-5">
              <FormMessage error={message.error} />
              {confirming ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
                  <p className="mb-3 text-[13px] font-medium text-red-700">Delete {fullName(selected) || 'this guest'}&apos;s profile and chat? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-10 flex-1 rounded-xl border border-line2 bg-surface text-sm font-semibold text-ink2">
                      Cancel
                    </button>
                    <button type="button" onClick={() => void remove()} disabled={busy} className="h-10 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                      {busy ? 'Deleting…' : 'Yes, delete'}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className="h-10 w-full rounded-xl border border-red-300 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100">
                  Delete profile
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
