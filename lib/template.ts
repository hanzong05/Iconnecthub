/**
 * Page templates: the Super Admin sets the layout of a details page (which components, in what order, which are
 * required, how many rows), the manager only fills the slots in. Pure: no database, no React.
 *
 * A template is a list of slots. Filling it produces an ordinary Page (see lib/pages.ts), so the guest app, the admin
 * preview and every limit and https check stay in one place: values are never trusted, they go through validatePage.
 */
import { SettingsInvalid } from './settings-validate'
import { validatePage, PageInvalid, type Page } from './pages'

export const SLOT_TYPES = [
  { id: 'header', label: 'Title and subtitle', hint: 'The page title and a short line under it. One per page.' },
  { id: 'hero', label: 'Hero picture', hint: 'A large picture at the top. One per page.' },
  { id: 'section', label: 'Section heading', hint: 'A fixed heading. The manager does not fill this in.' },
  { id: 'description', label: 'Description', hint: 'A heading and some text.' },
  { id: 'gallery', label: 'Gallery', hint: 'A few pictures with captions.' },
  { id: 'list', label: 'List', hint: 'Rows the manager adds: rules, channels, contacts or items.' },
  { id: 'call', label: 'Main call card', hint: 'One big phone number, such as the front desk.' },
  { id: 'button', label: 'Button', hint: 'One button that opens a link.' },
] as const
export type SlotType = (typeof SLOT_TYPES)[number]['id']
const SLOT_IDS: string[] = SLOT_TYPES.map((s) => s.id)

export const ROW_KINDS = [
  { id: 'rule', label: 'Rule (title and text)' },
  { id: 'channel', label: 'Channel (name and detail)' },
  { id: 'contact', label: 'Contact (phone, link or email)' },
  { id: 'item', label: 'Item (title, text, price or hours)' },
] as const
export type RowKind = (typeof ROW_KINDS)[number]['id']
const ROW_KIND_IDS: string[] = ROW_KINDS.map((r) => r.id)

export const TEMPLATE_LIMITS = { slots: 20, label: 60, maxRows: 30 } as const

export interface Slot {
  id: string
  type: SlotType
  /** What the manager sees as the field name; for a section heading, the heading itself. */
  label: string
  required: boolean
  /** Lists and galleries only: how many rows the manager may add. */
  maxRows: number
  /** Lists only. */
  rowKind: RowKind
}
export interface Template {
  slots: Slot[]
}

export const SLOT_ID = /^s[a-z0-9]{2,10}$/
export const newSlotId = () => `s${Math.random().toString(36).slice(2, 8)}`
const ONE_ONLY: SlotType[] = ['header', 'hero']
const MANY: SlotType[] = ['list', 'gallery']

const slot = (id: string, type: SlotType, label: string, o: Partial<Slot> = {}): Slot => ({ id, type, label, required: false, maxRows: 10, rowKind: 'rule', ...o })

/** Ready-made layouts to start from. The Super Admin can change anything afterwards. */
export const STARTER_TEMPLATES: { id: string; label: string; hint: string; template: Template }[] = [
  { id: 'picture', label: 'Picture, description and button', hint: 'A hero picture, a few lines of text and one button.', template: { slots: [slot('shead', 'header', 'Title', { required: true }), slot('shero', 'hero', 'Hero picture'), slot('sdesc', 'description', 'About', { required: true }), slot('sbtn', 'button', 'Button')] } },
  { id: 'rules', label: 'Rules list', hint: 'A title and a list of rules.', template: { slots: [slot('shead', 'header', 'Title', { required: true }), slot('srules', 'list', 'Rules', { required: true, maxRows: 30, rowKind: 'rule' })] } },
  { id: 'contacts', label: 'Contact list', hint: 'A main number and a list of phone numbers, links and emails.', template: { slots: [slot('shead', 'header', 'Title', { required: true }), slot('scall', 'call', 'Main number'), slot('slist', 'list', 'Contacts', { required: true, maxRows: 20, rowKind: 'contact' })] } },
  { id: 'channels', label: 'Channel list', hint: 'A list of channels with a short detail each.', template: { slots: [slot('shead', 'header', 'Title', { required: true }), slot('slist', 'list', 'Channels', { required: true, maxRows: 30, rowKind: 'channel' })] } },
  { id: 'free', label: 'Free-form', hint: 'Start empty and add the components you need.', template: { slots: [slot('shead', 'header', 'Title', { required: true })] } },
]

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '')

/** Checks a template from the builder. Throws SettingsInvalid with a plain message. */
export function parseTemplate(input: unknown, itemLabel = 'This page'): Template {
  const o = obj(input)
  if (!Array.isArray(o.slots)) throw new SettingsInvalid(`${itemLabel} needs a layout.`)
  if (o.slots.length === 0) throw new SettingsInvalid(`${itemLabel} needs at least one component.`)
  if (o.slots.length > TEMPLATE_LIMITS.slots) throw new SettingsInvalid(`${itemLabel} can have ${TEMPLATE_LIMITS.slots} components at most.`)
  const seen = new Set<string>()
  const count: Record<string, number> = {}
  const slots = o.slots.map((x, n) => {
    const s = obj(x)
    const where = `${itemLabel}, component ${n + 1}`
    const id = typeof s.id === 'string' ? s.id : ''
    if (!SLOT_ID.test(id)) throw new SettingsInvalid(`${where} has an invalid id.`)
    if (seen.has(id)) throw new SettingsInvalid(`${where} is listed twice.`)
    seen.add(id)
    const type = typeof s.type === 'string' && SLOT_IDS.includes(s.type) ? (s.type as SlotType) : null
    if (!type) throw new SettingsInvalid(`${where} has an unknown type.`)
    count[type] = (count[type] ?? 0) + 1
    if (ONE_ONLY.includes(type) && count[type] > 1) throw new SettingsInvalid(`${itemLabel} can have only one "${SLOT_TYPES.find((t) => t.id === type)?.label}".`)
    const label = text(s.label, TEMPLATE_LIMITS.label)
    if (!label) throw new SettingsInvalid(`${where} needs a name.`)
    if (typeof s.label === 'string' && s.label.trim().length > TEMPLATE_LIMITS.label) throw new SettingsInvalid(`The name "${label}" is too long (${TEMPLATE_LIMITS.label} characters at most).`)
    let maxRows = 10
    if (MANY.includes(type)) {
      maxRows = Number(s.maxRows)
      if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > TEMPLATE_LIMITS.maxRows) throw new SettingsInvalid(`${label}: choose between 1 and ${TEMPLATE_LIMITS.maxRows} rows.`)
    }
    const rowKind: RowKind = type === 'list' ? (typeof s.rowKind === 'string' && ROW_KIND_IDS.includes(s.rowKind) ? (s.rowKind as RowKind) : 'rule') : 'rule'
    return { id, type, label, required: type === 'section' ? false : s.required === true, maxRows, rowKind }
  })
  return { slots }
}

/** Reads what is stored, forgiving: a template that no longer passes is treated as none. */
export function readTemplate(raw: unknown): Template | null {
  if (!raw) return null
  try {
    return parseTemplate(raw)
  } catch {
    return null
  }
}

/** What the manager typed for each slot, by slot id. Shapes depend on the slot (see fillToPage). */
export type SlotValues = Record<string, unknown>

const rows = (v: unknown, max: number): Record<string, unknown>[] => {
  const o = obj(v)
  // The database turns a list with gaps into an object keyed by position, so read both shapes.
  const raw = o.rows ?? o.items
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.keys(raw).sort((x, y) => Number(x) - Number(y)).map((k) => (raw as Record<string, unknown>)[k]) : []
  return list.slice(0, max).map(obj)
}
/** A contact row always carries a kind, so only its label and value say whether it was filled in. */
const hasContent = (kind: RowKind | 'gallery', r: Record<string, unknown>) => (kind === 'contact' ? !!(text(r.label, 10) || text(r.value, 10)) : filled(r))
const filled = (b: Record<string, unknown>) => Object.entries(b).some(([k, v]) => k !== 'type' && typeof v === 'string' && v.trim() !== '')

/** Which required slots the manager left empty, by name. Used to block publishing a half-filled page. */
export function missingRequired(t: Template, values: SlotValues): string[] {
  const out: string[] = []
  for (const s of t.slots) {
    if (!s.required) continue
    const v = obj(values[s.id])
    let ok = false
    if (s.type === 'header') ok = !!text(v.title, 200)
    else if (s.type === 'hero') ok = !!text(v.url, 600)
    else if (s.type === 'gallery' || s.type === 'list') ok = rows(v, s.maxRows).some((r) => hasContent(s.type === 'list' ? s.rowKind : 'gallery', r))
    else if (s.type === 'description') ok = !!(text(v.title, 400) || text(v.body, 3000))
    else if (s.type === 'call' || s.type === 'button') ok = !!text(v.value, 600)
    if (!ok) out.push(s.label)
  }
  return out
}

/**
 * Builds the page a guest sees from a layout and what the manager filled in. Empty optional slots are left out,
 * extra rows beyond the limit are dropped, and the result goes through validatePage, so every limit and https check applies.
 * Throws PageInvalid with a plain message when something typed is not acceptable.
 */
export function fillToPage(t: Template, values: SlotValues): Page {
  let title = ''
  let subtitle = ''
  let banner = ''
  const blocks: Record<string, unknown>[] = []
  for (const s of t.slots) {
    const v = obj(values[s.id])
    switch (s.type) {
      case 'header':
        title = text(v.title, 400)
        subtitle = text(v.subtitle, 400)
        break
      case 'hero':
        banner = text(v.url, 600)
        break
      case 'section':
        blocks.push({ type: 'section', title: s.label, tone: 'normal' })
        break
      case 'description':
        if (text(v.title, 400) || text(v.body, 3000)) blocks.push({ type: 'rule', title: v.title, body: v.body })
        break
      case 'gallery':
        for (const r of rows(v, s.maxRows)) if (filled(r)) blocks.push({ type: 'image', url: r.url, caption: r.caption })
        break
      case 'call':
        if (text(v.value, 600)) blocks.push({ type: 'contact', label: text(v.label, 200) || s.label, kind: 'phone', value: v.value })
        break
      case 'button':
        if (text(v.value, 600)) blocks.push({ type: 'contact', label: text(v.label, 200) || s.label, kind: 'link', value: v.value })
        break
      case 'list':
        for (const r of rows(v, s.maxRows)) {
          if (!hasContent(s.rowKind, r)) continue
          if (s.rowKind === 'contact') blocks.push({ type: 'contact', label: r.label, kind: r.kind, value: r.value })
          else if (s.rowKind === 'item') blocks.push({ type: 'card', title: r.title, text: r.text, meta: r.meta })
          else blocks.push({ type: 'rule', title: r.title, body: r.body })
        }
        break
    }
  }
  try {
    return validatePage({ title, subtitle, banner, blocks })
  } catch (e) {
    if (e instanceof PageInvalid) throw e
    throw new PageInvalid('That page is not valid.')
  }
}

/** A made-up page for the admin preview, so the Super Admin can see the layout before any manager fills it in. Never shown to guests. */
export function samplePage(t: Template, name: string): Page {
  const values: SlotValues = {}
  for (const s of t.slots) {
    const row = (n: number) =>
      s.rowKind === 'contact' ? { label: `Contact ${n}`, kind: 'phone', value: '555-010-010' + n }
      : s.rowKind === 'item' ? { title: `Item ${n}`, text: 'A short description.', meta: '$10' }
      : s.rowKind === 'channel' ? { title: `Channel ${n}`, body: 'What it is for.' }
      : { title: `Rule ${n}`, body: 'What guests should know.' }
    if (s.type === 'header') values[s.id] = { title: name, subtitle: 'A short line under the title' }
    else if (s.type === 'description') values[s.id] = { title: s.label, body: 'The text a manager writes goes here.' }
    else if (s.type === 'call') values[s.id] = { label: s.label, value: '555-010-0100' }
    else if (s.type === 'button') values[s.id] = { label: s.label, value: 'https://example.com/' }
    else if (s.type === 'list') values[s.id] = { rows: [row(1), row(2)] }
  }
  return fillToPage(t, values)
}

const clip = (v: unknown, max = 3000) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max) : '')

/**
 * What is kept of the manager's typing: only slots the layout has, only the fields each slot uses, only as many rows
 * as the slot allows, strings clipped, empty rows dropped. This is what gets stored; fillToPage then checks the content.
 */
export function cleanValues(t: Template, values: unknown): SlotValues {
  const src = obj(values)
  const out: SlotValues = {}
  for (const s of t.slots) {
    if (!Object.prototype.hasOwnProperty.call(src, s.id)) continue
    const v = obj(src[s.id])
    switch (s.type) {
      case 'header': out[s.id] = { title: clip(v.title, 400), subtitle: clip(v.subtitle, 400) }; break
      case 'hero': out[s.id] = { url: clip(v.url, 600) }; break
      case 'description': out[s.id] = { title: clip(v.title, 400), body: clip(v.body) }; break
      case 'call':
      case 'button': out[s.id] = { label: clip(v.label, 200), value: clip(v.value, 600) }; break
      case 'gallery': out[s.id] = { rows: rows(v, s.maxRows).map((r) => ({ url: clip(r.url, 600), caption: clip(r.caption, 400) })).filter(filled) }; break
      case 'list':
        out[s.id] = {
          rows: rows(v, s.maxRows)
            .map((r) => (s.rowKind === 'contact' ? { label: clip(r.label, 200), kind: r.kind === 'link' ? 'link' : r.kind === 'email' ? 'email' : 'phone', value: clip(r.value, 600) } : s.rowKind === 'item' ? { title: clip(r.title, 400), text: clip(r.text), meta: clip(r.meta, 200) } : { title: clip(r.title, 400), body: clip(r.body) }))
            .filter((r) => hasContent(s.rowKind, r as Record<string, unknown>)),
        }
        break
    }
  }
  return out
}
