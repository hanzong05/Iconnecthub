'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import Icon from '@/components/ui/Icon'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import EditHubForm from './EditHubForm'
import StatTile from '@/components/ui/StatTile'
import type { HubCard } from '@/lib/data/hubs'
import RemoteImg from '@/components/ui/RemoteImg'

type Status = 'all' | 'active' | 'inactive'
type Sort = 'name' | 'name-desc' | 'visitors' | 'posts'
type View = 'grid' | 'list'

const COVERS = [
  'from-sky-200 via-emerald-100 to-emerald-200',
  'from-blue-200 via-sky-100 to-teal-100',
  'from-emerald-200 via-lime-100 to-sky-200',
  'from-indigo-200 via-sky-100 to-emerald-100',
  'from-teal-200 via-emerald-100 to-amber-100',
]
const coverFor = (name: string) => COVERS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % COVERS.length]
const num = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-US'))
const noun = (n: number | null, one: string, many: string) => (n === null ? `${many}: unknown` : `${num(n)} ${n === 1 ? one : many}`)
const control = 'h-11 rounded-xl border border-line2 bg-surface text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_3px_rgba(26,86,219,0.10)]'

function Logo({ hub, size }: { hub: HubCard; size: string }) {
  return hub.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <RemoteImg src={hub.logoUrl} w={80} alt="" className={`shrink-0 rounded-full border-4 border-white bg-white object-cover shadow-md ${size}`} />
  ) : (
    <div aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-emerald-600 to-emerald-800 text-lg font-bold text-white shadow-md ${size}`}>
      {(hub.name[0] ?? '?').toUpperCase()}
    </div>
  )
}

function Badge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function Chip({ icon, children }: { icon: 'users' | 'file'; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-surface2 px-2.5 py-1 text-[11px] font-medium text-ink2">
      <Icon name={icon} className="h-3.5 w-3.5 text-ink3" />
      {children}
    </span>
  )
}

function Dots() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  )
}

export default function HubsView({ hubs, canUpload }: { hubs: HubCard[]; canUpload: boolean }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [status, setStatus] = useState<Status>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [view, setView] = useState<View>('grid')
  const [editing, setEditing] = useState<HubCard | null>(null)
  const [menu, setMenu] = useState<{ hub: HubCard; style: React.CSSProperties } | null>(null)
  const [flash, setFlash] = useState('')

  const totals = useMemo(
    () => ({
      hubs: hubs.length,
      active: hubs.filter((h) => h.active).length,
      visitors: hubs.reduce((n, h) => n + (h.visitors ?? 0), 0),
      visitorsUnknown: hubs.filter((h) => h.visitors === null).length,
      posts: hubs.reduce((n, h) => n + (h.posts ?? 0), 0),
      postsUnknown: hubs.filter((h) => h.posts === null).length,
    }),
    [hubs],
  )

  const rows = useMemo(() => {
    const q = deferred.trim().toLowerCase()
    const list = hubs.filter((h) => (status === 'all' || (status === 'active') === h.active) && (!q || h.name.toLowerCase().includes(q) || (h.location ?? '').toLowerCase().includes(q)))
    const by: Record<Sort, (a: HubCard, b: HubCard) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      'name-desc': (a, b) => b.name.localeCompare(a.name),
      visitors: (a, b) => (b.visitors ?? -1) - (a.visitors ?? -1) || a.name.localeCompare(b.name),
      posts: (a, b) => (b.posts ?? -1) - (a.posts ?? -1) || a.name.localeCompare(b.name),
    }
    return [...list].sort(by[sort])
  }, [hubs, deferred, status, sort])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
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

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, hub: HubCard) {
    if (menu?.hub.id === hub.id) return setMenu(null)
    const r = e.currentTarget.getBoundingClientRect()
    const flip = r.bottom + 150 > window.innerHeight
    setMenu({ hub, style: { right: Math.max(8, window.innerWidth - r.right), ...(flip ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) } })
  }

  async function copyId(hub: HubCard) {
    setMenu(null)
    try {
      await navigator.clipboard.writeText(hub.id)
      setFlash('Hub ID copied')
    } catch {
      setFlash('Could not copy the hub ID')
    }
  }

  const actions = (h: HubCard) => (
    <>
      <Link href={`/dashboard/hubs/${encodeURIComponent(h.id)}`} className="flex h-9 flex-1 items-center justify-center rounded-lg bg-brand text-[13px] font-semibold text-white transition-colors hover:bg-brand-dim">
        Manage hub
      </Link>
      <button type="button" aria-label={`More actions for ${h.name}`} aria-haspopup="menu" aria-expanded={menu?.hub.id === h.id} onClick={(e) => openMenu(e, h)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line2 bg-surface text-ink2 hover:border-brand">
        <Dots />
      </button>
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="map" tone="purple" label="Total Hubs" value={totals.hubs.toLocaleString('en-US')} />
        <StatTile icon="dot" tone="green" label="Active Hubs" value={totals.active.toLocaleString('en-US')} />
        <StatTile icon="users" tone="blue" label="Total Page Loads" value={totals.visitorsUnknown === hubs.length && hubs.length > 0 ? 'Unknown' : totals.visitors.toLocaleString('en-US')} note={totals.visitorsUnknown ? `All time. Not counted for ${totals.visitorsUnknown} hub${totals.visitorsUnknown === 1 ? '' : 's'}` : 'All time, every page load'} />
        <StatTile icon="file" tone="orange" label="Total Posts" value={totals.postsUnknown === hubs.length && hubs.length > 0 ? 'Unknown' : totals.posts.toLocaleString('en-US')} note={totals.postsUnknown ? `Not counted for ${totals.postsUnknown} hub${totals.postsUnknown === 1 ? '' : 's'}` : 'All hubs'} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface p-3 shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
        <div className="relative min-w-[200px] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
          <input type="search" aria-label="Search hubs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search campground hubs…" className={`${control} w-full pl-10 pr-3 placeholder:text-ink3`} />
        </div>
        <div className="relative w-full sm:w-48">
          <Icon name="filter" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status)} className={`${control} w-full cursor-pointer appearance-none pl-10 pr-9 font-medium`}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <Icon name="chevron" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
        </div>
        <div className="relative w-full sm:w-56">
          <Icon name="sort" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${control} w-full cursor-pointer appearance-none pl-10 pr-9 font-medium`}>
            <option value="name">Sort: Name (A–Z)</option>
            <option value="name-desc">Sort: Name (Z–A)</option>
            <option value="visitors">Sort: Most page loads</option>
            <option value="posts">Sort: Most posts</option>
          </select>
          <Icon name="chevron" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
        </div>
        <div role="group" aria-label="View" className="flex overflow-hidden rounded-xl border border-line2">
          {(['grid', 'list'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`flex h-11 items-center gap-2 px-4 text-[13px] font-semibold ${view === v ? 'bg-emerald-700 text-white' : 'bg-surface text-ink2 hover:bg-surface2'}`}>
              <Icon name={v} />
              {v === 'grid' ? 'Grid' : 'List'}
            </button>
          ))}
        </div>
      </div>

      {flash && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[13px] font-medium text-emerald-700">
          {flash}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center text-[13px] text-ink3">{hubs.length ? 'No hubs match your search' : 'No hubs yet'}</div>
      ) : view === 'grid' ? (
        <ul className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 min-[1100px]:grid-cols-3 min-[1500px]:grid-cols-4">
          {rows.map((h) => (
            <li key={h.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
              <div className={`relative h-20 bg-gradient-to-br ${coverFor(h.name)}`}>
                {h.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <RemoteImg src={h.coverUrl} w={400} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
                <div className="absolute right-3 top-3">
                  <Badge active={h.active} />
                </div>
              </div>
              <div className="px-4 pb-4">
                <div className="flex items-start gap-3">
                  <div className="relative z-10 -mt-9">
                    <Logo hub={h} size="h-[72px] w-[72px]" />
                  </div>
                  <div className="min-w-0 pt-2">
                    <div className="truncate text-sm font-bold text-ink" title={h.name}>{h.name}</div>
                    <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink3">
                      <Icon name="pin" className="h-3 w-3" />
                      <span className="truncate">{h.location ?? 'No location'}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip icon="users">{noun(h.visitors, 'page load', 'page loads')}</Chip>
                  <Chip icon="file">{noun(h.posts, 'post', 'posts')}</Chip>
                </div>
                <div className="mt-3 flex gap-2">{actions(h)}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
          {rows.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3.5">
              <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
                <Logo hub={h} size="h-14 w-14" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ink">{h.name}</div>
                  <div className="flex items-center gap-1 truncate text-xs text-ink3">
                    <Icon name="pin" className="h-3 w-3" />
                    <span className="truncate">{h.location ?? 'No location'}</span>
                  </div>
                </div>
              </div>
              <Badge active={h.active} />
              <div className="flex gap-2">
                <Chip icon="users">{noun(h.visitors, 'page load', 'page loads')}</Chip>
                <Chip icon="file">{noun(h.posts, 'post', 'posts')}</Chip>
              </div>
              <div className="flex w-full gap-2 sm:w-52">{actions(h)}</div>
            </li>
          ))}
        </ul>
      )}

      {menu && (
        <>
          <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setMenu(null)} className="fixed inset-0 z-40 cursor-default" />
          <div role="menu" style={menu.style} className="fixed z-50 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[0_10px_30px_rgba(15,31,74,0.15)]">
            <button role="menuitem" type="button" onClick={() => { setMenu(null); setEditing(menu.hub) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-surface2">
              <Icon name="settings" /> Edit hub details
            </button>
            <Link role="menuitem" href={`/dashboard/subscribers?hub=${encodeURIComponent(menu.hub.id)}`} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-surface2">
              <Icon name="users" /> View subscribers
            </Link>
            <button role="menuitem" type="button" onClick={() => void copyId(menu.hub)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-surface2">
              <Icon name="copy" /> Copy hub ID
            </button>
          </div>
        </>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit Hub Details" subtitle="Update how this hub appears in the admin and the guest app.">
        {editing && (
          <EditHubForm
            key={editing.id}
            hub={editing}
            canUpload={canUpload}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              setFlash('Hub details updated.')
              router.refresh()
            }}
          />
        )}
      </Modal>
    </div>
  )
}
