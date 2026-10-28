/**
 * Content pages (Reservations, Rules, Amenities…): a short list of fixed block types that managers fill in.
 * Pure: no database, no React. Shared by the admin actions, the data reader, the admin preview and the guest app.
 *
 * Stored per hub at hubs/{hubId}/pages/{pageId}. A page is never raw HTML: only the fields below are kept,
 * every field is length-limited, links must be https, phone numbers are digits, and text allows only **bold** and line breaks.
 */

export const PAGE_DEFS = [
  { id: 'reservations', label: 'Reservations', hint: 'Where guests book a stay: each row is a place to book or a number to call.' },
  { id: 'rules', label: 'Rules', hint: 'Sections of rules, check-in and check-out times, emergency numbers.' },
  { id: 'amenities', label: 'Amenities', hint: 'What the park offers.' },
  { id: 'waystostay', label: 'Ways to Stay', hint: 'Site and lodging types, with rates.' },
  { id: 'thingsToDo', label: 'Things to Do', hint: 'Activities and attractions.' },
  { id: 'foodshopping', label: 'Food & Shopping', hint: 'Places to eat and shop.' },
  { id: 'tickets', label: 'Tickets & Specials', hint: 'Tickets, discounts and special offers.' },
] as const
export type PageId = (typeof PAGE_DEFS)[number]['id']
export const PAGE_IDS: string[] = PAGE_DEFS.map((p) => p.id)
export const isPageId = (v: unknown): v is PageId => typeof v === 'string' && PAGE_IDS.includes(v)

export const MAX_BLOCKS = 80
export const BLOCK_LIMITS = { pageTitle: 80, subtitle: 160, url: 500, blockTitle: 120, label: 80, rule: 1500, card: 600, meta: 80, caption: 160, phone: 30, email: 200 } as const

export type BlockType = 'section' | 'rule' | 'contact' | 'image' | 'card'
export type SectionTone = 'normal' | 'alert'
export type ContactKind = 'phone' | 'link' | 'email'

export type Block =
  | { id: string; type: 'section'; title: string; tone: SectionTone }
  | { id: string; type: 'rule'; title: string; body: string }
  | { id: string; type: 'contact'; label: string; kind: ContactKind; value: string }
  | { id: string; type: 'image'; url: string; caption: string }
  | { id: string; type: 'card'; title: string; text: string; meta: string }

export interface Page {
  title: string
  subtitle: string
  banner: string
  blocks: Block[]
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  section: 'Section heading',
  rule: 'Rule or detail',
  contact: 'Phone, link or email',
  image: 'Picture',
  card: 'Info card',
}

export class PageInvalid extends Error {}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const clean = (v: unknown, max: number, multiline = false): string => {
  if (typeof v !== 'string') return ''
  const t = v.replace(/\r\n?/g, '\n').replace(CONTROL, '')
  return (multiline ? t : t.replace(/\n/g, ' ')).trim().slice(0, max)
}
const strict = (v: unknown, max: number, what: string, multiline = false): string => {
  if (typeof v === 'string' && v.length > max + 1000) throw new PageInvalid(`${what} is too long (${max} characters at most).`)
  const out = clean(v, max + 1, multiline)
  if (out.length > max) throw new PageInvalid(`${what} is too long (${max} characters at most).`)
  return out
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export const httpsUrl = (v: unknown): string => {
  if (typeof v !== 'string') return ''
  const t = v.trim()
  if (t.length > BLOCK_LIMITS.url || /[\s<>"'`\\]/.test(t)) return ''
  try {
    const u = new URL(t)
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : ''
  } catch {
    return ''
  }
}
const PHONE = /^\+?[0-9][0-9 ().-]{2,28}$/
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/

const ID = /^[A-Za-z0-9_-]{1,24}$/
const newBlockId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

function validateBlock(raw: unknown, n: number, usedIds: Set<string>): Block {
  const at = `Block ${n}`
  if (!isObj(raw)) throw new PageInvalid(`${at} is not valid.`)
  let id = typeof raw.id === 'string' && ID.test(raw.id) && !usedIds.has(raw.id) ? raw.id : newBlockId()
  while (usedIds.has(id)) id = newBlockId()
  usedIds.add(id)
  switch (raw.type) {
    case 'section': {
      const title = strict(raw.title, BLOCK_LIMITS.blockTitle, `${at} title`)
      if (!title) throw new PageInvalid(`${at}: a section needs a title.`)
      return { id, type: 'section', title, tone: raw.tone === 'alert' ? 'alert' : 'normal' }
    }
    case 'rule': {
      const title = strict(raw.title, BLOCK_LIMITS.blockTitle, `${at} title`)
      const body = strict(raw.body, BLOCK_LIMITS.rule, `${at} text`, true)
      if (!title && !body) throw new PageInvalid(`${at}: add a title or some text.`)
      return { id, type: 'rule', title, body }
    }
    case 'contact': {
      const label = strict(raw.label, BLOCK_LIMITS.label, `${at} label`)
      const kind: ContactKind = raw.kind === 'link' ? 'link' : raw.kind === 'email' ? 'email' : 'phone'
      const given = clean(raw.value, BLOCK_LIMITS.url)
      if (!label) throw new PageInvalid(`${at}: add a label.`)
      if (kind === 'phone') {
        if (!PHONE.test(given)) throw new PageInvalid(`${at}: enter a phone number such as 770-498-5710.`)
        return { id, type: 'contact', label, kind, value: given }
      }
      if (kind === 'email') {
        if (!EMAIL.test(given) || given.length > BLOCK_LIMITS.email) throw new PageInvalid(`${at}: that email address does not look right.`)
        return { id, type: 'contact', label, kind, value: given }
      }
      const url = httpsUrl(given)
      if (!url) throw new PageInvalid(`${at}: the link must start with https://`)
      return { id, type: 'contact', label, kind, value: url }
    }
    case 'image': {
      const url = httpsUrl(raw.url)
      if (!url) throw new PageInvalid(`${at}: the picture link must start with https://`)
      return { id, type: 'image', url, caption: strict(raw.caption, BLOCK_LIMITS.caption, `${at} caption`) }
    }
    case 'card': {
      const title = strict(raw.title, BLOCK_LIMITS.blockTitle, `${at} title`)
      if (!title) throw new PageInvalid(`${at}: an info card needs a title.`)
      return { id, type: 'card', title, text: strict(raw.text, BLOCK_LIMITS.card, `${at} text`, true), meta: strict(raw.meta, BLOCK_LIMITS.meta, `${at} price or hours`) }
    }
    default:
      throw new PageInvalid(`${at} has an unknown type.`)
  }
}

/** Checks and cleans a page from the editor. Only known fields are kept; anything invalid is refused with a plain message. */
export function validatePage(input: unknown): Page {
  if (!isObj(input)) throw new PageInvalid('That page is not valid.')
  const rawBlocks = input.blocks
  if (!Array.isArray(rawBlocks)) throw new PageInvalid('That page is not valid.')
  if (rawBlocks.length > MAX_BLOCKS) throw new PageInvalid(`A page can have ${MAX_BLOCKS} blocks at most.`)
  const banner = input.banner === '' || input.banner == null ? '' : httpsUrl(input.banner)
  if (input.banner && !banner) throw new PageInvalid('The banner picture link must start with https://')
  const used = new Set<string>()
  return {
    title: strict(input.title, BLOCK_LIMITS.pageTitle, 'The title'),
    subtitle: strict(input.subtitle, BLOCK_LIMITS.subtitle, 'The subtitle'),
    banner,
    blocks: rawBlocks.map((b, i) => validateBlock(b, i + 1, used)),
  }
}

/**
 * Reads a stored page for display. Tolerant: old or odd data never throws, invalid blocks are dropped,
 * and a page saved with n = 0 is empty (an empty list cannot be stored in the database).
 */
export function readPage(raw: unknown): Page | null {
  if (!isObj(raw)) return null
  const list = Array.isArray(raw.blocks) ? raw.blocks : isObj(raw.blocks) ? Object.keys(raw.blocks).sort((a, b) => Number(a) - Number(b)).map((k) => (raw.blocks as Record<string, unknown>)[k]) : []
  const blocks: Block[] = []
  const used = new Set<string>()
  if (raw.n !== 0) {
    for (const b of list.slice(0, MAX_BLOCKS)) {
      try {
        blocks.push(validateBlock(b, blocks.length + 1, used))
      } catch {
        /* skip a block that no longer passes the checks */
      }
    }
  }
  const banner = httpsUrl(raw.banner)
  const title = clean(raw.title, BLOCK_LIMITS.pageTitle)
  const subtitle = clean(raw.subtitle, BLOCK_LIMITS.subtitle)
  if (!title && !subtitle && !banner && blocks.length === 0) return null
  return { title, subtitle, banner, blocks }
}

/** The stored form of a page: n survives in the database when the list is empty. */
export function toStored(page: Page): Record<string, unknown> {
  return { title: page.title, subtitle: page.subtitle, banner: page.banner, n: page.blocks.length, ...(page.blocks.length ? { blocks: page.blocks } : {}) }
}

export function emptyPage(): Page {
  return { title: '', subtitle: '', banner: '', blocks: [] }
}

export interface TextPart { text: string; bold: boolean }
/** Splits plain text into lines of parts for display. Only **bold** is understood; everything else is shown as typed. */
export function formatText(text: string): TextPart[][] {
  return text.split('\n').map((line) => {
    const parts: TextPart[] = []
    let last = 0
    for (const m of line.matchAll(/\*\*([^*]+?)\*\*/g)) {
      const at = m.index ?? 0
      if (at > last) parts.push({ text: line.slice(last, at), bold: false })
      parts.push({ text: m[1], bold: true })
      last = at + m[0].length
    }
    if (last < line.length) parts.push({ text: line.slice(last), bold: false })
    return parts
  })
}

/** tel: link from a stored phone number: digits and a leading + only. */
export function telLink(phone: string): string {
  const d = phone.replace(/[^0-9+]/g, '')
  return d ? `tel:${d}` : ''
}

/** A short summary of what changed between two pages, for the history. Never longer than 200 characters. */
export function describeChange(before: Page | null, after: Page): string {
  const b = before?.blocks.length ?? 0
  const a = after.blocks.length
  const parts: string[] = []
  if (!before) parts.push(`New page with ${a} block${a === 1 ? '' : 's'}`)
  else {
    if (before.title !== after.title) parts.push('title changed')
    if (before.subtitle !== after.subtitle) parts.push('subtitle changed')
    if (before.banner !== after.banner) parts.push('banner changed')
    if (a !== b) parts.push(`${b} → ${a} blocks`)
    else if (JSON.stringify(before.blocks.map(({ id: _i, ...r }) => r)) !== JSON.stringify(after.blocks.map(({ id: _i, ...r }) => r))) parts.push('block text changed')
  }
  return (parts.join(', ') || 'No visible change').slice(0, 200)
}
