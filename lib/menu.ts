/**
 * Custom More-menu items. The Super Admin creates them (name, icon, group, what happens on tap); managers fill in the content.
 * Pure: no database, no React. Shared by the admin (Settings, Pages), the guest app and the tests.
 *
 * Stored per hub at hubs/{hubId}/settings/menuItems (an array). Items live in the menu groups by id, like the built-in items.
 * Three kinds: "link" opens an address, "page" opens a details page managers fill in (Pages), "sheet" opens a list of links.
 * Text and addresses are length-limited and checked again before publishing; addresses must be https.
 */
import { SettingsInvalid, httpsUrl } from './settings-validate'
import { parseTemplate, readTemplate, type Template } from './template'

export const MENU_KINDS = [
  { id: 'link', label: 'Direct link', hint: 'Opens a web address.' },
  { id: 'page', label: 'Details page', hint: 'Opens a page that managers fill in (Pages).' },
  { id: 'sheet', label: 'Items sheet', hint: 'Opens a short list of links.' },
] as const
export type MenuKind = (typeof MENU_KINDS)[number]['id']
const KIND_IDS: string[] = MENU_KINDS.map((k) => k.id)

/** Icons the Super Admin can pick. Static, trusted markup: only the shape of the drawing, drawn with currentColor. */
export const MENU_ICONS = [
  { id: 'info', label: 'Info', color: '#2563eb', bg: '#eff6ff', svg: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>' },
  { id: 'home', label: 'Home', color: '#16a34a', bg: '#e8f5e9', svg: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
  { id: 'bed', label: 'Stay', color: '#7c3aed', bg: '#f5f3ff', svg: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>' },
  { id: 'tag', label: 'Offers', color: '#ea580c', bg: '#fff7ed', svg: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>' },
  { id: 'ticket', label: 'Tickets', color: '#db2777', bg: '#fdf2f8', svg: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><line x1="13" y1="5" x2="13" y2="19"/>' },
  { id: 'pin', label: 'Place', color: '#dc2626', bg: '#fef2f2', svg: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>' },
  { id: 'book', label: 'Guide', color: '#0891b2', bg: '#e0f7fa', svg: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
  { id: 'star', label: 'Star', color: '#ca8a04', bg: '#fefce8', svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
  { id: 'food', label: 'Food', color: '#f97316', bg: '#fff7ed', svg: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>' },
  { id: 'bag', label: 'Shop', color: '#4f46e5', bg: '#eef2ff', svg: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>' },
  { id: 'calendar', label: 'Calendar', color: '#2563eb', bg: '#eff6ff', svg: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
  { id: 'boat', label: 'Boat', color: '#0284c7', bg: '#e0f2fe', svg: '<path d="M2 20a2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1"/><path d="M4 18l-1-5h18l-2 5"/><path d="M12 13V2l5 6"/>' },
  { id: 'heart', label: 'Heart', color: '#e11d48', bg: '#fff1f2', svg: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>' },
  { id: 'link', label: 'Link', color: '#475569', bg: '#f1f5f9', svg: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' },
] as const
export const MENU_ICON_IDS: string[] = MENU_ICONS.map((i) => i.id)
export const menuIcon = (id: string) => MENU_ICONS.find((i) => i.id === id) ?? MENU_ICONS[0]

export const MENU_LIMITS = { items: 30, rows: 20, label: 60, rowLabel: 80 } as const

export interface MenuRow {
  label: string
  /** An https address, or empty when the row opens a details page instead. */
  url: string
  /** The id of a details page (a menu item of kind page) this row opens; empty when the row opens an address. */
  page?: string
}
export interface MenuItem {
  id: string
  label: string
  icon: string
  kind: MenuKind
  /** The address for a direct link; empty for the other kinds. */
  url: string
  /** The rows of an items sheet; empty for the other kinds. */
  rows: MenuRow[]
  shown: boolean
  /** Details pages only: the layout the Super Admin set. Without one, the page is the plain block editor. */
  template?: Template | null
}

/** Custom items always start with "c_", so they can never clash with a built-in item id. */
export const MENU_ID = /^c_[a-z0-9]{3,24}$/
export const isMenuId = (v: unknown): v is string => typeof v === 'string' && MENU_ID.test(v)
export const newMenuId = () => `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 26)

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as object) : [])
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '')
const httpsOrEmpty = (v: unknown) => (typeof v === 'string' && /^https:\/\//i.test(v.trim()) && v.trim().length <= 500 ? v.trim() : '')

/** Reads what is stored, forgiving: anything unusable is dropped so guests never see a broken item. */
export function readMenuItems(raw: unknown): MenuItem[] {
  const out: MenuItem[] = []
  const seen = new Set<string>()
  for (const x of list(raw)) {
    const o = obj(x)
    const id = typeof o.id === 'string' ? o.id : ''
    const label = text(o.label, MENU_LIMITS.label)
    const kind = typeof o.kind === 'string' && KIND_IDS.includes(o.kind) ? (o.kind as MenuKind) : null
    if (!isMenuId(id) || seen.has(id) || !label || !kind) continue
    seen.add(id)
    const rows: MenuRow[] = []
    if (kind === 'sheet') {
      for (const r of list(o.rows)) {
        const ro = obj(r)
        const rl = text(ro.label, MENU_LIMITS.rowLabel)
        const ru = httpsOrEmpty(ro.url)
        const rp = isMenuId(ro.page) ? ro.page : ''
        if (rl && (ru || rp) && rows.length < MENU_LIMITS.rows) rows.push(rp && !ru ? { label: rl, url: '', page: rp } : { label: rl, url: ru })
      }
    }
    out.push({ id, label, icon: typeof o.icon === 'string' && MENU_ICON_IDS.includes(o.icon) ? o.icon : 'info', kind, url: kind === 'link' ? httpsOrEmpty(o.url) : '', rows, shown: o.shown !== false, ...(kind === 'page' && readTemplate(o.template) ? { template: readTemplate(o.template) } : {}) })
    if (out.length >= MENU_LIMITS.items) break
  }
  return out
}

/** Checks what the Super Admin sent. Throws SettingsInvalid with a plain message; returns the cleaned list. */
export function parseMenuItems(input: unknown): MenuItem[] {
  if (!Array.isArray(input)) throw new SettingsInvalid('The menu items must be a list.')
  if (input.length > MENU_LIMITS.items) throw new SettingsInvalid(`A hub can have ${MENU_LIMITS.items} custom menu items at most.`)
  const seen = new Set<string>()
  return input.map((x, n) => {
    const o = obj(x)
    const where = `Menu item ${n + 1}`
    const id = typeof o.id === 'string' ? o.id : ''
    if (!isMenuId(id)) throw new SettingsInvalid(`${where} has an invalid id.`)
    if (seen.has(id)) throw new SettingsInvalid(`${where} is listed twice.`)
    seen.add(id)
    const label = text(o.label, MENU_LIMITS.label)
    if (!label) throw new SettingsInvalid(`${where} needs a name.`)
    if (typeof o.label === 'string' && o.label.trim().length > MENU_LIMITS.label) throw new SettingsInvalid(`The name "${label}" is too long (${MENU_LIMITS.label} characters at most).`)
    const kind = typeof o.kind === 'string' && KIND_IDS.includes(o.kind) ? (o.kind as MenuKind) : null
    if (!kind) throw new SettingsInvalid(`${label}: choose what happens on tap.`)
    const icon = typeof o.icon === 'string' && MENU_ICON_IDS.includes(o.icon) ? o.icon : null
    if (!icon) throw new SettingsInvalid(`${label}: choose an icon.`)
    let url = ''
    const rows: MenuRow[] = []
    if (kind === 'link') {
      url = httpsUrl(o.url, `The address for ${label}`)
      if (!url) throw new SettingsInvalid(`${label} needs an address (https://…).`)
    }
    if (kind === 'sheet') {
      const rs = list(o.rows)
      if (rs.length > MENU_LIMITS.rows) throw new SettingsInvalid(`${label} can have ${MENU_LIMITS.rows} rows at most.`)
      for (const r of rs) {
        const ro = obj(r)
        const rl = text(ro.label, MENU_LIMITS.rowLabel)
        if (!rl) throw new SettingsInvalid(`Every row in ${label} needs a name.`)
        const rp = typeof ro.page === 'string' ? ro.page : ''
        if (rp) {
          // A row opens a details page of this hub, never both a page and an address.
          if (!isMenuId(rp) || !input.some((m) => obj(m).id === rp && obj(m).kind === 'page')) throw new SettingsInvalid(`"${rl}" opens a page that does not exist.`)
          rows.push({ label: rl, url: '', page: rp })
          continue
        }
        const ru = httpsUrl(ro.url, `The address for "${rl}"`)
        if (!ru) throw new SettingsInvalid(`"${rl}" needs an address (https://…) or a page to open.`)
        rows.push({ label: rl, url: ru })
      }
    }
    const template = kind === 'page' && o.template != null ? parseTemplate(o.template, label) : null
    return { id, label, icon, kind, url, rows, shown: o.shown !== false, ...(template ? { template } : {}) }
  })
}
