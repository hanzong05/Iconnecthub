#!/usr/bin/env node
/**
 * Reads the "More" items that are hardcoded in a hub's HTML page and are NOT in the admin yet (pickers such as RV Sites
 * and Cabins, their detail pages, the cable channel list) and builds an import PLAN: menu items, page layouts and the
 * filled-in content, in the shapes the admin already validates.
 *
 *   node scripts/import-hub-menu.mjs path/to/hub.html > plan.json     (dry run: reads one file, prints JSON, writes nothing)
 *
 * The plan is data. Nothing here touches the HTML or the database. The Super Admin loads the plan in Settings, where the
 * server checks every part again and saves it as a DRAFT only: nothing reaches guests until it is published.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { childDivs, grabDiv, innerOf, toText } from './import-hub-pages.mjs'

/** More items the admin already has (fixed pages, built-in features). Everything else in the hub's list is a candidate. Kept in step with VIS_ITEMS by a test. */
export const BUILT_IN = ['bookNow', 'bookTeeTime', 'scorecard', 'register', 'weather', 'wifi', 'rules', 'reservations', 'foodshopping', 'tickets', 'contact', 'newsletter', 'monthlyHappenings', 'musicFestival', 'review', 'chat', 'notifSettings', 'saloon', 'waystostay', 'thingsToDo']
const ICONS = { amenities: 'star', rvsites: 'bed', cabins: 'home', cable: 'info' }
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
const idFor = (key) => `c_${slug(key) || 'item'}`
const decodeName = (s) => toText(s)

/** { key: [label, handler] } and the order, from MORE_ITEM_DEFS and DEFAULT_MORE_ORDER. */
export function readMoreDefs(html) {
  const defs = {}
  const block = /MORE_ITEM_DEFS\s*=\s*\{([\s\S]*?)\n {0,8}\};/.exec(html)
  if (!block) return { defs, order: [] }
  const marks = [...block[1].matchAll(/\n\s+(\w+):\s*\{/g)]
  marks.forEach((m, i) => {
    const text = block[1].slice(m.index, i + 1 < marks.length ? marks[i + 1].index : undefined)
    const click = /onclick:\s*'([^']*)'/.exec(text)
    const title = /\btitle:\s*'((?:[^'\\]|\\.)*)'/.exec(text)
    if (click && title) defs[m[1]] = [decodeName(title[1].replace(/\\'/g, "'")), click[1]]
  })
  const order = /DEFAULT_MORE_ORDER\s*=\s*\[([\s\S]*?)\]/.exec(html)
  return { defs, order: order ? [...order[1].matchAll(/'(\w+)'/g)].map((x) => x[1]) : Object.keys(defs) }
}

/** The element a handler opens: "tab-xxx" (a details page) or an overlay id (a picker). */
export function handlerTarget(html, call) {
  const fn = /^\s*(?:window\.)?(\w+)\s*\(/.exec(call)?.[1]
  if (!fn) return null
  const at = html.search(new RegExp(`(?:function\\s+${fn}\\s*\\(|window\\.${fn}\\s*=\\s*function)`))
  if (at < 0) return null
  // the body of just this function: from its first brace to the matching one
  const open = html.indexOf('{', at)
  let depth = 0
  let end = open
  for (let i = open; i < html.length && i < open + 2000; i++) {
    if (html[i] === '{') depth++
    else if (html[i] === '}' && --depth === 0) { end = i; break }
  }
  const body = open < 0 ? '' : html.slice(open, end + 1)
  const url = /window\.open\(\s*'(https:\/\/[^']+)'/.exec(body)
  if (url) return { kind: 'link', url: url[1] }
  const id = /getElementById\('([^']+)'\)/.exec(body)
  return id ? { kind: id[1].startsWith('tab-') ? 'page' : 'sheet', id: id[1] } : null
}

const cls = (open, name) => new RegExp(`class="[^"]*\\b${name}\\b`).test(open)
const firstDiv = (inner, name) => childDivs(inner).find((c) => cls(c.open, name))

/** One details page → { title, subtitle, slots, values }. Sections become components; text that is only a placeholder is left empty. */
export function parseDetailPage(html, tabId, ctx = {}) {
  const root = grabDiv(html, `id="${tabId}"`)
  if (!root) return null
  const title = toText((/<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(root) || [, ''])[1])
  const subtitle = toText((/<h2[^>]*>[\s\S]*?<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i.exec(root) || [, ''])[1])
  const body = grabDiv(root, 'contact-body')
  const notes = []
  const slots = [{ type: 'header', label: 'Title', required: true }]
  const values = { 0: { title, subtitle } }
  let sawImg = false
  const add = (slot, value) => { slots.push(slot); values[slots.length - 1] = value }
  for (const sec of childDivs(body ? innerOf(body) : '')) {
    if (!/\b(contact-section|cable-channel-section)\b/.test(sec.open)) continue
    const label = toText((firstDiv(sec.inner, 'contact-section-label') ?? firstDiv(sec.inner, 'cable-section-label') ?? { inner: '' }).inner)
    // the hero picture
    const img = /<img\b[^>]*\bsrc="([^"]*)"/i.exec(sec.inner)
    if (img && !sawImg) { sawImg = true; add({ type: 'hero', label: 'Hero picture' }, { url: /^https:\/\//i.test(img[1]) ? img[1] : '' }) }
    // rows: label + value (contact rows) or number + name (cable channels)
    const rows = []
    for (const c of childDivs(sec.inner)) {
      if (cls(c.open, 'contact-row')) {
        const t = firstDiv(c.inner, 'contact-row-text')
        const lab = t && firstDiv(t.inner, 'contact-row-label')
        const val = t && firstDiv(t.inner, 'contact-row-value')
        if (lab && val) rows.push({ title: toText(lab.inner), body: toText(val.inner) })
      } else if (cls(c.open, 'cable-channel-row')) {
        const num = firstDiv(c.inner, 'cable-channel-num')
        const nam = firstDiv(c.inner, 'cable-channel-name')
        if (num && nam) rows.push({ title: toText(nam.inner), body: `Channel ${toText(num.inner)}` })
      }
    }
    // text: what is left once the label, rows, picture and button are removed; pills are kept as a short line
    let rest = sec.inner
    for (const c of childDivs(sec.inner)) if (cls(c.open, 'contact-section-label') || cls(c.open, 'cable-section-label') || cls(c.open, 'contact-row') || cls(c.open, 'cable-channel-row')) rest = rest.replace(c.inner, '')
    rest = rest.replace(/<img\b[^>]*>/gi, '').replace(/<button\b[\s\S]*?<\/button>/gi, '')
    const pills = [...rest.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => toText(m[1])).filter(Boolean)
    rest = rest.replace(/<span\b[\s\S]*?<\/span>/gi, '')
    let text = toText(rest.replace(/<div\b[^>]*>/gi, '\n').replace(/<\/div>/gi, '\n')).replace(/(\n\s*)+/g, '\n').trim()
    let placeholder = false
    if (/^Add a description of/i.test(text)) { notes.push(`${title}: the original only has placeholder text ("${text}"); left empty for the manager.`); text = ''; placeholder = true }
    if (pills.length) text = `${text}${text ? '\n' : ''}${pills.join(' · ')}`
    if (text || placeholder || (!rows.length && label && !sec.inner.includes('<button'))) add({ type: 'description', label: label || 'About' }, { title: label, body: text })
    if (rows.length) add({ type: 'list', label: label || 'List', maxRows: Math.max(10, Math.min(30, rows.length + 5)), rowKind: 'channel' }, { rows })
    const btn = /<button\b[^>]*onclick="openBookingWebview\(\)"[^>]*>([\s\S]*?)<\/button>/i.exec(sec.inner)
    const btnText = btn ? toText(btn[1]).replace(/\s+/g, ' ') : ''
    if (btn) add({ type: 'button', label: btnText || 'Book Now' }, { label: btnText || 'Book Now', value: ctx.bookUrl || '' })
  }
  return { title, subtitle, slots, values, notes }
}

/** The whole plan for one hub file. */
export function buildPlan(html, hub = '') {
  const { defs, order } = readMoreDefs(html)
  const bookUrl = (() => { const t = handlerTarget(html, 'openBookingWebview()'); return t && t.kind === 'link' ? t.url : '' })()
  const items = []
  const values = {}
  const notes = []
  const seen = new Set()
  const sid = (n) => `s${String.fromCharCode(97 + Math.floor(n / 26))}${String.fromCharCode(97 + (n % 26))}`
  const addPage = (id, label, icon, tabId) => {
    if (seen.has(id)) return id
    const d = parseDetailPage(html, tabId, { bookUrl })
    if (!d) { notes.push(`${label}: no page found for "${tabId}", skipped.`); return null }
    seen.add(id)
    const slots = d.slots.map((s, i) => ({ id: sid(i), type: s.type, label: s.label, required: !!s.required, maxRows: s.maxRows ?? 10, rowKind: s.rowKind ?? 'rule' }))
    const vals = {}
    for (const [i, v] of Object.entries(d.values)) vals[slots[Number(i)].id] = v
    items.push({ id, label, icon, kind: 'page', url: '', rows: [], shown: true, template: { slots } })
    values[id] = vals
    notes.push(...d.notes)
    return id
  }
  for (const key of order) {
    const def = defs[key]
    if (!def || BUILT_IN.includes(key)) continue
    const [label, call] = def
    const id = idFor(key)
    const target = handlerTarget(html, call)
    const icon = ICONS[key] ?? 'info'
    if (!target) { notes.push(`${label}: could not tell what it opens, skipped.`); continue }
    if (target.kind === 'link') { items.push({ id, label, icon: 'link', kind: 'link', url: target.url, rows: [], shown: true }); continue }
    if (target.kind === 'page') { addPage(id, label, icon, target.id); continue }
    // a picker: each row opens a details page or an address
    const sheet = grabDiv(html, `id="${target.id}"`)
    if (!sheet) { notes.push(`${label}: picker "${target.id}" not found, skipped.`); continue }
    const rows = []
    for (const r of childDivs(innerOf(grabDiv(sheet, 'padding:8px 0 4px') ?? ''))) {
      const rl = toText((/<div\b[^>]*font-size:\s*15px[^>]*>([\s\S]*?)<\/div>/i.exec(r.inner) || [, ''])[1])
      const oc = /onclick="([^"]*)"/.exec(r.open)?.[1] ?? ''
      const web = /window\.open\('(https:\/\/[^']+)'/.exec(oc)
      if (!rl) continue
      if (web) { rows.push({ label: rl, url: web[1] }); continue }
      const call2 = oc.split(';').map((x) => x.trim()).find((x) => /^open\w+\(\)$/.test(x))
      const t2 = call2 && handlerTarget(html, call2)
      if (t2 && t2.kind === 'page') {
        const pid = addPage(idFor(t2.id.replace(/^tab-/, '')), rl, icon, t2.id)
        if (pid) rows.push({ label: rl, url: '', page: pid })
      } else notes.push(`${label} > ${rl}: could not tell what it opens, skipped.`)
    }
    if (rows.length) items.push({ id, label, icon, kind: 'sheet', url: '', rows, shown: true })
    else notes.push(`${label}: the picker has no rows I can read, skipped.`)
  }
  if (items.length) notes.push('Items are saved as a draft and are not placed in any menu group: choose where they go in Settings, then publish.')
  return { hub, items, values, notes }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: node scripts/import-hub-menu.mjs path/to/hub.html > plan.json')
    process.exit(2)
  }
  const plan = buildPlan(readFileSync(file, 'utf8'), file.split(/[\\/]/).pop().replace(/\.html$/, ''))
  console.log(JSON.stringify(plan, null, 2))
  console.error(`DRY RUN: nothing was written. ${plan.items.length} items (${plan.items.filter((i) => i.kind === 'page').length} pages), ${plan.notes.length} notes.`)
}
