import { describe, expect, it } from 'vitest'
import { PageInvalid } from './pages'
import { STARTER_TEMPLATES, fillToPage, missingRequired, parseTemplate, readTemplate, samplePage, cleanValues, type Template } from './template'

const tpl = (slots: Partial<Template['slots'][number]>[]): Template => ({
  slots: slots.map((s, i) => ({ id: `s${i}x`, type: 'description', label: 'Part', required: false, maxRows: 10, rowKind: 'rule', ...s })) as Template['slots'],
})

describe('parseTemplate', () => {
  it('accepts every starter template', () => {
    for (const s of STARTER_TEMPLATES) expect(parseTemplate(s.template).slots.length).toBe(s.template.slots.length)
  })
  it('rejects a missing layout, too many components and duplicate ids', () => {
    expect(() => parseTemplate(null)).toThrow(/needs a layout/)
    expect(() => parseTemplate({ slots: Array.from({ length: 21 }, (_, i) => ({ id: `s${i}ab`, type: 'description', label: 'x' })) })).toThrow(/20 components/)
    expect(() => parseTemplate({ slots: [{ id: 'sabc', type: 'description', label: 'a' }, { id: 'sabc', type: 'description', label: 'b' }] })).toThrow(/twice/)
  })
  it('rejects unknown types, bad ids, empty or long names and two headers', () => {
    expect(() => parseTemplate({ slots: [{ id: 'sabc', type: 'script', label: 'a' }] })).toThrow(/unknown type/)
    expect(() => parseTemplate({ slots: [{ id: '../x', type: 'hero', label: 'a' }] })).toThrow(/invalid id/)
    expect(() => parseTemplate({ slots: [{ id: 'sabc', type: 'hero', label: '  ' }] })).toThrow(/needs a name/)
    expect(() => parseTemplate({ slots: [{ id: 'sabc', type: 'hero', label: 'x'.repeat(61) }] })).toThrow(/too long/)
    expect(() => parseTemplate({ slots: [{ id: 'sabc', type: 'header', label: 'a' }, { id: 'sabd', type: 'header', label: 'b' }] })).toThrow(/only one/)
    expect(() => parseTemplate({ slots: [{ id: 'sabc', type: 'hero', label: 'a' }, { id: 'sabd', type: 'hero', label: 'b' }] })).toThrow(/only one/)
  })
  it('limits the rows of lists and galleries, and ignores row limits elsewhere', () => {
    expect(() => parseTemplate({ slots: [{ id: 'sabc', type: 'list', label: 'a', maxRows: 0 }] })).toThrow(/rows/)
    expect(() => parseTemplate({ slots: [{ id: 'sabc', type: 'gallery', label: 'a', maxRows: 31 }] })).toThrow(/rows/)
    expect(parseTemplate({ slots: [{ id: 'sabc', type: 'button', label: 'a', maxRows: 999, rowKind: 'x' }] }).slots[0]).toMatchObject({ maxRows: 10, rowKind: 'rule' })
  })
  it('never makes a section heading required, and falls back to the rule row kind', () => {
    const t = parseTemplate({ slots: [{ id: 'sabc', type: 'section', label: 'Hours', required: true }, { id: 'sabd', type: 'list', label: 'L', maxRows: 3, rowKind: 'nope' }] })
    expect(t.slots[0].required).toBe(false)
    expect(t.slots[1].rowKind).toBe('rule')
  })
  it('readTemplate treats a broken stored template as none', () => {
    expect(readTemplate({ slots: 'x' })).toBeNull()
    expect(readTemplate(undefined)).toBeNull()
    expect(readTemplate(STARTER_TEMPLATES[1].template)?.slots).toHaveLength(2)
  })
})

describe('fillToPage', () => {
  const full = tpl([
    { id: 'shead', type: 'header', label: 'Title' },
    { id: 'shero', type: 'hero', label: 'Hero' },
    { id: 'ssec', type: 'section', label: 'Good to know' },
    { id: 'sdesc', type: 'description', label: 'About' },
    { id: 'scall', type: 'call', label: 'Front desk' },
    { id: 'sbtn', type: 'button', label: 'Book now' },
    { id: 'slist', type: 'list', label: 'Rules', maxRows: 2, rowKind: 'rule' },
  ])
  it('turns slots into the page guests see, in layout order', () => {
    const page = fillToPage(full, {
      shead: { title: 'Pumpkin Patch', subtitle: 'Fall fun' },
      shero: { url: 'https://img.test/a.jpg' },
      sdesc: { title: 'Open', body: 'Daily 9-5' },
      scall: { value: '770-498-5710' },
      sbtn: { label: 'Reserve', value: 'https://book.test/' },
      slist: { rows: [{ title: 'No pets', body: 'Sorry' }, { title: 'Quiet', body: '10pm' }, { title: 'Third', body: 'dropped' }] },
    })
    expect(page.title).toBe('Pumpkin Patch')
    expect(page.banner).toBe('https://img.test/a.jpg')
    expect(page.blocks.map((b) => b.type)).toEqual(['section', 'rule', 'contact', 'contact', 'rule', 'rule'])
    expect(page.blocks[2]).toMatchObject({ kind: 'phone', label: 'Front desk' })
    expect(page.blocks[3]).toMatchObject({ kind: 'link', label: 'Reserve' })
  })
  it('leaves empty optional slots out and builds list rows by kind', () => {
    const t = tpl([{ id: 'sa', type: 'list', label: 'C', rowKind: 'contact' }, { id: 'sb', type: 'list', label: 'I', rowKind: 'item' }, { id: 'sc', type: 'gallery', label: 'G' }])
    const page = fillToPage(t, {
      sa: { rows: [{ label: 'Office', kind: 'email', value: 'a@b.co' }, {}] },
      sb: { rows: [{ title: 'Boat', text: 'Fun', meta: '$5' }] },
      sc: { rows: [{ url: 'https://img.test/1.jpg', caption: 'One' }] },
    })
    expect(page.blocks.map((b) => b.type)).toEqual(['contact', 'card', 'image'])
  })
  it('refuses unsafe or invalid values with the usual page checks', () => {
    expect(() => fillToPage(full, { shero: { url: 'javascript:alert(1)' } })).toThrow(PageInvalid)
    expect(() => fillToPage(full, { sbtn: { value: 'http://plain.test' } })).toThrow(/https/)
    expect(() => fillToPage(full, { scall: { value: 'call me' } })).toThrow(/phone/)
  })
  it('ignores values for slots the layout does not have', () => {
    const page = fillToPage(tpl([{ id: 'shead', type: 'header', label: 'T' }]), { shead: { title: 'A' }, evil: { title: 'B' }, __proto__: { title: 'C' } })
    expect(page.title).toBe('A')
    expect(page.blocks).toEqual([])
  })
})

describe('missingRequired', () => {
  const t = tpl([{ id: 'shead', type: 'header', label: 'Title', required: true }, { id: 'slist', type: 'list', label: 'Rules', required: true }, { id: 'sbtn', type: 'button', label: 'Button' }])
  it('names each required slot that is still empty', () => {
    expect(missingRequired(t, {})).toEqual(['Title', 'Rules'])
    expect(missingRequired(t, { shead: { title: ' ' }, slist: { rows: [{}] } })).toEqual(['Title', 'Rules'])
  })
  it('passes when required slots are filled and ignores optional ones', () => {
    expect(missingRequired(t, { shead: { title: 'Hi' }, slist: { rows: [{ title: 'x', body: '' }] } })).toEqual([])
  })
})

describe('samplePage', () => {
  it('fills every starter layout with valid made-up content', () => {
    for (const s of STARTER_TEMPLATES) {
      const page = samplePage(s.template, 'Pumpkin Patch')
      expect(page.title).toBe('Pumpkin Patch')
      if (s.id !== 'free') expect(page.blocks.length).toBeGreaterThan(0)
    }
  })
})

describe('cleanValues', () => {
  const t = tpl([
    { id: 'shead', type: 'header', label: 'T' },
    { id: 'slist', type: 'list', label: 'L', maxRows: 2, rowKind: 'contact' },
    { id: 'sgal', type: 'gallery', label: 'G', maxRows: 1 },
  ])
  it('keeps only slots the layout has and only the fields each slot uses', () => {
    const out = cleanValues(t, { shead: { title: 'Hi', subtitle: 'x', evil: '<script>' }, other: { title: 'no' }, constructor: { x: 1 } })
    expect(out).toEqual({ shead: { title: 'Hi', subtitle: 'x' } })
  })
  it('caps rows, drops empty rows, clips long text and defaults the contact kind', () => {
    const out = cleanValues(t, {
      slist: { rows: [{ label: 'A', value: '555-010-0100', kind: 'bogus' }, { label: '', value: '', kind: 'link' }, { label: 'C', value: 'c@d.co', kind: 'email' }] },
      sgal: { rows: [{ url: 'https://i.test/1.jpg', caption: 'x'.repeat(900) }, { url: 'https://i.test/2.jpg' }] },
    }) as Record<string, { rows: Record<string, string>[] }>
    expect(out.slist.rows).toEqual([{ label: 'A', kind: 'phone', value: '555-010-0100' }])
    expect(out.sgal.rows).toHaveLength(1)
    expect(out.sgal.rows[0].caption).toHaveLength(400)
  })
  it('reads rows the database stored as a keyed object', () => {
    const out = cleanValues(t, { slist: { rows: { 0: { label: 'A', value: '555-010-0100' }, 2: { label: 'B', value: '555-010-0101' } } } }) as Record<string, { rows: unknown[] }>
    expect(out.slist.rows).toHaveLength(2)
  })
  it('does not count an empty contact row as filled in', () => {
    const only = tpl([{ id: 'slist', type: 'list', label: 'Contacts', required: true, rowKind: 'contact' }])
    expect(missingRequired(only, { slist: { rows: [{ label: '', kind: 'phone', value: '' }] } })).toEqual(['Contacts'])
    expect(fillToPage(only, { slist: { rows: [{ label: '', kind: 'phone', value: '' }] } }).blocks).toEqual([])
  })
})
