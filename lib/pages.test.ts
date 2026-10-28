import { describe, expect, it } from 'vitest'
import { MAX_BLOCKS, PageInvalid, describeChange, emptyPage, formatText, httpsUrl, readPage, telLink, toStored, validatePage, type Page } from './pages'

const page = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({ title: 'Rules', subtitle: 'Park rules', banner: '', blocks, ...extra })
const bad = (input: unknown) => {
  try {
    validatePage(input)
  } catch (e) {
    expect(e).toBeInstanceOf(PageInvalid)
    return (e as Error).message
  }
  throw new Error('expected the page to be refused')
}

describe('validatePage', () => {
  it('keeps a valid page and every block type, and trims text', () => {
    const out = validatePage(
      page([
        { type: 'section', title: '  Emergency  ', tone: 'alert' },
        { type: 'rule', title: 'Check-in', body: '**2:00 PM**\nID required' },
        { type: 'contact', label: 'Police', kind: 'phone', value: '770-413-5333' },
        { type: 'contact', label: 'Book', kind: 'link', value: 'https://www.campspot.com/book/x' },
        { type: 'contact', label: 'Mail', kind: 'email', value: 'stay@park.test' },
        { type: 'image', url: 'https://img.test/a.png', caption: 'Lake' },
        { type: 'card', title: 'Pool', text: 'Open daily', meta: '$5' },
      ]),
    )
    expect(out.blocks.map((b) => b.type)).toEqual(['section', 'rule', 'contact', 'contact', 'contact', 'image', 'card'])
    expect(out.blocks[0]).toMatchObject({ title: 'Emergency', tone: 'alert' })
    expect(new Set(out.blocks.map((b) => b.id)).size).toBe(7)
  })
  it('refuses unsafe or malformed links', () => {
    for (const value of ['javascript:alert(1)', 'http://insecure.test', 'https://', 'ftp://x.test', 'https://a.test/"onmouseover="x', 'data:text/html,hi']) {
      expect(bad(page([{ type: 'contact', label: 'x', kind: 'link', value }]))).toMatch(/https/)
    }
    expect(bad(page([{ type: 'image', url: 'javascript:alert(1)' }]))).toMatch(/https/)
    expect(bad(page([], { banner: 'http://x.test/a.png' }))).toMatch(/banner/)
  })
  it('refuses bad phone numbers and emails', () => {
    expect(bad(page([{ type: 'contact', label: 'x', kind: 'phone', value: 'call me' }]))).toMatch(/phone/)
    expect(bad(page([{ type: 'contact', label: 'x', kind: 'phone', value: '1; DROP' }]))).toMatch(/phone/)
    expect(bad(page([{ type: 'contact', label: 'x', kind: 'email', value: 'nope' }]))).toMatch(/email/)
  })
  it('refuses unknown block types, missing required text, and too many or too long things', () => {
    expect(bad(page([{ type: 'script', title: 'x' }]))).toMatch(/unknown type/)
    expect(bad(page([{ type: 'section', title: '  ' }]))).toMatch(/needs a title/)
    expect(bad(page([{ type: 'rule', title: '', body: '' }]))).toMatch(/title or some text/)
    expect(bad(page([{ type: 'card', title: '' }]))).toMatch(/needs a title/)
    expect(bad(page(Array.from({ length: MAX_BLOCKS + 1 }, () => ({ type: 'section', title: 'x' }))))).toMatch(/blocks at most/)
    expect(bad(page([{ type: 'rule', title: 't', body: 'x'.repeat(1501) }]))).toMatch(/too long/)
    expect(bad(page([{ type: 'rule', title: 't'.repeat(121), body: '' }]))).toMatch(/too long/)
    expect(bad({ ...page([]), title: 'x'.repeat(81) })).toMatch(/too long/)
    expect(bad(null)).toMatch(/not valid/)
    expect(bad({ title: 'x' })).toMatch(/not valid/)
    expect(bad(page(['nope']))).toMatch(/not valid/)
  })
  it('drops unknown fields and keeps markup as plain text', () => {
    const out = validatePage(page([{ type: 'rule', title: '<img src=x onerror=alert(1)>', body: '<script>x</script>', evil: 'y', __proto__: { polluted: true } }], { role: 'super', __proto__: { x: 1 } }))
    expect(JSON.stringify(out)).not.toContain('evil')
    expect(JSON.stringify(out)).not.toContain('role')
    expect(out.blocks[0]).toMatchObject({ title: '<img src=x onerror=alert(1)>' }) // stored as text; display escapes it
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it('removes control characters and normalises line endings', () => {
    const out = validatePage(page([{ type: 'rule', title: 'a\u0000b', body: 'x\r\ny\u0007' }]))
    expect(out.blocks[0]).toMatchObject({ title: 'ab', body: 'x\ny' })
  })
  it('keeps block ids that are safe and unique, and replaces the rest', () => {
    const out = validatePage(page([{ id: 'keep', type: 'section', title: 'a' }, { id: 'keep', type: 'section', title: 'b' }, { id: 'bad id!', type: 'section', title: 'c' }]))
    const ids = out.blocks.map((b) => b.id)
    expect(ids[0]).toBe('keep')
    expect(new Set(ids).size).toBe(3)
    expect(ids.every((i) => /^[A-Za-z0-9_-]{1,24}$/.test(i))).toBe(true)
  })
})

describe('readPage and toStored', () => {
  const p: Page = { title: 'Reservations', subtitle: '', banner: '', blocks: [{ id: 'a', type: 'card', title: 'Campground', text: 'RV & tents', meta: '' }] }
  it('round-trips a page', () => {
    expect(readPage(toStored(p))).toEqual(p)
  })
  it('treats n = 0 as an empty page even if old blocks are still present', () => {
    const r = readPage({ title: 'T', n: 0, blocks: p.blocks })
    expect(r?.blocks).toEqual([])
    expect(toStored({ ...p, blocks: [] })).toMatchObject({ n: 0 })
    expect('blocks' in toStored({ ...p, blocks: [] })).toBe(false)
  })
  it('reads the object form the database may return, and skips blocks that fail the checks', () => {
    const r = readPage({ title: 'T', blocks: { 0: { id: 'x', type: 'section', title: 'ok' }, 1: { type: 'contact', label: 'bad', kind: 'link', value: 'javascript:1' }, 2: 'junk' } })
    expect(r?.blocks.map((b) => b.type)).toEqual(['section'])
  })
  it('returns null for nothing, junk and fully empty pages', () => {
    expect(readPage(null)).toBeNull()
    expect(readPage('x')).toBeNull()
    expect(readPage([])).toBeNull()
    expect(readPage({ title: '', blocks: [] })).toBeNull()
    expect(emptyPage().blocks).toEqual([])
  })
})

describe('text helpers', () => {
  it('formats bold and line breaks, and leaves a lone ** as plain text', () => {
    expect(formatText('Check-in **2:00 PM** sharp\nID required')).toEqual([
      [{ text: 'Check-in ', bold: false }, { text: '2:00 PM', bold: true }, { text: ' sharp', bold: false }],
      [{ text: 'ID required', bold: false }],
    ])
    expect(formatText('5 ** 3')).toEqual([[{ text: '5 ** 3', bold: false }]])
    expect(formatText('')).toEqual([[]])
  })
  it('builds tel links and checks https urls', () => {
    expect(telLink('+1 (770) 498-5710')).toBe('tel:+17704985710')
    expect(httpsUrl('https://a.test/x?y=1')).toBe('https://a.test/x?y=1')
    expect(httpsUrl('https://localhost')).toBe('')
    expect(httpsUrl(5)).toBe('')
  })
  it('describes changes briefly', () => {
    const a: Page = { title: 'A', subtitle: '', banner: '', blocks: [] }
    expect(describeChange(null, a)).toMatch(/New page with 0 blocks/)
    expect(describeChange(a, { ...a, title: 'B' })).toBe('title changed')
    expect(describeChange(a, a)).toBe('No visible change')
  })
})
