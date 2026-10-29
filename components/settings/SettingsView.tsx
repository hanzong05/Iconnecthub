'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import {
  resetPaletteAction,
  saveContactsAction,
  saveHouseRulesAction,
  saveHeroImageAction,
  saveHubStatusAction,
  saveLocationAction,
  saveMapDisplayAction,
  savePrivacyPolicyAction,
  saveLocalGuideAction,
  saveMenuAction,
  saveTabOrderAction,
  saveGeofenceAction,
  saveGroupsAction,
  saveHubNameAction,
  savePaletteAction,
  savePwNotifyAction,
  saveGuestNotifyAction,
  saveQuickActionsAction,
  saveVisibilityAction,
  saveMoreLabelAction,
  saveWifiAction,
} from '@/app/actions/settings'
import type { DraftState } from '@/app/actions/settings'
import EmbedPreview from '@/components/preview/EmbedPreview'
import PublishBar from './PublishBar'
import type { MenuItem } from '@/lib/menu'
import type { Page } from '@/lib/pages'
import { prepareMapImage, uploadPrepared } from '@/components/pathfinder/images'
import Icon, { type IconName } from '@/components/ui/Icon'
import RemoteImg from '@/components/ui/RemoteImg'
import { inputClass } from '@/components/ui/fields'
import {
  DEFAULT_VIS_GROUPS,
  GROUP_ICONS,
  CONTACT_KINDS,
  HERO_SLOTS,
  MAX_EXTRA_CONTACTS,
  MAP_MODES,
  TAB_LABELS,
  PALETTE_FIELDS,
  QUICK_ACTION_OPTIONS,
  VIS_ITEMS,
  MORE_LABEL_MAX,
  RULE_LIMITS,
  type HubRule,
  generatePalette,
  type AuditEntry,
  type ContactKind,
  type HeroSlot,
  type HubSettings,
  type MapMode,
  type Palette,
  type VisGroup,
} from '@/lib/settings-catalog'

type Say = (r: DraftState) => void

const label = (id: string) => VIS_ITEMS.find((i) => i.id === id)?.label ?? id

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex h-full flex-1 flex-col rounded-2xl border border-line bg-surface p-6 shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
      <h2 className="text-[15px] font-bold text-ink">{title}</h2>
      {hint && <p className="mt-0.5 mb-4 text-xs text-ink3">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {/* Fills the card so equal-height cards in a row end level; the last button sits at the bottom. */}
      <div className="flex flex-1 flex-col [&>:nth-last-child(2)]:mb-3 [&>button:last-child]:mt-auto [&>button:last-child]:self-start [&>button.w-full:last-child]:self-stretch">
        {children}
      </div>
    </section>
  )
}

function Switch({ on, onChange, name, disabled }: { on: boolean; onChange: (v: boolean) => void; name: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={name} disabled={disabled} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-emerald-600' : 'bg-line2'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

const btn = 'h-10 whitespace-nowrap rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:opacity-60'
const ghost = 'h-10 rounded-xl border border-line2 bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60'

export default function SettingsView({ hubId, initial, hubs, history, noHub = false, guestCss = '', dbUrl = '', pages = {} }: { hubId: string; initial: HubSettings; hubs: { id: string; name: string }[]; history: { entries: AuditEntry[]; currentReleaseId: string | null }; noHub?: boolean; guestCss?: string; dbUrl?: string; pages?: Record<string, Page> }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  // The draft version this page last saw. Every save sends it, so a save made over someone else's newer draft is refused instead of overwriting it.
  const ver = useRef(initial.draft.version)
  const [conflict, setConflict] = useState(false)
  const track = (r: DraftState) => {
    if (r.version !== undefined) ver.current = r.version
    if (r.conflict) setConflict(true)
    else if (r.version !== undefined && !r.error) router.refresh()
  }
  // Messages float at the bottom and clear themselves, so they never cover the form.
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), msg.error ? 9000 : 4500)
    return () => clearTimeout(t)
  }, [msg])
  const say: Say = (r) => {
    track(r)
    setMsg(r.error ? { text: r.error, error: true } : { text: r.success ?? 'Saved.' })
  }
  const run = (fn: () => Promise<DraftState>, after?: () => void) =>
    start(async () => {
      const r = await fn()
      say(r)
      if (!r.error) {
        after?.()
        router.refresh()
      }
    })

  const [name, setName] = useState(initial.hubName)
  const [ssid, setSsid] = useState(initial.wifi.ssid)
  const [pass, setPass] = useState(initial.wifi.password)
  const [slots, setSlots] = useState(initial.quickActions)
  const [geo, setGeo] = useState(initial.geofenceEnabled)
  const [gnOn, setGnOn] = useState(initial.guestNotify)
  const [pwOn, setPwOn] = useState(initial.pwNotify.enabled)
  const [pwEmail, setPwEmail] = useState(initial.pwNotify.email)
  const [pal, setPal] = useState<Palette>(initial.palette)
  const [vis, setVis] = useState(initial.visibility)
  const [groups, setGroups] = useState<VisGroup[]>(initial.groups)
  const [menuItems, setMenuItems] = useState<MenuItem[]>(initial.menuItems)

  const [showPass, setShowPass] = useState(false)
  const [contacts, setContacts] = useState(initial.contacts)
  const [rules, setRules] = useState<HubRule[]>(initial.houseRules)
  const setRule = (i: number, patch: Partial<HubRule>) => setRules((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const moveRule = (i: number, d: -1 | 1) => setRules((r) => { const j = i + d; if (j < 0 || j >= r.length) return r; const n = [...r]; [n[i], n[j]] = [n[j], n[i]]; return n })
  const [hero, setHero] = useState(initial.heroImages)
  const [busyHero, setBusyHero] = useState<HeroSlot | null>(null)
  const [lat, setLat] = useState(initial.location.lat === null ? '' : String(initial.location.lat))
  const [lon, setLon] = useState(initial.location.lon === null ? '' : String(initial.location.lon))
  const [map, setMap] = useState(initial.mapDisplay.mode === 'pathfinder' ? { ...initial.mapDisplay, mode: 'embed' as MapMode } : initial.mapDisplay)
  const [policy, setPolicy] = useState(initial.privacyPolicyUrl)
  const [guide, setGuide] = useState(initial.localGuideUrl)
  const [tabs, setTabs] = useState(initial.tabOrder)

  const setExtra = (i: number, patch: Partial<(typeof contacts.extra)[number]>) => setContacts((c) => ({ ...c, extra: c.extra.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))

  async function uploadHero(slot: HeroSlot, file: File | undefined) {
    if (!file) return
    setBusyHero(slot)
    try {
      const up = await uploadPrepared(await prepareMapImage(file))
      const r = await saveHeroImageAction(hubId, slot, up.url, ver.current)
      say(r)
      if (!r.error) {
        setHero((h) => ({ ...h, [slot]: up.url }))
        router.refresh()
      }
    } catch (e) {
      say({ error: e instanceof Error ? e.message : 'The picture could not be uploaded.' })
    } finally {
      setBusyHero(null)
    }
  }
  function removeHero(slot: HeroSlot) {
    if (!window.confirm(`Remove the ${HERO_SLOTS.find((h) => h.id === slot)?.label} picture?`)) return
    start(async () => {
      const r = await saveHeroImageAction(hubId, slot, '', ver.current)
      say(r)
      if (!r.error) setHero((h) => ({ ...h, [slot]: '' }))
    })
  }
  function moveTab(i: number, d: -1 | 1) {
    const j = i + d
    if (j < 0 || j >= tabs.length) return
    const prev = tabs
    const next = [...tabs]
    ;[next[i], next[j]] = [next[j], next[i]]
    setTabs(next)
    start(async () => {
      const r = await saveTabOrderAction(hubId, next, ver.current)
      say(r)
      if (r.error) setTabs(prev)
    })
  }
  const latN = Number(lat)
  const lonN = Number(lon)
  const validPoint = lat.trim() !== '' && lon.trim() !== '' && Number.isFinite(latN) && Number.isFinite(lonN) && Math.abs(latN) <= 90 && Math.abs(lonN) <= 180
  const mapSrc = validPoint ? `https://www.openstreetmap.org/export/embed.html?bbox=${lonN - 0.01}%2C${latN - 0.006}%2C${lonN + 0.01}%2C${latN + 0.006}&layer=mapnik&marker=${latN}%2C${lonN}` : null

  const placed = new Set(groups.flatMap((g) => g.items))
  const unassigned = [...VIS_ITEMS.map((i) => i.id as string), ...menuItems.map((m) => m.id)].filter((id) => !placed.has(id))
  const [names, setNames] = useState<Record<string, string>>(initial.moreLabels)
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null)
  const itemLabel = (id: string) => menuItems.find((m) => m.id === id)?.label ?? names[id] ?? label(id)
  const isOn = (id: string) => (menuItems.find((m) => m.id === id)?.shown ?? vis[id] !== false)

  /** Saves the custom items and the groups together; resolves true when the server accepted them. */
  async function saveMenu(items: MenuItem[], nextGroups: VisGroup[]): Promise<boolean> {
    const r = await saveMenuAction(hubId, { items, groups: nextGroups }, ver.current)
    say(r)
    if (r.error) return false
    setMenuItems(items)
    setGroups(nextGroups)
    return true
  }

  function saveGroups(next: VisGroup[]) {
    const prev = groups
    setGroups(next)
    start(async () => {
      const r = await saveGroupsAction(hubId, next, ver.current)
      say(r)
      if (r.error) setGroups(prev)
    })
  }
  const moveItem = (id: string, to: string) => {
    const next = groups.map((g) => ({ ...g, items: g.items.filter((x) => x !== id) }))
    if (to !== '') next.find((g) => g.id === to)?.items.push(id)
    saveGroups(next)
  }
  const shift = (gid: string, id: string, d: -1 | 1) =>
    saveGroups(
      groups.map((g) => {
        if (g.id !== gid) return g
        const items = [...g.items]
        const i = items.indexOf(id)
        const j = i + d
        if (i < 0 || j < 0 || j >= items.length) return g
        ;[items[i], items[j]] = [items[j], items[i]]
        return { ...g, items }
      }),
    )
  /** Saves a built-in item's own name (empty = default name). */
  function saveName(id: string, text: string) {
    const t = text.replace(/\s+/g, ' ').trim()
    const prev = names
    setNames((n) => { const x = { ...n }; if (t) x[id] = t; else delete x[id]; return x })
    setRenaming(null)
    start(async () => {
      const r = await saveMoreLabelAction(hubId, id, t, ver.current)
      say(r)
      if (r.error) setNames(prev)
    })
  }
  function toggleVis(id: string) {
    const custom = menuItems.find((m) => m.id === id)
    if (custom) {
      void saveMenu(menuItems.map((m) => (m.id === id ? { ...m, shown: !m.shown } : m)), groups)
      return
    }
    const on = !vis[id]
    setVis((v) => ({ ...v, [id]: on }))
    start(async () => {
      const r = await saveVisibilityAction(hubId, id, on, ver.current)
      track(r)
      if (r.error) {
        setVis((v) => ({ ...v, [id]: !on }))
        say(r)
      }
    })
  }
  function addGroup() {
    const n = window.prompt('Group name (for example "My Stay"):')?.trim()
    if (!n) return
    saveGroups([...groups, { id: `g${Date.now().toString(36)}`, icon: 'person', label: n.slice(0, 40), items: [] }])
  }
  function renameGroup(g: VisGroup) {
    const n = window.prompt('Group name:', g.label)?.trim()
    if (n) saveGroups(groups.map((x) => (x.id === g.id ? { ...x, label: n.slice(0, 40) } : x)))
  }
  function deleteGroup(g: VisGroup) {
    if (!window.confirm(`Delete group "${g.label}"? Its items move to Unassigned. They are not hidden.`)) return
    saveGroups(groups.filter((x) => x.id !== g.id))
  }
  function resetGroups() {
    if (!window.confirm('Reset to the suggested grouping? This replaces your current groups.')) return
    saveGroups(DEFAULT_VIS_GROUPS.map((g) => ({ ...g, items: [...g.items] })))
  }

  const preview = (
    <EmbedPreview
      hubId={hubId || 'preview'}
      dbUrl={dbUrl}
      css={guestCss}
      preview={{
        pages,
        settings: { ...initial, hubName: name, wifi: { ssid, password: pass }, quickActions: slots, palette: pal, visibility: vis, groups, contacts, heroImages: hero, location: { lat: lat === '' || Number.isNaN(Number(lat)) ? null : Number(lat), lon: lon === '' || Number.isNaN(Number(lon)) ? null : Number(lon) }, mapDisplay: map, privacyPolicyUrl: policy, localGuideUrl: guide, menuItems, houseRules: rules.filter((r) => r.title.trim()), moreLabels: names, tabOrder: tabs },
      }}
    />
  )
  const [activeGroup, setActiveGroup] = useState(initial.groups[0]?.id ?? '')
  // The banner is the picture uploaded as the Home page hero, and nothing else.
  const banner = hero.home
  const [active, setActive] = useState(initial.hub.active)
  const [locTab, setLocTab] = useState<'map' | 'image'>('map')
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const tabIcon: Record<string, IconName> = { home: 'grid', events: 'calendar', more: 'list' }
  function dropTab(to: number) {
    if (dragFrom === null || dragFrom === to) return setDragFrom(null)
    const prev = tabs
    const next = [...tabs]
    const [m] = next.splice(dragFrom, 1)
    next.splice(to, 0, m)
    setDragFrom(null)
    setTabs(next)
    start(async () => {
      const r = await saveTabOrderAction(hubId, next, ver.current)
      say(r)
      if (r.error) setTabs(prev)
    })
  }
  const swatch = (f: (typeof PALETTE_FIELDS)[number]) => (
    <div key={f.key} className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-2.5 py-2">
      <label className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 border-white shadow" style={{ background: pal[f.key] }}>
        <span className="sr-only">{f.label} color picker</span>
        <input type="color" value={pal[f.key]} onChange={(e) => setPal((p) => ({ ...p, [f.key]: e.target.value }))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold text-ink">{f.label}</div>
        <input
          aria-label={`${f.label} hex`}
          maxLength={6}
          key={pal[f.key]}
          defaultValue={pal[f.key].replace('#', '')}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '')
            if (raw.length === 6) setPal((p) => ({ ...p, [f.key]: `#${raw.toLowerCase()}` }))
          }}
          className="mt-0.5 h-7 w-full rounded-md border border-line2 bg-surface px-1.5 font-mono text-xs uppercase text-ink outline-none focus:border-brand"
        />
      </div>
    </div>
  )
  const mapRadio = (mode: MapMode, title: string, body?: ReactNode) => (
    <div className={`rounded-xl border p-3 ${map.mode === mode ? 'border-brand bg-surface2' : 'border-line'}`}>
      <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-bold text-ink">
        <input type="radio" name="mapMode" className="h-4 w-4 accent-[var(--color-brand)]" checked={map.mode === mode} onChange={() => setMap({ ...map, mode })} />
        {title}
      </label>
      {map.mode === mode && body && <div className="mt-2.5">{body}</div>}
    </div>
  )
  const guideOk = /^https:\/\//i.test(guide.trim())
  const policyOk = /^https:\/\//i.test(policy.trim())

  return (
    <div className="flex w-full flex-col gap-5 pb-8">
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-5 z-40 flex justify-center empty:hidden">
        {msg && (
          <div className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-2.5 text-[13px] font-medium shadow-lg ${msg.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            <span className="min-w-0 flex-1">{msg.text}</span>
            <button type="button" aria-label="Dismiss message" className="shrink-0 text-base leading-none opacity-60 hover:opacity-100" onClick={() => setMsg(null)}>×</button>
          </div>
        )}
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
        {banner && <RemoteImg src={banner} w={1200} alt="" loading="eager" className="absolute inset-0 h-full w-full object-cover" />}
        <div className={`absolute inset-0 ${banner ? 'bg-gradient-to-r from-white/95 via-white/80 to-white/10' : 'bg-surface2'}`} />
        <div className="relative flex flex-wrap items-center gap-5 p-6 sm:p-8">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-surface text-2xl font-bold text-brand shadow">
            {initial.hub.logoUrl ? <RemoteImg src={initial.hub.logoUrl} w={160} alt="" className="h-full w-full object-cover" /> : (initial.hub.name || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="truncate text-xl font-bold text-ink">{noHub ? 'No hub selected' : initial.hub.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink2">
              <Icon name="pin" className="h-3.5 w-3.5" />
              <span>{noHub ? 'Choose a hub below to see its settings.' : initial.hub.location || 'No location set'}</span>
              {!noHub && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${initial.hub.active ? 'bg-emerald-50 text-emerald-700' : 'bg-line text-ink2'}`}>{initial.hub.active ? 'Active' : 'Inactive'}</span>}
            </div>
            {initial.hub.description && <p className="mt-2 max-w-xl text-[13px] text-ink2">{initial.hub.description}</p>}
          </div>
          {initial.hub.publicUrl && (
            <a href={initial.hub.publicUrl} target="_blank" rel="noopener noreferrer" className={`${ghost} inline-flex items-center gap-1.5 bg-white`}>
              View Hub <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </section>

      <section className="flex flex-wrap items-end gap-4 rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
        <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink2">
          Select hub
          <select className={inputClass} value={noHub ? '' : hubId} disabled={!noHub && hubs.length < 2} onChange={(e) => e.target.value && router.push(`/dashboard/settings?hub=${encodeURIComponent(e.target.value)}`)}>
            {noHub && <option value="">— Choose a hub —</option>}
            {(hubs.length || noHub ? hubs : [{ id: hubId, name: initial.hub.name }]).map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3 sm:border-l sm:border-line sm:pl-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink2">
            Hub status
            <div className="mt-1 flex items-center gap-2">
              <Switch name="Hub active" on={active && !noHub} disabled={pending || noHub} onChange={setActive} />
              <span className={`text-[13px] font-semibold normal-case ${active && !noHub ? 'text-emerald-700' : 'text-ink2'}`}>{noHub ? '—' : active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
          <button className={btn} disabled={pending || noHub || active === initial.hub.active} onClick={() => run(() => saveHubStatusAction(hubId, active))}>Save changes</button>
        </div>
      </section>

      {!noHub && <PublishBar hubId={hubId} draft={initial.draft} history={history} conflict={conflict} getVersion={() => ver.current} onResult={say} />}

      {!noHub && (
        <details className="rounded-2xl border border-line bg-surface p-4 xl:hidden">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Phone preview</summary>
          <div className="mt-3">{preview}</div>
        </details>
      )}

      <div className={noHub ? '' : 'xl:grid xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start xl:gap-5'}>
      <fieldset disabled={noHub} aria-label="Hub settings" className={`m-0 flex min-w-0 flex-col gap-4 border-0 p-0 ${noHub ? 'opacity-60' : ''}`}>
      <div className="grid items-stretch gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Card title="Hero images" hint="Upload and manage the pictures at the top of each guest page. JPG, PNG or WebP.">
            <div className="grid gap-4 sm:grid-cols-3">
              {HERO_SLOTS.map((h) => (
                <div key={h.id}>
                  <div className="relative aspect-[12/5] overflow-hidden rounded-xl border border-line bg-surface2">
                    {hero[h.id] ? <RemoteImg src={hero[h.id]} w={560} alt={`${h.label} page picture`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[11px] text-ink3">No picture</div>}
                    <label className={`absolute right-1.5 top-1.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-white/95 text-ink shadow hover:text-brand focus-within:ring-2 focus-within:ring-brand ${busyHero ? 'pointer-events-none opacity-60' : ''}`} title={hero[h.id] ? 'Replace picture' : 'Upload picture'}>
                      <span className="text-sm" aria-hidden="true">{busyHero === h.id ? '…' : '✎'}</span>
                      <span className="sr-only">{hero[h.id] ? `Replace ${h.label} picture` : `Upload ${h.label} picture`}</span>
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busyHero !== null} onChange={(e) => { void uploadHero(h.id, e.target.files?.[0]); e.target.value = '' }} />
                    </label>
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-ink">{h.label} Page Hero</div>
                      <div className="text-[11px] text-ink3">1920 × 800px (recommended)</div>
                    </div>
                    <button aria-label={`Delete ${h.label} picture`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40" disabled={pending || busyHero !== null || !hero[h.id]} onClick={() => removeHero(h.id)}>
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-5">
          <Card title="Contacts" hint="Main contact information for this hub.">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2">Contact name<input className={inputClass} value={contacts.name} maxLength={100} onChange={(e) => setContacts({ ...contacts, name: e.target.value })} /></label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2">Phone<input inputMode="tel" className={inputClass} value={contacts.phone} maxLength={30} onChange={(e) => setContacts({ ...contacts, phone: e.target.value })} /></label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2">Email<input type="email" className={inputClass} value={contacts.email} maxLength={200} onChange={(e) => setContacts({ ...contacts, email: e.target.value })} /></label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2">Website (optional)<input className={inputClass} placeholder="https://" value={contacts.website} maxLength={500} onChange={(e) => setContacts({ ...contacts, website: e.target.value })} /></label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2 sm:col-span-2">Address<input className={inputClass} value={contacts.address} maxLength={300} onChange={(e) => setContacts({ ...contacts, address: e.target.value })} /></label>
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink2">More contacts <span className="font-normal normal-case text-ink3">({contacts.extra.length}/{MAX_EXTRA_CONTACTS})</span></div>
              {contacts.extra.length === 0 && <p className="mb-2 text-xs text-ink3">None yet. Add an emergency number, front desk, or social links.</p>}
              <ul className="flex flex-col gap-2">
                {contacts.extra.map((c, i) => (
                  <li key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface2 p-2">
                    <input aria-label={`Contact ${i + 1} name`} placeholder="Name (e.g. Emergency)" className={`${inputClass} !min-h-10`} value={c.label} maxLength={60} onChange={(e) => setExtra(i, { label: e.target.value })} />
                    <select aria-label={`Contact ${i + 1} type`} className={`${inputClass} !min-h-10`} value={c.kind} onChange={(e) => setExtra(i, { kind: e.target.value as ContactKind })}>
                      {CONTACT_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>{k.label}</option>
                      ))}
                    </select>
                    <div className="col-span-2 flex gap-2">
                      <input aria-label={`Contact ${i + 1} value`} placeholder={c.kind === 'phone' ? '(555) 010-2000' : c.kind === 'email' ? 'name@example.com' : 'https://'} inputMode={c.kind === 'phone' ? 'tel' : undefined} className={`${inputClass} !min-h-10`} value={c.value} maxLength={c.kind === 'link' ? 500 : 200} onChange={(e) => setExtra(i, { value: e.target.value })} />
                      <button aria-label={`Remove contact ${i + 1}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100" onClick={() => setContacts({ ...contacts, extra: contacts.extra.filter((_, j) => j !== i) })}>
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[{ l: 'Emergency', k: 'phone' }, { l: 'Front desk', k: 'phone' }, { l: 'Facebook', k: 'link' }, { l: 'Instagram', k: 'link' }, { l: '', k: 'phone' }].map((q) => (
                  <button key={q.l || 'other'} type="button" disabled={contacts.extra.length >= MAX_EXTRA_CONTACTS} className="rounded-full border border-line2 bg-surface px-3 py-1 text-xs font-semibold text-ink2 hover:border-brand hover:text-brand disabled:opacity-50" onClick={() => setContacts({ ...contacts, extra: [...contacts.extra, { label: q.l, kind: q.k as ContactKind, value: '' }] })}>
                    + {q.l || 'Other'}
                  </button>
                ))}
              </div>
            </div>
            <button className={`${btn} mt-4`} disabled={pending} onClick={() => run(() => saveContactsAction(hubId, contacts, ver.current))}>Save contacts</button>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card title="WiFi settings" hint="Change the WiFi name and password in seconds.">
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2">WiFi name (SSID)<input className={inputClass} value={ssid} maxLength={64} onChange={(e) => setSsid(e.target.value)} /></label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2">WiFi password
                <span className="relative">
                  <input type={showPass ? 'text' : 'password'} className={`${inputClass} pr-16`} value={pass} maxLength={128} onChange={(e) => setPass(e.target.value)} />
                  <button type="button" aria-pressed={showPass} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] font-semibold text-brand hover:bg-surface2" onClick={() => setShowPass((v) => !v)}>{showPass ? 'Hide' : 'Show'}</button>
                </span>
              </label>
            </div>
            <button className={`${btn} mt-3 w-full`} disabled={pending} onClick={() => run(() => saveWifiAction(hubId, ssid, pass, ver.current))}>Update WiFi</button>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card title="Location" hint="Set the exact location for this hub.">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2">Latitude<input inputMode="decimal" className={inputClass} value={lat} onChange={(e) => setLat(e.target.value)} /></label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2">Longitude<input inputMode="decimal" className={inputClass} value={lon} onChange={(e) => setLon(e.target.value)} /></label>
            </div>
            <div role="tablist" aria-label="Preview" className="mt-3 grid grid-cols-2 rounded-xl border border-line2 bg-surface2 p-0.5 text-xs font-semibold">
              {(['map', 'image'] as const).map((t) => (
                <button key={t} role="tab" aria-selected={locTab === t} className={`h-8 rounded-lg ${locTab === t ? 'bg-surface text-brand shadow-sm' : 'text-ink2'}`} onClick={() => setLocTab(t)}>{t === 'map' ? 'Embed map' : 'Image link only'}</button>
              ))}
            </div>
            <div className="mt-2">
              {locTab === 'map' ? (
                mapSrc ? <iframe title="Hub location preview" src={mapSrc} loading="lazy" referrerPolicy="no-referrer" className="h-36 w-full rounded-xl border border-line" /> : <p className="rounded-xl border border-dashed border-line2 px-3 py-10 text-center text-xs text-ink3">Enter a latitude and longitude to see the map.</p>
              ) : map.imageUrl ? (
                <RemoteImg src={map.imageUrl} w={480} alt="Map image" className="h-36 w-full rounded-xl border border-line object-cover" />
              ) : (
                <p className="rounded-xl border border-dashed border-line2 px-3 py-10 text-center text-xs text-ink3">No map image link yet. Add one under Map display.</p>
              )}
            </div>
            <button className={`${btn} mt-3`} disabled={pending} onClick={() => run(() => saveLocationAction(hubId, { lat, lon }, ver.current))}>Save location</button>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card title="Map display" hint="Choose how the map appears on guest-facing pages.">
            <div className="flex flex-col gap-2">
              {mapRadio('embed', 'Embed link (Path Finder map view)', <input aria-label="Embed link" placeholder="https://…" className={inputClass} value={map.embedUrl} maxLength={500} onChange={(e) => setMap({ ...map, embedUrl: e.target.value })} />)}
              {mapRadio('image', 'Image link only', <input aria-label="Map image link" placeholder="https://yourdomain.com/map-image.jpg" className={inputClass} value={map.imageUrl} maxLength={500} onChange={(e) => setMap({ ...map, imageUrl: e.target.value })} />)}
              {mapRadio('none', 'No map')}
            </div>
            <button className={`${btn} mt-3`} disabled={pending} onClick={() => run(() => saveMapDisplayAction(hubId, map, ver.current))}>Save map display</button>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card title="Color palette" hint="Set each brand color exactly, for hubs with strict branding rules.">
            <div className="grid gap-2 sm:grid-cols-2">{PALETTE_FIELDS.filter((f) => f.key === 'primary' || f.key === 'secondary').map(swatch)}</div>
            <details open className="mt-2 rounded-xl border border-line">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-ink2">More colors</summary>
              <div className="grid gap-2 p-2 sm:grid-cols-2">{PALETTE_FIELDS.filter((f) => f.key !== 'primary' && f.key !== 'secondary').map(swatch)}</div>
            </details>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className={ghost} onClick={() => setPal(generatePalette(pal.primary))}>Auto-fill from primary</button>
              <button className={ghost} disabled={pending} onClick={() => run(() => resetPaletteAction(hubId, ver.current), () => setPal(generatePalette('#1a56db')))}>Reset to default</button>
            </div>
            <button className={`${btn} mt-2 w-full`} disabled={pending} onClick={() => run(() => savePaletteAction(hubId, pal, ver.current))}>Apply colors</button>
          </Card>
        </div>

        <div className="flex flex-col gap-5 lg:col-span-4">
          <Card title="Hub visibility" hint="Drag items to arrange the guest tabs, or use the arrows.">
            <ol className="flex flex-col gap-2">
              {tabs.map((t, i) => (
                <li key={t} draggable={!pending} onDragStart={() => setDragFrom(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropTab(i)} onDragEnd={() => setDragFrom(null)} className={`flex items-center gap-2.5 rounded-xl border border-line bg-surface2 px-3 py-2.5 ${dragFrom === i ? 'opacity-50' : ''}`}>
                  <span aria-hidden="true" className="cursor-grab select-none text-ink3">⋮⋮</span>
                  <Icon name={tabIcon[t] ?? 'dot'} className="h-4 w-4 text-ink2" />
                  <span className="flex-1 text-[13px] font-semibold text-ink">{TAB_LABELS[t]}</span>
                  <button aria-label={`Move ${TAB_LABELS[t]} up`} disabled={pending || i === 0} className="h-8 w-8 rounded-lg border border-line2 bg-surface text-xs hover:border-brand disabled:opacity-40" onClick={() => moveTab(i, -1)}>↑</button>
                  <button aria-label={`Move ${TAB_LABELS[t]} down`} disabled={pending || i === tabs.length - 1} className="h-8 w-8 rounded-lg border border-line2 bg-surface text-xs hover:border-brand disabled:opacity-40" onClick={() => moveTab(i, 1)}>↓</button>
                </li>
              ))}
            </ol>
            <button className={`${ghost} mt-3 w-full`} disabled={pending} onClick={() => { const d = ['home', 'events', 'more']; setTabs(d); start(async () => say(await saveTabOrderAction(hubId, d, ver.current))) }}>Reset to suggested</button>
          </Card>
          <Card title="25-mile alert radius" hint="When on, alerts only go to guests within 25 miles of the hub. When off, they go to every guest.">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface2 px-4 py-3">
              <span className="text-[13px] font-semibold text-ink">{geo ? 'On: nearby guests only' : 'Off: all guests'}</span>
              <Switch name="25-mile radius" on={geo} disabled={pending} onChange={(v) => {
                setGeo(v)
                start(async () => {
                  const r = await saveGeofenceAction(hubId, v, ver.current)
                  say(r)
                  if (r.error) setGeo(!v)
                })
              }} />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5 lg:col-span-4">
          <Card title="Rules" hint="The rules guests read when they open Rules. Add each rule with its details.">
            {rules.length === 0 && <p className="mb-2 text-xs text-ink3">None yet. Add quiet hours, check-in and check-out times, pets, fires…</p>}
            <ul className="flex flex-col gap-3">
              {rules.map((r, i) => (
                <li key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-surface2 p-3">
                  <input aria-label={`Rule ${i + 1} title`} className={inputClass} placeholder="Title (Quiet hours)" value={r.title} maxLength={RULE_LIMITS.title} onChange={(e) => setRule(i, { title: e.target.value })} />
                  <textarea aria-label={`Rule ${i + 1} details`} rows={3} className={`${inputClass} h-auto min-h-[76px] py-2 leading-snug`} placeholder="Details. Line breaks and **bold** work." value={r.details} maxLength={RULE_LIMITS.details} onChange={(e) => setRule(i, { details: e.target.value })} />
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" aria-label={`Move rule ${i + 1} up`} disabled={pending || i === 0} className="h-9 w-9 rounded-lg border border-line2 bg-surface text-xs hover:border-brand disabled:opacity-40" onClick={() => moveRule(i, -1)}>↑</button>
                    <button type="button" aria-label={`Move rule ${i + 1} down`} disabled={pending || i === rules.length - 1} className="h-9 w-9 rounded-lg border border-line2 bg-surface text-xs hover:border-brand disabled:opacity-40" onClick={() => moveRule(i, 1)}>↓</button>
                    <button type="button" aria-label={`Remove rule ${i + 1}`} className="flex h-9 items-center justify-center rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-600 hover:bg-red-100" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={pending || rules.length >= RULE_LIMITS.max} className={ghost} onClick={() => setRules([...rules, { title: '', details: '' }])}>+ Add rule</button>
              <span className="text-[11px] text-ink3">{rules.length}/{RULE_LIMITS.max}</span>
            </div>
            <button className={`${btn} mt-3`} disabled={pending} onClick={() => run(() => saveHouseRulesAction(hubId, rules, ver.current))}>Save rules</button>
          </Card>
          <Card title="Rules link" hint="Optional: a link to a full rules page. Guests see it under the rules. Leave empty to remove it.">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2">Rules URL
              <span className="flex gap-2">
                <input className={inputClass} placeholder="https://" value={policy} maxLength={500} onChange={(e) => setPolicy(e.target.value)} />
                {policyOk && <a href={policy.trim()} target="_blank" rel="noopener noreferrer" aria-label="Open rules page" className={`${ghost} inline-flex w-10 items-center justify-center px-0`}>↗</a>}
              </span>
            </label>
            <button className={`${btn} mt-3`} disabled={pending} onClick={() => run(() => savePrivacyPolicyAction(hubId, policy, ver.current))}>Save</button>
          </Card>
          <Card title="Local guide" hint="Link to your local area guide. It shows in the Local Guide tab and the Discover banner. Leave empty to hide the banner.">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2">Local guide URL
              <span className="flex gap-2">
                <input className={inputClass} placeholder="https://" value={guide} maxLength={500} onChange={(e) => setGuide(e.target.value)} />
                {guideOk && <a href={guide.trim()} target="_blank" rel="noopener noreferrer" aria-label="Open local guide" className={`${ghost} inline-flex w-10 items-center justify-center px-0`}>↗</a>}
              </span>
            </label>
            <button className={`${btn} mt-3`} disabled={pending} onClick={() => run(() => saveLocalGuideAction(hubId, guide, ver.current))}>Save</button>
          </Card>
          <Card title="Notifications to guests" hint="When off, announcements and events never send a push or email to this hub's guests. Takes effect at once.">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface2 px-4 py-3">
                <span className="text-[13px] font-semibold text-ink">{gnOn ? 'Guests can be notified' : 'Guest notifications are off'}</span>
                <Switch name="Notifications to guests" on={gnOn} disabled={pending} onChange={setGnOn} />
              </div>
              <div><button className={btn} disabled={pending} onClick={() => run(() => saveGuestNotifyAction(hubId, gnOn))}>Save</button></div>
            </div>
          </Card>
          <Card title="Password reset notifications" hint="Notify me when a hub user requests a password reset. The reset link still goes only to that person.">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface2 px-4 py-3">
                <span className="text-[13px] font-semibold text-ink">{pwOn ? 'Notify me: on' : 'Notify me: off'}</span>
                <Switch name="Password reset notices" on={pwOn} disabled={pending} onChange={setPwOn} />
              </div>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink2">Notify email<input type="email" placeholder="you@example.com" className={inputClass} value={pwEmail} maxLength={200} onChange={(e) => setPwEmail(e.target.value)} /></label>
              <div><button className={btn} disabled={pending} onClick={() => run(() => savePwNotifyAction(hubId, pwOn, pwEmail))}>Save</button></div>
            </div>
          </Card>
        </div>
      </div>

      <h2 className="mt-2 text-sm font-bold uppercase tracking-[0.06em] text-ink2">Menu & shortcuts</h2>
      <Card title="Hub name & quick actions" hint="The name guests see, and the four shortcut buttons on the guest home screen.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="Hub name" className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <button className={btn} disabled={pending} onClick={() => run(() => saveHubNameAction(hubId, name))}>Save name</button>
        </div>
        <div className="my-4 border-t border-line" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {slots.map((sl, i) => (
            <label key={i} className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink2">
              Slot {i + 1}
              <select className={inputClass} value={sl} onChange={(e) => setSlots((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}>
                {QUICK_ACTION_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <button className={`${btn} mt-3`} disabled={pending} onClick={() => run(() => saveQuickActionsAction(hubId, slots, ver.current))}>Save quick actions</button>
      </Card>
      <Card title="Guest menu" hint="Choose what appears in the guest More menu and how it is grouped. Switches save at once.">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Menu groups" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
            {[...groups.map((g) => ({ id: g.id, label: g.label, items: g.items })), ...(unassigned.length ? [{ id: '', label: 'Unassigned', items: unassigned }] : [])].map((g) => {
              const sel = (activeGroup === '' && g.id === '') || activeGroup === g.id
              const onCount = g.items.filter((i) => isOn(i)).length
              return (
                <button key={g.id || 'un'} role="tab" aria-selected={sel} onClick={() => setActiveGroup(g.id)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${sel ? 'border-brand bg-brand text-white' : 'border-line2 bg-surface text-ink2 hover:border-brand hover:text-brand'}`}>
                  {g.label} <span className={sel ? 'text-white/80' : 'text-ink3'}>{onCount}/{g.items.length}</span>
                </button>
              )
            })}
          </div>
          <button className={`${ghost} h-9 text-xs`} onClick={addGroup} disabled={pending || groups.length >= 12}>+ Add group</button>
          <button className={`${ghost} h-9 text-xs`} onClick={resetGroups} disabled={pending}>Reset to suggested</button>
        </div>

        {(() => {
          const cur = groups.find((g) => g.id === activeGroup)
          const ids = cur ? cur.items : unassigned
          return (
            <div className="mt-3 rounded-xl border border-line2 bg-surface2 p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="flex-1 text-[13px] font-bold text-ink">{cur ? cur.label : 'Unassigned'}</span>
                {cur && (
                  <>
                    <select aria-label={`Icon for ${cur.label}`} className="h-8 rounded-lg border border-line2 bg-surface px-2 text-xs" value={cur.icon} onChange={(e) => saveGroups(groups.map((x) => (x.id === cur.id ? { ...x, icon: e.target.value } : x)))}>
                      {GROUP_ICONS.map((i) => (
                        <option key={i.id} value={i.id}>{i.label}</option>
                      ))}
                    </select>
                    <button className="h-8 rounded-lg border border-line2 bg-surface px-2.5 text-xs font-semibold text-ink hover:border-brand" onClick={() => renameGroup(cur)}>Rename</button>
                    <button className="h-8 rounded-lg border border-line2 bg-surface px-2.5 text-xs font-semibold text-red-600 hover:border-red-300" onClick={() => deleteGroup(cur)}>Delete</button>
                  </>
                )}
              </div>
              {ids.length === 0 ? (
                <p className="py-3 text-center text-xs text-ink3">{cur ? 'No items in this group. Move some here from another group.' : 'Every item is in a group.'}</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {ids.map((id, idx) => (
                    <li key={id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[13px] font-semibold text-ink" title={itemLabel(id)}>{itemLabel(id)}</span>
                        <Switch name={`Show ${itemLabel(id)}`} on={isOn(id)} disabled={pending} onChange={() => toggleVis(id)} />
                      </div>
                      {!menuItems.some((m) => m.id === id) && (
                        renaming?.id === id ? (
                          <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); saveName(id, renaming.text) }}>
                            <input aria-label={`Name for ${label(id)}`} autoFocus className="h-8 min-w-0 flex-1 rounded-lg border border-line2 bg-surface2 px-2 text-xs" value={renaming.text} maxLength={MORE_LABEL_MAX} placeholder={label(id)} onChange={(e) => setRenaming({ id, text: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} />
                            <button type="submit" disabled={pending} className="h-8 rounded-lg border border-line2 bg-surface px-2 text-xs font-semibold hover:border-brand disabled:opacity-40">Save</button>
                            <button type="button" className="h-8 rounded-lg border border-line2 bg-surface px-2 text-xs hover:border-brand" onClick={() => setRenaming(null)}>Cancel</button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-2 text-[11px] text-ink3">
                            <button type="button" disabled={pending} className="font-semibold text-brand hover:underline disabled:opacity-40" aria-label={`Rename ${itemLabel(id)}`} onClick={() => setRenaming({ id, text: names[id] ?? '' })}>Rename</button>
                            {names[id] && <span className="truncate">Default: {label(id)}</span>}
                          </div>
                        )
                      )}
                      <div className="flex items-center gap-1.5">
                        <select aria-label={`Group for ${itemLabel(id)}`} className="h-8 min-w-0 flex-1 rounded-lg border border-line2 bg-surface2 px-1.5 text-xs" value={cur?.id ?? ''} onChange={(e) => moveItem(id, e.target.value)}>
                          <option value="">Unassigned</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.label}</option>
                          ))}
                        </select>
                        {cur && (
                          <>
                            <button aria-label={`Move ${itemLabel(id)} up`} disabled={pending || idx === 0} className="h-8 w-8 rounded-lg border border-line2 bg-surface text-xs hover:border-brand disabled:opacity-40" onClick={() => shift(cur.id, id, -1)}>↑</button>
                            <button aria-label={`Move ${itemLabel(id)} down`} disabled={pending || idx === ids.length - 1} className="h-8 w-8 rounded-lg border border-line2 bg-surface text-xs hover:border-brand disabled:opacity-40" onClick={() => shift(cur.id, id, 1)}>↓</button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })()}
      </Card>
      </fieldset>
      {!noHub && <aside aria-label="Phone preview" className="sticky top-4 hidden xl:block">{preview}</aside>}
      </div>

      <p role="note" className="rounded-xl border border-line bg-surface2 px-4 py-2.5 text-xs text-ink2">{noHub ? 'Select a hub to see and edit its settings.' : 'Changes are saved when you press a Save button (switches and the guest menu save at once) and guests see them right away.'}</p>
    </div>
  )
}
