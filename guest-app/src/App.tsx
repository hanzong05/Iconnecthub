import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { VIS_ITEMS, houseRulesPage, type HubSettings } from '@/lib/settings-catalog'
import { parseSettings } from '@/lib/settings-parse'
import { formatText, telLink, type Block, type Page } from '@/lib/pages'
import { useFeed } from './data'
import { ANN_CAT, DEFAULT_MORE_ORDER, ICON_THEMES, MORE_ITEMS } from './hub-assets'
import { BELL, CLOCK, DISCOVER_PIN, NAV_ICONS, NAV_LABEL, PHONE_PATH, PIN, QA_CLASS, QA_ICONS } from './hub-icons'
import { dateRangeLabel, dateStrip, eventsOnDate, hubEvents, isoDate, liveAnnouncements, menuGroups, publishedPages, tabsFor, timeAgo, upcomingEvents, wxCode, type GuestAnnouncement, type HubEvent, type TabId } from './model'
import { themeCss } from './theme'
import { isMenuId, menuIcon, type MenuItem } from '@/lib/menu'
import { samplePage } from '@/lib/template'

export interface Config { hubId: string; dbUrl: string; classicUrl: string }
/** Admin preview: the app is drawn from values being edited instead of the database. Announcements and events still come from the hub's database address when one is given. */
export interface Preview { settings: HubSettings; pages: Record<string, Page>; tab?: TabId; openPage?: string }
type Overlay = null | { kind: 'contact' } | { kind: 'wifi' } | { kind: 'notif' } | { kind: 'page'; id: string } | { kind: 'sheet'; id: string } | { kind: 'event'; id: string }

const QA_LABEL: Record<string, string> = { map: 'Map', events: 'Events', contact: 'Contact Us', wifi: 'WiFi', rules: 'Rules' }
const GRADIENT = 'linear-gradient(135deg,#6b7280,#374151)'
const SVG = ({ html, className }: { html: string; className?: string }) => <span className={className} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />
const https = (v: string) => (/^https:\/\//i.test(v) ? v : '')
const bg = (url: string) => (https(url) ? { backgroundImage: `url("${url.replace(/["\\\n\r]/g, encodeURIComponent)}")` } : undefined)

export default function App({ config, preview }: { config: Config; preview?: Preview }) {
  const { hubId, dbUrl, classicUrl } = config
  const live = !preview
  const rawSettings = useFeed(dbUrl, `hubs/${hubId}/settings`, 30_000, live)
  const meta = useFeed<{ name?: string; logoUrl?: string }>(dbUrl, `hubs_meta/${hubId}`, 300_000, live)
  const anns = useFeed(dbUrl, `hubs/${hubId}/announcements`, 30_000, !!dbUrl)
  const acts = useFeed(dbUrl, `hubs/${hubId}/activities`, 30_000, !!dbUrl)
  const pagesFeed = useFeed(dbUrl, `hubs/${hubId}/pages`, 30_000, live)
  const pages = useMemo(() => (preview ? preview.pages : publishedPages(pagesFeed.data)), [preview, pagesFeed.data])
  const [tab, setTab] = useState<TabId>(preview?.tab ?? 'home')
  const [previewNote, setPreviewNote] = useState('')
  const [overlay, setOverlay] = useState<Overlay>(preview?.openPage ? { kind: 'page', id: preview.openPage } : null)
  const [day, setDay] = useState(() => isoDate(new Date()))
  const [read, setRead] = useState<Set<string>>(() => loadRead(hubId, !!preview))
  const [now, setNow] = useState(() => Date.now())
  const strip = useRef<HTMLDivElement>(null)
  // The strip sits in a hidden panel until the tab opens, so bring the chosen day into view then.
  useEffect(() => {
    if (tab !== 'events') return
    const el = strip.current?.querySelector<HTMLElement>('.date-tab.active')
    if (el && strip.current) strip.current.scrollLeft = Math.max(0, el.offsetLeft - 16)
  }, [tab])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const hubName = (preview ? preview.settings.hubName : meta.data?.name) || hubId
  const logoUrl = preview ? preview.settings.hub.logoUrl : meta.data?.logoUrl
  const st: HubSettings | null = useMemo(() => (preview ? preview.settings : rawSettings.loaded ? { ...parseSettings(rawSettings.data, meta.data, hubId, hubName), draft: { version: 0, updatedAt: '', updatedBy: '', changes: [] } } : null), [preview, rawSettings.loaded, rawSettings.data, meta.data, hubId, hubName])
  const weather = useWeather(st?.location.lat ?? null, st?.location.lon ?? null)

  if (!st) return <div className="bs-app" id="app" style={{ alignItems: 'center', justifyContent: 'center', color: '#6b7280', padding: 24, textAlign: 'center' }} role="status">{rawSettings.error ? 'This hub could not be loaded. Check your connection and try again.' : 'Loading…'}</div>

  const today = isoDate(new Date(now))
  const announcements = liveAnnouncements(anns.data, now)
  const events = hubEvents(acts.data)
  const unread = announcements.filter((a) => !read.has(a.id)).length
  const external = (href: string) => (preview ? undefined : href)
  // The admin preview never leaves the page; tapping an address says where guests would go instead of doing nothing.
  const previewLink = preview ? (href: string) => setPreviewNote(`Guests will open ${href.replace(/^https:\/\//i, '')}`) : undefined
  useEffect(() => {
    if (!previewNote) return
    const t = setTimeout(() => setPreviewNote(''), 3500)
    return () => clearTimeout(t)
  }, [previewNote])
  const classic = classicUrl && !preview ? classicUrl : ''
  const guideUrl = https(st.localGuideUrl)

  const openNotif = () => {
    setOverlay({ kind: 'notif' })
    const next = new Set(read)
    announcements.forEach((a) => next.add(a.id))
    setRead(next)
    saveRead(hubId, next, !!preview)
  }
  /** What a menu item or quick action does: open the page the manager published, a built-in sheet, or the old hub for features not in this app yet. */
  const itemAction = (id: string): { run?: () => void; href?: string } => {
    const custom = st.menuItems.find((m) => m.id === id)
    if (custom) {
      if (custom.kind === 'link') return custom.url ? { href: custom.url } : {}
      if (custom.kind === 'sheet') return { run: () => setOverlay({ kind: 'sheet', id }) }
      return { run: () => setOverlay({ kind: 'page', id }) }
    }
    if (id === 'map') return { run: () => setTab('map') }
    if (id === 'events') return { run: () => setTab('events') }
    if (id === 'contact') return { run: () => setOverlay({ kind: 'contact' }) }
    if (id === 'rules' && st.houseRules.length) return { run: () => setOverlay({ kind: 'page', id: 'rules' }) }
    if (id === 'wifi') return { run: () => setOverlay({ kind: 'wifi' }) }
    if (pages[id]) return { run: () => setOverlay({ kind: 'page', id }) }
    if (id === 'rules' && st.privacyPolicyUrl) return { href: st.privacyPolicyUrl }
    if (preview) return { run: () => setPreviewNote('Guests open the hub’s classic page for this item. Add a page in Pages to show it inside the app.') }
    return classic ? { href: classic } : {}
  }

  const tabs = tabsFor(st.tabOrder)
  // In the admin preview a new details page has no content yet; show it empty so the Super Admin can see where it leads.
  const page = overlay?.kind === 'page' ? (overlay.id === 'rules' && st.houseRules.length ? houseRulesPage(st.houseRules, st.privacyPolicyUrl) : undefined) ?? pages[overlay.id] ?? (preview && isMenuId(overlay.id) ? previewPage(st.menuItems.find((m) => m.id === overlay.id)) : undefined) : undefined
  const sheetItem = overlay?.kind === 'sheet' ? st.menuItems.find((m) => m.id === overlay.id && m.kind === 'sheet') : undefined
  const style = { '--bg': st.palette.bg, '--blue': st.palette.primary } as CSSProperties

  return (
    <div className="bs-app" id="app" style={style}>
      <style>{themeCss(st.palette)}{EXTRA_CSS}</style>
      {previewNote && <div role="status" style={{ position: 'absolute', left: 12, right: 12, bottom: 76, zIndex: 60, padding: '9px 12px', borderRadius: 10, background: '#111827', color: '#fff', fontSize: 12, fontWeight: 600, textAlign: 'center', pointerEvents: 'none', overflowWrap: 'anywhere' }}>{previewNote}</div>}
      <div className="page-content" id="pageContent">
        <div className={`tab-panel${tab === 'home' ? ' active' : ''}`} id="tab-home">
          <div className="hero" id="homeHero">
            <div className="hero-bg" id="heroBg" style={bg(st.heroImages.home)} />
            <div className="hero-content">
              <div className="hero-top">
                <div className="hero-logo">{https(logoUrl ?? '') ? <img src={logoUrl} alt={hubName} style={{ height: 70, width: 'auto', display: 'block' }} /> : null}</div>
                <button type="button" className="hero-bell" aria-label="Alerts and notifications" onClick={openNotif}>
                  <SVG html={BELL} />
                  {unread > 0 && <div className="notif-dot">{unread > 9 ? '9+' : unread}</div>}
                </button>
              </div>
              <div className="hero-bottom">
                <div className="hero-welcome">Welcome to</div>
                <h1 className="hero-title">{hubName}</h1>
                {weather && (
                  <div className="hero-weather">
                    <span className="hero-weather-icon">{weather.emoji}</span>
                    <span className="hero-weather-temp">{weather.temp}°F</span>
                    <span className="hero-weather-cond">| {weather.label}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="dash-body">
            <div className="dash-section">
              <div className="section-header">
                <span className="section-title">Alerts &amp; Notifications</span>
                <span className="section-link" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={openNotif} onKeyDown={(e) => e.key === 'Enter' && openNotif()}>View all</span>
              </div>
              {announcements.length === 0 ? (
                <div className="alert-card" style={{ justifyContent: 'center', color: '#9ca3af', fontSize: 13, boxShadow: 'none', background: '#f9fafb', cursor: 'default' }}>No announcements for today</div>
              ) : announcements.slice(0, 3).map((a) => (
                <div key={a.id} className="alert-card" role="button" tabIndex={0} onClick={openNotif} onKeyDown={(e) => e.key === 'Enter' && openNotif()}>
                  <AnnIcon type={a.type} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="alert-title">{a.title}</div>
                    <div className="alert-sub" style={{ WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.message}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>{timeAgo(a.at, now)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="dash-section">
              <div className="section-title" style={{ marginBottom: 10 }}>Quick Actions</div>
              <div className="quick-actions">
                {st.quickActions.map((id, i) => {
                  const act = itemAction(id)
                  const icon = QA_ICONS[id] ?? MORE_ITEMS[id]?.icon ?? ''
                  const label = QA_LABEL[id] ?? VIS_ITEMS.find((o) => o.id === id)?.label ?? id
                  const inner = (<><div className={`qa-icon ${QA_CLASS[id] ?? 'ic-call'}`}><SVG html={icon} /></div><span className="qa-label">{label}</span></>)
                  return act.href ? <a key={`${id}${i}`} className="qa-btn" href={external(act.href)} target="_blank" rel="noopener noreferrer">{inner}</a> : <button key={`${id}${i}`} type="button" className="qa-btn" onClick={act.run}>{inner}</button>
                })}
              </div>
            </div>
            {guideUrl && (
              <div className="dash-section">
                <div className="discover-banner" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => setTab('guide')} onKeyDown={(e) => e.key === 'Enter' && setTab('guide')}>
                  <div className="discover-sheen" />
                  <div className="discover-text">
                    <div className="discover-title" style={{ fontSize: 17 }}>Discover <em>More</em><br />Near <strong style={{ fontWeight: 900 }}>You</strong></div>
                    <div className="discover-sub">Find the best local spots, hidden gems, and everyday essentials—<strong>all in one place.</strong></div>
                    <div className="discover-cta"><SVG html={DISCOVER_PIN} />Explore the Local Area Guide &rsaquo;</div>
                  </div>
                </div>
              </div>
            )}
            <div className="dash-section">
              <div className="section-header">
                <span className="section-title">Today&apos;s Events</span>
                <span className="section-link" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => setTab('events')} onKeyDown={(e) => e.key === 'Enter' && setTab('events')}>View all</span>
              </div>
              {eventsOnDate(events, today).length === 0 ? (
                <div className="event-card" style={{ justifyContent: 'center', color: '#9ca3af', fontSize: 13, boxShadow: 'none', background: '#f9fafb', cursor: 'default' }}>No events for today</div>
              ) : eventsOnDate(events, today).slice(0, 3).map((e) => (
                <div key={e.id} className="event-card" role="button" tabIndex={0} onClick={() => setOverlay({ kind: 'event', id: e.id })} onKeyDown={(k) => k.key === 'Enter' && setOverlay({ kind: 'event', id: e.id })}>
                  <Thumb url={e.imageUrl} className="event-img" />
                  <div className="event-info">
                    <div className="event-title">{e.title}</div>
                    {e.hours && <div className="event-time">{e.hours}</div>}
                    {e.location ? <div className="event-loc" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{e.location}</div> : e.description ? <div className="event-loc">{e.description.slice(0, 80)}</div> : null}
                  </div>
                  <div className="event-arrow">›</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`tab-panel${tab === 'map' ? ' active' : ''}`} id="tab-map">
          <div id="mapContainer" style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: 'var(--bg)', position: 'relative', padding: '0 0 calc(var(--nav-h) + var(--safe-bottom))' }}>
            <MapPanel st={st} active={tab === 'map'} />
          </div>
        </div>

        <div className={`tab-panel${tab === 'events' ? ' active' : ''}`} id="tab-activities">
          <div className="act-hero" id="actHero">
            <div className="act-hero-bg" id="actHeroBg" style={bg(st.heroImages.events)} />
            <div className="act-hero-content"><h2>Events</h2></div>
          </div>
          <div className="act-dash-body">
            <div className="date-picker" id="actDatePicker" ref={strip}>
              {dateStrip(today).map((d) => (
                <div key={d.iso} className={`date-tab${d.iso === day ? ' active' : ''}${d.today ? ' today' : ''}`} role="button" tabIndex={0} onClick={() => setDay(d.iso)} onKeyDown={(e) => e.key === 'Enter' && setDay(d.iso)}>
                  <span className="day-name">{d.day}</span>
                  <span className="day-num">{d.num}</span>
                  {d.today && <span className="today-dot" />}
                </div>
              ))}
            </div>
            <EventsDay events={events} day={day} today={today} onOpen={(id) => setOverlay({ kind: 'event', id })} />
          </div>
        </div>

        <div className={`tab-panel${tab === 'guide' ? ' active' : ''}`} id="tab-guide">
          {guideUrl ? (tab === 'guide' && <iframe id="guideFrame" title="Local guide" src={guideUrl} style={{ flex: 1, width: '100%', border: 'none', display: 'block', minHeight: 0 }} allow="geolocation" loading="lazy" referrerPolicy="no-referrer" />) : <div className="notif-empty">The local guide has not been set up for this hub yet.</div>}
        </div>

        <div className={`tab-panel${tab === 'more' ? ' active' : ''}`} id="tab-more">
          <div className="more-hero" id="moreHero"><div className="more-hero-bg" id="moreHeroBg" style={bg(st.heroImages.more)} /></div>
          <div className="more-dash-body">
            <div className="more-body" id="moreBody">
              <MoreMenu st={st} itemAction={itemAction} external={external} onPreviewLink={previewLink} pages={pages} showEmptyPages={!!preview} />
            </div>
          </div>
        </div>
      </div>

      <ContactPage st={st} active={overlay?.kind === 'contact'} onClose={() => setOverlay(null)} />
      {overlay?.kind === 'page' && page && overlay.id !== 'reservations' && <PagePanel page={page} fallback={st.menuItems.find((m) => m.id === overlay.id)?.label ?? st.moreLabels?.[overlay.id] ?? VIS_ITEMS.find((i) => i.id === overlay.id)?.label ?? ''} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'page' && page && overlay.id === 'reservations' && <ReserveSheet page={page} external={external} onClose={() => setOverlay(null)} />}
      {sheetItem && <LinkSheet item={sheetItem} external={external} onClose={() => setOverlay(null)} canOpen={(id) => !!pages[id] || !!preview} onOpenPage={(id) => setOverlay({ kind: 'page', id })} />}
      {overlay?.kind === 'wifi' && <WifiModal st={st} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'notif' && <NotifSheet anns={announcements} read={read} now={now} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'event' && <EventModal event={events.find((e) => e.id === overlay.id)} onClose={() => setOverlay(null)} />}

      <nav className="bottom-nav" aria-label="Hub tabs">
        {tabs.map((t) => (
          <button key={t} type="button" className={`nav-item${t === tab ? ' active' : ''}${t === 'events' ? ' purple' : ''}`} aria-current={t === tab ? 'page' : undefined} onClick={() => { setTab(t); setOverlay(null) }}>
            <div className="nav-ico-wrap"><SVG html={NAV_ICONS[t]} /></div><span>{NAV_LABEL[t]}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

/* Small fixes so the page's own markup (links and buttons instead of divs) looks the same as the live hub. */
const EXTRA_CSS = `
a.qa-btn, a.more-item, a.contact-row, a.contact-main-call { text-decoration: none; color: inherit; }
button.qa-btn, button.hero-bell, button.nav-item { font: inherit; border: 0; }
button.qa-btn { background: #fff; }
button.hero-bell { background: rgba(255,255,255,.15); }
.hero-logo span { font-size: 18px; font-weight: 700; color: #fff; }
.hero-welcome, .hero-title { text-shadow: 0 1px 6px rgba(0,0,0,.35); }
.page-content { height: 100%; }
`

function loadRead(hubId: string, off: boolean): Set<string> {
  if (off) return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(`park_read_anns_${hubId}`) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function saveRead(hubId: string, ids: Set<string>, off: boolean) {
  if (off) return
  try {
    localStorage.setItem(`park_read_anns_${hubId}`, JSON.stringify([...ids].slice(-200)))
  } catch {
    /* private mode: the badge just comes back next time */
  }
}

function useWeather(lat: number | null, lon: number | null): { temp: number; label: string; emoji: string } | null {
  const [w, setW] = useState<{ temp: number; label: string; emoji: string } | null>(null)
  useEffect(() => {
    if (lat === null || lon === null) return setW(null)
    const ctl = new AbortController()
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { current?: { temperature_2m?: number; weather_code?: number } } | null) => {
        const c = d?.current
        if (c && typeof c.temperature_2m === 'number' && typeof c.weather_code === 'number') setW({ temp: Math.round(c.temperature_2m), ...wxCode(c.weather_code) })
      })
      .catch(() => {})
    return () => ctl.abort()
  }, [lat, lon])
  return w
}

function AnnIcon({ type, size }: { type: string; size: number }) {
  const c = ANN_CAT[type] ?? ANN_CAT.info
  const isz = Math.round(size * 0.55)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: Math.round(size * 0.28), background: c.bg, color: c.color, flexShrink: 0 }}>
      <SVG html={c.icon.replace('<svg ', `<svg width="${isz}" height="${isz}" `)} />
    </span>
  )
}

function Thumb({ url, className }: { url: string; className: string }) {
  return url ? <img className={className} src={url} alt="" loading="lazy" decoding="async" style={{ objectFit: 'cover', background: GRADIENT }} /> : <div className={className} style={{ background: GRADIENT }} />
}

function MapPanel({ st, active }: { st: HubSettings; active: boolean }) {
  const m = st.mapDisplay
  const src = https(m.embedUrl)
  if ((m.mode === 'embed' || m.mode === 'pathfinder') && src) return active ? <iframe id="mapFrame" title="Hub map" src={src} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} allow="geolocation; fullscreen" loading="lazy" referrerPolicy="no-referrer" /> : null
  if (m.mode === 'image' && https(m.imageUrl)) return <img src={m.imageUrl} alt="Hub map" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
  const { lat, lon } = st.location
  return (
    <div className="notif-empty">
      No map has been added for this hub yet.
      {lat !== null && lon !== null && <><br /><a href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontWeight: 600 }}>Get directions</a></>}
    </div>
  )
}

function EventsDay({ events, day, today, onOpen }: { events: HubEvent[]; day: string; today: string; onOpen: (id: string) => void }) {
  const list = eventsOnDate(events, day)
  const up = upcomingEvents(events, day)
  const title = day === today ? "Today's Events" : new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const card = (e: HubEvent, when: string | null) => (
    <div key={`${e.id}-${when ?? 'x'}`} className="act-card" role="button" tabIndex={0} onClick={() => onOpen(e.id)} onKeyDown={(k) => k.key === 'Enter' && onOpen(e.id)}>
      <Thumb url={e.imageUrl} className="act-img" />
      <div className="act-info">
        <div className="act-title">{e.title}</div>
        {(when || e.hours) && <div className="act-time">{when && e.hours ? `${when} · ${e.hours}` : when || e.hours}</div>}
        {e.location ? <div className="act-loc">{e.location}</div> : e.description ? <div className="act-loc">{e.description}</div> : null}
      </div>
      <div className="act-arrow">›</div>
    </div>
  )
  return (
    <div id="todayActivitiesList">
      <div className="act-section-title">{title}</div>
      {list.length ? list.map((e) => card(e, day === today ? null : new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))) : (
        <div style={{ textAlign: 'center', padding: '28px 20px', color: '#9ca3af' }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>📅</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>No events</div>
          <div style={{ fontSize: 12 }}>Nothing scheduled for this day</div>
        </div>
      )}
      <div className="act-section-title" style={{ marginTop: 18 }}>Upcoming Events</div>
      {up.length ? up.map((g) => card(g.event, dateRangeLabel(g.dates))) : <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 13 }}>No upcoming events</div>}
    </div>
  )
}

function MoreMenu({ st, itemAction, external, onPreviewLink, pages, showEmptyPages }: { st: HubSettings; itemAction: (id: string) => { run?: () => void; href?: string }; external: (h: string) => string | undefined; onPreviewLink?: (h: string) => void; pages: Record<string, Page>; showEmptyPages: boolean }) {
  const groups = menuGroups(st)
  const custom = new Map(st.menuItems.map((m) => [m.id, m]))
  /** A custom item: its own name and icon, whatever it opens. */
  const customRow = (m: MenuItem) => {
    const ic = menuIcon(m.icon)
    const act = itemAction(m.id)
    const inner = (
      <>
        <div className="more-item-icon" style={{ background: ic.bg }}><SVG html={`<svg viewBox="0 0 24 24" fill="none" stroke="${ic.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ic.svg}</svg>`} /></div>
        <div className="more-item-text"><div className="more-item-title">{m.label}</div></div>
        <div className="more-item-arrow">›</div>
      </>
    )
    return act.href ? <a key={m.id} className="more-item" href={external(act.href)} target="_blank" rel="noopener noreferrer" onClick={() => onPreviewLink?.(act.href!)}>{inner}</a> : <div key={m.id} className="more-item" role="button" tabIndex={0} onClick={act.run} onKeyDown={(e) => e.key === 'Enter' && act.run?.()}>{inner}</div>
  }
  const row = (id: string) => {
    const c = custom.get(id)
    // Guests never see a details page nobody has filled in yet; the admin preview does, so the layout can be checked.
    if (c) return c.kind === 'page' && !pages[id] && !showEmptyPages ? null : customRow(c)
    const d = MORE_ITEMS[id]
    if (!d) return null
    const act = itemAction(id)
    const inner = (
      <>
        <div className="more-item-icon"><SVG html={d.icon} /></div>
        <div className="more-item-text"><div className="more-item-title">{st.moreLabels?.[id] || (pages[id] ? pages[id].title || d.title : d.title)}</div></div>
        <div className="more-item-arrow">›</div>
      </>
    )
    return act.href ? <a key={id} className="more-item" href={external(act.href)} target="_blank" rel="noopener noreferrer" onClick={() => onPreviewLink?.(act.href!)}>{inner}</a> : <div key={id} className="more-item" role="button" tabIndex={0} onClick={act.run} onKeyDown={(e) => e.key === 'Enter' && act.run?.()}>{inner}</div>
  }
  const visible = (ids: string[]) => ids.filter((id) => custom.has(id) || (MORE_ITEMS[id] && st.visibility[id] !== false))
  if (!groups.length) return <div className="more-section">{visible(DEFAULT_MORE_ORDER).map(row)}</div>
  return (
    <>
      {groups.map((g) => {
        const theme = ICON_THEMES[g.id] ?? ICON_THEMES[st.groups.find((x) => x.id === g.id)?.icon ?? '']
        return (
          <div key={g.id} className="more-section">
            {theme ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderBottom: `2px solid ${theme.color}`, paddingBottom: 6, marginBottom: 10 }}>
                <span style={{ width: 15, height: 15, display: 'inline-flex', color: theme.color }}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: theme.svg }} /></span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: theme.color }}>{g.label}</span>
              </div>
            ) : <div className="more-section-label">{g.label}</div>}
            {visible(g.items.map((i) => i.id)).map(row)}
          </div>
        )
      })}
    </>
  )
}

function ContactPage({ st, active, onClose }: { st: HubSettings; active: boolean; onClose: () => void }) {
  const c = st.contacts
  const phone = telLink(c.phone)
  const tone = ['#e8f5e9', '#fdf4ff', '#eff6ff', '#fff7ed']
  const stroke = ['#16a34a', '#9333ea', '#2563eb', '#f97316']
  const rowIcon = (i: number) => <div className="contact-row-icon" style={{ background: tone[i % 4] }}><svg viewBox="0 0 24 24" fill="none" stroke={stroke[i % 4]} strokeWidth="2" strokeLinecap="round"><path d={PHONE_PATH} /></svg></div>
  const rows: ReactNode[] = []
  c.extra.forEach((x, i) => {
    const href = x.kind === 'phone' ? telLink(x.value) : x.kind === 'email' ? (/^[^\s@<>"]+@[^\s@<>"]+$/.test(x.value) ? `mailto:${x.value}` : '') : https(x.value)
    const inner = (<>{rowIcon(i)}<div className="contact-row-text"><div className="contact-row-label">{x.label || (x.kind === 'phone' ? 'Call' : x.value)}</div><div className="contact-row-value">{x.value}</div></div><div className="contact-row-arrow">›</div></>)
    rows.push(href ? <a key={`x${i}`} className="contact-row" href={href} {...(x.kind === 'link' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{inner}</a> : <div key={`x${i}`} className="contact-row">{inner}</div>)
  })
  if (/^[^\s@<>"]+@[^\s@<>"]+$/.test(c.email)) rows.push(<a key="mail" className="contact-row" href={`mailto:${c.email}`}><div className="contact-row-icon" style={{ background: '#eff6ff' }}><svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg></div><div className="contact-row-text"><div className="contact-row-label">Email</div><div className="contact-row-value">{c.email}</div></div><div className="contact-row-arrow">›</div></a>)
  if (https(c.website)) rows.push(<a key="web" className="contact-row" href={c.website} target="_blank" rel="noopener noreferrer"><div className="contact-row-icon" style={{ background: '#fff7ed' }}><svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /></svg></div><div className="contact-row-text"><div className="contact-row-label">Website</div><div className="contact-row-value">{c.website.replace(/^https:\/\//i, '')}</div></div><div className="contact-row-arrow">›</div></a>)
  const empty = !c.phone && rows.length === 0 && !c.address
  return (
    <div id="tab-contact" className={active ? 'active' : ''} role="dialog" aria-label="Guest services" aria-hidden={!active}>
      <div className="contact-header">
        <div className="contact-back" role="button" tabIndex={0} onClick={onClose} onKeyDown={(e) => e.key === 'Enter' && onClose()}><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>Back</div>
        <h2>Guest Services</h2>
        <p>We&apos;re here to help — reach us anytime</p>
      </div>
      <div className="contact-body">
        {empty && <p className="notif-empty">Contact details have not been added yet.</p>}
        {c.phone && (
          <div className="contact-section">
            <div className="contact-section-label">Main Line</div>
            <a className="contact-main-call" href={phone || undefined}>
              <div className="contact-main-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d={PHONE_PATH} /></svg></div>
              <div className="contact-main-text"><div className="contact-main-label">{c.name || 'Guest Services'}</div><div className="contact-main-number">{c.phone}</div></div>
              <div className="contact-row-arrow">›</div>
            </a>
          </div>
        )}
        {rows.length > 0 && <div className="contact-section"><div className="contact-section-label">{c.phone ? 'Other Numbers' : 'Contact'}</div>{rows}</div>}
        {c.address && <div className="contact-section"><div className="contact-section-label">Mailing Address</div><div className="contact-address" style={{ whiteSpace: 'pre-line' }}>{c.address}</div></div>}
      </div>
    </div>
  )
}

const Lines = ({ text }: { text: string }) => (
  <>
    {formatText(text).map((line, i) => (
      <span key={i}>{i > 0 && <br />}{line.map((p, j) => (p.bold ? <strong key={j}>{p.text}</strong> : <span key={j}>{p.text}</span>))}</span>
    ))}
  </>
)
const blockTitle = (b: Block) => (b.type === 'card' ? (b.meta ? `${b.title} · ${b.meta}` : b.title) : b.type === 'contact' ? b.label : b.type === 'rule' ? b.title : '')

/** A published page in the same layout the live Rules page uses: header, then white sections of titled rows. */
function PagePanel({ page, fallback, onClose }: { page: Page; fallback: string; onClose: () => void }) {
  const sections: { label: string; alert: boolean; rows: Block[] }[] = []
  for (const b of page.blocks) {
    if (b.type === 'section') sections.push({ label: b.title, alert: b.tone === 'alert', rows: [] })
    else {
      if (!sections.length) sections.push({ label: '', alert: false, rows: [] })
      sections[sections.length - 1].rows.push(b)
    }
  }
  return (
    <div id="tab-rules" className="active" role="dialog" aria-label={page.title || fallback}>
      <div className="contact-header">
        <div className="contact-back" role="button" tabIndex={0} onClick={onClose} onKeyDown={(e) => e.key === 'Enter' && onClose()}><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>Back</div>
        <h2>{page.title || fallback}</h2>
        {page.subtitle && <p>{page.subtitle}</p>}
      </div>
      <div className="contact-body">
        {page.banner && <img src={page.banner} alt="" loading="lazy" style={{ display: 'block', width: '100%', borderRadius: 14, marginBottom: 8 }} />}
        {sections.map((s, i) => (
          <div key={i} className="rules-section" style={s.alert ? { borderLeft: '4px solid #ef4444' } : undefined}>
            {s.label && <div className="rules-section-label" style={s.alert ? { color: '#ef4444' } : undefined}>{s.label}</div>}
            {s.rows.map((b, j) => (
              <div key={b.id} className="rules-rule" style={j === 0 ? { borderTop: 'none' } : undefined}>
                {b.type === 'image' ? (
                  <><img src={b.url} alt={b.caption} loading="lazy" style={{ display: 'block', width: '100%', borderRadius: 10 }} />{b.caption && <div className="rules-rule-body">{b.caption}</div>}</>
                ) : (
                  <>
                    {blockTitle(b) && <div className="rules-rule-title">{blockTitle(b)}</div>}
                    <div className="rules-rule-body">
                      {b.type === 'contact' ? <a href={b.kind === 'phone' ? telLink(b.value) : b.kind === 'email' ? `mailto:${b.value}` : b.value} {...(b.kind === 'link' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{b.kind === 'link' ? b.value.replace(/^https:\/\//i, '') : b.value}</a> : <Lines text={b.type === 'rule' ? b.body : b.type === 'card' ? b.text : ''} />}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The Reservations page as the live hubs show it: the "Choose Your Stay" sheet. */
function ReserveSheet({ page, external, onClose }: { page: Page; external: (h: string) => string | undefined; onClose: () => void }) {
  return (
    <div className="notif-overlay open" role="dialog" aria-modal="true" aria-label={page.title || 'Reservations'} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="notif-sheet">
        <div className="notif-sheet-header"><div className="notif-sheet-title">{page.title || 'Choose Your Stay'}</div><button type="button" className="notif-close-btn" aria-label="Close" onClick={onClose}>✕</button></div>
        <div style={{ padding: '8px 0 4px' }}>
          {page.blocks.map((b) => {
            if (b.type === 'section') return <div key={b.id} style={{ padding: '12px 20px 4px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: b.tone === 'alert' ? '#ef4444' : '#6b7280' }}>{b.title}</div>
            if (b.type === 'image') return null
            const title = blockTitle(b)
            const sub = b.type === 'contact' ? (b.kind === 'link' ? b.value.replace(/^https:\/\//i, '') : b.value) : b.type === 'rule' ? b.body : b.type === 'card' ? b.text : ''
            const href = b.type === 'contact' ? (b.kind === 'phone' ? telLink(b.value) : b.kind === 'email' ? `mailto:${b.value}` : b.value) : ''
            const inner = (
              <>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#2563eb', fontSize: 20 }}>{b.type === 'contact' ? (b.kind === 'phone' ? '☎' : b.kind === 'email' ? '✉' : '⌂') : '•'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {title && <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{title}</div>}
                  {sub && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}><Lines text={sub} /></div>}
                </div>
                {href && <div style={{ color: '#9ca3af', fontSize: 20 }}>›</div>}
              </>
            )
            const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid #f3f4f6', textDecoration: 'none', color: 'inherit' }
            return href ? <a key={b.id} href={b.type === 'contact' && b.kind === 'link' ? external(href) : href} {...(b.type === 'contact' && b.kind === 'link' ? { target: '_blank', rel: 'noopener noreferrer' } : {})} style={rowStyle}>{inner}</a> : <div key={b.id} style={rowStyle}>{inner}</div>
          })}
        </div>
      </div>
    </div>
  )
}

function WifiModal({ st, onClose }: { st: HubSettings; onClose: () => void }) {
  const [copied, setCopied] = useState('')
  const copy = (key: string, text: string) => {
    try {
      void navigator.clipboard?.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* copying is optional */
    }
  }
  const { ssid, password } = st.wifi
  return (
    <div className="wifi-modal-ov active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wifi-modal" role="dialog" aria-modal="true" aria-label="WiFi">
        <div className="wifi-modal-pill" />
        <div className="wifi-modal-header">
          <div className="wifi-modal-icon"><svg viewBox="0 0 24 24"><path d="M1.5 8.5a15 15 0 0121 0M5 12a11 11 0 0114 0M8.5 15.5a6 6 0 017 0M12 19h.01" /></svg></div>
          <div className="wifi-modal-title">WiFi</div>
          <div className="wifi-modal-sub">{ssid ? 'Connect to the guest network' : 'WiFi details have not been added yet.'}</div>
        </div>
        {ssid && (
          <div className="wifi-modal-body">
            <div className="wifi-field"><div className="wifi-field-left"><div className="wifi-field-label">Network Name</div><div className="wifi-field-value">{ssid}</div></div><button type="button" className="wifi-copy-btn" onClick={() => copy('s', ssid)}>{copied === 's' ? 'Copied' : 'Copy'}</button></div>
            {password && <div className="wifi-field"><div className="wifi-field-left"><div className="wifi-field-label">Password</div><div className="wifi-field-value">{password}</div></div><button type="button" className="wifi-copy-btn" onClick={() => copy('p', password)}>{copied === 'p' ? 'Copied' : 'Copy'}</button></div>}
          </div>
        )}
        <button type="button" className="wifi-close-btn" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

function NotifSheet({ anns, read, now, onClose }: { anns: GuestAnnouncement[]; read: Set<string>; now: number; onClose: () => void }) {
  return (
    <div className="notif-overlay open" role="dialog" aria-modal="true" aria-label="Alerts and notifications" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="notif-sheet">
        <div className="notif-sheet-header"><div className="notif-sheet-title">Alerts &amp; Notifications</div><button type="button" className="notif-close-btn" aria-label="Close" onClick={onClose}>✕</button></div>
        {anns.length === 0 ? <div className="notif-empty">No announcements for today.</div> : anns.map((a) => (
          <div key={a.id} className="notif-item" style={read.has(a.id) ? { opacity: 0.6 } : undefined}>
            <AnnIcon type={a.type} size={30} />
            <div className="notif-item-body">
              <div className="notif-item-title">{a.title}</div>
              <div className="notif-item-msg">{a.message}</div>
              <div className="notif-item-time">{timeAgo(a.at, now)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EventModal({ event, onClose }: { event: HubEvent | undefined; onClose: () => void }) {
  if (!event) return null
  return (
    <div className="act-modal-ov active" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="act-modal" role="dialog" aria-modal="true" aria-label={event.title}>
        <div className="act-modal-hero" style={event.imageUrl ? { backgroundImage: `url("${event.imageUrl.replace(/["\\\n\r]/g, encodeURIComponent)}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: GRADIENT }}>
          <button type="button" className="act-modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="act-modal-body">
          <div className="act-modal-title">{event.title}</div>
          {event.hours && <div className="act-modal-row"><SVG html={CLOCK} /><span>{event.hours}</span></div>}
          {event.location && <div className="act-modal-row"><SVG html={PIN} /><span>{event.location}</span></div>}
          {event.description && <div className="act-modal-desc" style={{ display: 'block' }}><div>{event.description}</div></div>}
        </div>
      </div>
    </div>
  )
}

/** An items sheet: a short list of links, drawn like the other bottom sheets. */
function LinkSheet({ item, external, onClose, canOpen, onOpenPage }: { item: MenuItem; external: (h: string) => string | undefined; onClose: () => void; canOpen: (pageId: string) => boolean; onOpenPage: (pageId: string) => void }) {
  const ic = menuIcon(item.icon)
  return (
    <div className="notif-overlay open" role="dialog" aria-modal="true" aria-label={item.label} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="notif-sheet">
        <div className="notif-sheet-header"><div className="notif-sheet-title">{item.label}</div><button type="button" className="notif-close-btn" aria-label="Close" onClick={onClose}>{'\u2715'}</button></div>
        <div style={{ padding: '8px 0 4px' }}>
          {item.rows.filter((r) => !r.page || canOpen(r.page)).map((r, i) => {
            const page = r.page
            const Row = page ? 'div' : 'a'
            const props = page ? { role: 'button', tabIndex: 0, onClick: () => onOpenPage(page), onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && onOpenPage(page) } : { href: external(r.url), target: '_blank', rel: 'noopener noreferrer' }
            return (
            <Row key={i} {...props} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid #f3f4f6', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: ic.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SVG html={`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="${ic.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ic.svg}</svg>`} /></div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>{r.label}</div>
              <div style={{ color: '#9ca3af', fontSize: 20 }}>{'\u203a'}</div>
            </Row>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Admin preview only: a page nobody has filled in yet shows its layout with made-up content, or stays empty when it has none. */
function previewPage(item: MenuItem | undefined): Page {
  if (item?.template) {
    try {
      return samplePage(item.template, item.label)
    } catch {
      /* fall through to an empty page */
    }
  }
  return { title: '', subtitle: '', banner: '', blocks: [] }
}
