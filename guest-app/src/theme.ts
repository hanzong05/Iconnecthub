import type { Palette } from '@/lib/settings-catalog'

const SAFE = /^#[0-9a-f]{6}$/i
const c = (v: string, fb: string) => (SAFE.test(v) ? v : fb)

/** The hub's colours applied the way the live hubs apply them: one stylesheet of overrides built from the saved palette. */
export function themeCss(pal: Palette): string {
  const p = { primary: c(pal.primary, '#1a56db'), dark: c(pal.dark, '#122fa0'), tab: c(pal.tab, '#4a4fe0'), bg: c(pal.bg, '#e8e5ef'), secondary: c(pal.secondary, '#7b85a0'), textPrimary: c(pal.textPrimary, '#1a56db') }
  return `
#app { background: ${p.bg}; --bg: ${p.bg}; --blue: ${p.primary}; }
.date-tab.active { background: linear-gradient(135deg,${p.primary},${p.dark}) !important; box-shadow: 0 4px 14px ${p.primary}59 !important; }
.date-tab.today:not(.active) .day-name, .date-tab.today:not(.active) .day-num { color: ${p.tab} !important; }
.date-tab .today-dot { background: ${p.tab} !important; }
.date-tab.active .today-dot { background: rgba(255,255,255,.7) !important; }
.nav-item.active.purple .nav-ico-wrap { background: ${p.tab}1a !important; }
.nav-item.active.purple svg { stroke: ${p.tab} !important; }
.nav-item.active.purple span { color: ${p.tab} !important; }
.nav-item.active:not(.purple) .nav-ico-wrap { background: ${p.primary}1a !important; }
.nav-item.active:not(.purple) svg { stroke: ${p.primary} !important; }
.nav-item.active:not(.purple) span { color: ${p.primary} !important; }
.contact-header, .contact-main-icon, .wifi-modal-icon { background: linear-gradient(135deg,${p.primary},${p.dark}) !important; }
.wifi-close-btn, .wifi-copy-btn { background: ${p.primary} !important; color: #fff !important; }
.section-link, .contact-main-number, .section-title, .qa-label, .alert-title, .more-item-title, .notif-item-title, .event-title, .act-title, .act-section-title, .act-modal-title { color: ${p.textPrimary} !important; }
.notif-item-read-more { color: ${p.primary} !important; }
.contact-address, .contact-address strong, .contact-row-label, .contact-main-label, .more-section-label, .wifi-field-label { color: ${p.secondary} !important; }
.qa-icon { background: none !important; }
.qa-icon.ic-map svg, .qa-icon.ic-call svg, .qa-icon.ic-wifi svg { stroke: ${p.primary} !important; }
.qa-icon.ic-act svg { stroke: ${p.tab} !important; }
.alert-icon { background: ${p.primary}18 !important; color: ${p.primary} !important; }
.more-item-sub { color: ${p.secondary} !important; }
.more-item-icon { background: none !important; }
.more-item-icon svg { stroke: ${p.primary} !important; }
.more-item-arrow { color: ${p.secondary} !important; }
.act-loc, .event-loc, .act-time, .event-time, .act-modal-row span { color: ${p.secondary} !important; }
.act-modal-close { background: ${p.primary} !important; color: #fff !important; }
.discover-banner { background: linear-gradient(135deg,${p.dark} 0%,${p.primary} 55%,${p.dark} 100%) !important; }
.discover-title em { color: rgba(255,255,255,.88) !important; -webkit-text-fill-color: rgba(255,255,255,.88) !important; }
.event-card, .act-card, .alert-card { border-left: 3px solid ${p.primary} !important; }
.more-item-icon svg, .qa-icon svg { fill: none; }
`
}
