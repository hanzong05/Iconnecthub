#!/usr/bin/env node
/**
 * One-time import of the Rules and Reservations content that is hardcoded in a hub's HTML page,
 * into the structured Pages format of the admin.
 *
 *   node scripts/import-hub-pages.mjs path/to/hub.html            (dry run: prints what would be saved, writes nothing)
 *
 * This script only READS the HTML file you give it and prints JSON. It never edits the HTML and never
 * touches the database. To use the result, open the hub's Pages screen in the admin and add the blocks
 * there (or ask for the save step to be built once you have checked the dry run).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', middot: '·', bull: '•' }
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
  return ENT[e.toLowerCase()] ?? m
})
const squash = (s) => s.replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

/** The text of an HTML fragment: <strong> becomes **bold**, <br> a line break, other tags are dropped. */
export function toText(html) {
  const t = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*(strong|b)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_m, _t, inner) => { const x = inner.replace(/<[^>]*>/g, '').trim(); return x ? `**${x}**` : '' })
    .replace(/<[^>]*>/g, '')
  return squash(decode(t))
}

/** The full element that starts at the first tag containing `marker`, by balancing <div> tags. Null if not found. */
export function grabDiv(html, marker) {
  const at = html.indexOf(marker)
  if (at < 0) return null
  const start = html.lastIndexOf('<div', at)
  if (start < 0) return null
  let depth = 0
  const re = /<\/?div\b[^>]*>/gi
  re.lastIndex = start
  let m
  while ((m = re.exec(html))) {
    depth += m[0].startsWith('</') ? -1 : 1
    if (depth === 0) return html.slice(start, re.lastIndex)
  }
  return null
}

/** Direct children <div ...>...</div> of a fragment's inner HTML, as {open, inner}. */
function childDivs(inner) {
  const out = []
  const re = /<\/?div\b[^>]*>/gi
  let depth = 0, from = 0, open = ''
  let m
  while ((m = re.exec(inner))) {
    if (!m[0].startsWith('</')) { if (depth === 0) { from = re.lastIndex; open = m[0] } depth++ } else { depth--; if (depth === 0) out.push({ open, inner: inner.slice(from, m.index) }) }
  }
  return out
}
const innerOf = (block) => block.slice(block.indexOf('>') + 1, block.lastIndexOf('</div>'))
const isAlert = (open) => /border-left:\s*4px solid #(ef4444|dc2626)/i.test(open) || /color:\s*#(ef4444|dc2626)/i.test(open)

export function parseRules(html) {
  const root = grabDiv(html, 'id="tab-rules"')
  if (!root) return null
  const title = toText((/<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(root) || [, ''])[1])
  const subtitle = toText((/<h2[^>]*>[\s\S]*?<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/i.exec(root) || [, ''])[1])
  const bodyAt = root.indexOf('contact-body')
  const body = bodyAt >= 0 ? grabDiv(root, 'contact-body') : null
  const blocks = []
  let n = 0
  const id = () => `i${++n}`
  for (const sec of childDivs(body ? innerOf(body) : '')) {
    if (!/\brules-section\b/.test(sec.open)) continue
    let alert = false
    for (const c of childDivs(sec.inner)) {
      if (/rules-section-label/.test(c.open)) { blocks.push({ id: id(), type: 'section', title: toText(c.inner), tone: isAlert(sec.open) || isAlert(c.open) ? 'alert' : 'normal' }); alert = true }
      else if (/\brules-rule\b/.test(c.open)) {
        const parts = childDivs(c.inner)
        const t = toText((parts.find((p) => /rules-rule-title/.test(p.open)) || { inner: '' }).inner)
        const bodyHtml = (parts.find((p) => /rules-rule-body/.test(p.open)) || { inner: '' }).inner
        const tel = /^\s*<a\b[^>]*href="tel:([0-9+()\-\s.]+)"[^>]*>[\s\S]*?<\/a>\s*$/i.exec(bodyHtml)
        if (tel && t) blocks.push({ id: id(), type: 'contact', label: t, kind: 'phone', value: toText(bodyHtml) || tel[1] })
        else blocks.push({ id: id(), type: 'rule', title: t, body: toText(bodyHtml) })
      }
    }
    void alert
  }
  return { title, subtitle, banner: '', blocks }
}

export function parseReservations(html) {
  const root = grabDiv(html, 'id="reserveOverlay"')
  if (!root) return null
  const title = toText((/class="notif-sheet-title"[^>]*>([\s\S]*?)<\/div>/i.exec(root) || [, ''])[1])
  const blocks = []
  let n = 0
  const rowRe = /<div\b[^>]*onclick="window\.open\('(https:\/\/[^']+)'[^"]*"[^>]*>([\s\S]*?)(?=<div\b[^>]*onclick="window\.open\(|$)/gi
  let m
  while ((m = rowRe.exec(root))) {
    const lines = [...m[2].matchAll(/<div\b[^>]*font-size:\s*(15|12)px[^>]*>([\s\S]*?)<\/div>/gi)].map((x) => toText(x[2]))
    const [name, sub] = lines
    if (!name) continue
    blocks.push({ id: `i${++n}`, type: 'contact', label: (sub ? `${name} · ${sub}` : name).slice(0, 80), kind: 'link', value: m[1] })
  }
  return { title, subtitle: '', banner: '', blocks }
}

export function extractPages(html) {
  const out = {}
  const rules = parseRules(html)
  if (rules && rules.blocks.length) out.rules = rules
  const res = parseReservations(html)
  if (res && res.blocks.length) out.reservations = res
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2]
  if (!file || process.argv.includes('--write')) {
    console.error(file ? 'Writing is not built into this script on purpose. Check the dry run first.' : 'Usage: node scripts/import-hub-pages.mjs path/to/hub.html')
    process.exit(2)
  }
  const pages = extractPages(readFileSync(file, 'utf8'))
  console.log(JSON.stringify(pages, null, 2))
  console.error(`DRY RUN: nothing was written. Found ${Object.entries(pages).map(([k, p]) => `${k}: ${p.blocks.length} blocks`).join(', ') || 'no pages'}.`)
}
