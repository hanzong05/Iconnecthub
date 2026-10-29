import { describe, expect, it } from 'vitest'
import { MENU_LIMITS, isMenuId, parseMenuItems, readMenuItems } from './menu'
import { SettingsInvalid } from './settings-validate'

const link = { id: 'c_suntex1', label: 'Suntex Marinas', icon: 'boat', kind: 'link', url: 'https://suntex.com/marinas/' }
const sheet = { id: 'c_rvsites', label: 'RV Sites', icon: 'home', kind: 'sheet', rows: [{ label: 'Premium Sites', url: 'https://example.com/premium' }] }
const page = { id: 'c_cabins1', label: 'Cabins', icon: 'bed', kind: 'page' }

describe('parseMenuItems (what the Super Admin sends)', () => {
  it('accepts the three kinds and cleans them', () => {
    const out = parseMenuItems([link, sheet, page, { ...page, id: 'c_cabins2', url: 'https://ignored.example.com', rows: [{ label: 'x', url: 'https://x.test' }] }])
    expect(out.map((m) => m.kind)).toEqual(['link', 'sheet', 'page', 'page'])
    expect(out[0].url).toBe('https://suntex.com/marinas/')
    expect(out[1].rows).toEqual([{ label: 'Premium Sites', url: 'https://example.com/premium' }])
    // A page keeps no address or rows; a link keeps no rows.
    expect(out[3]).toMatchObject({ url: '', rows: [], shown: true })
  })
  it.each([
    ['not a list', 'x'],
    ['a built-in looking id', [{ ...page, id: 'wifi' }]],
    ['a bad id', [{ ...page, id: 'c_A B' }]],
    ['no name', [{ ...page, label: '   ' }]],
    ['a name that is too long', [{ ...page, label: 'x'.repeat(MENU_LIMITS.label + 1) }]],
    ['an unknown kind', [{ ...page, kind: 'html' }]],
    ['an unknown icon', [{ ...page, icon: 'skull' }]],
    ['a link with no address', [{ ...link, url: '' }]],
    ['a link with http', [{ ...link, url: 'http://suntex.com' }]],
    ['a javascript: link', [{ ...link, url: 'javascript:alert(1)' }]],
    ['a sheet row with no address', [{ ...sheet, rows: [{ label: 'A', url: '' }] }]],
    ['a sheet row with an unsafe address', [{ ...sheet, rows: [{ label: 'A', url: 'data:text/html,hi' }] }]],
    ['a sheet row with no name', [{ ...sheet, rows: [{ label: '', url: 'https://x.test' }] }]],
    ['too many rows', [{ ...sheet, rows: Array.from({ length: MENU_LIMITS.rows + 1 }, (_, i) => ({ label: `r${i}`, url: 'https://x.test' })) }]],
    ['the same id twice', [page, page]],
    ['too many items', Array.from({ length: MENU_LIMITS.items + 1 }, (_, i) => ({ ...page, id: `c_item${i.toString().padStart(3, '0')}` }))],
  ])('refuses %s', (_name, input) => {
    expect(() => parseMenuItems(input)).toThrow(SettingsInvalid)
  })
  it('keeps markup as plain text (it is escaped when drawn)', () => {
    const [m] = parseMenuItems([{ ...page, label: '<img src=x onerror=alert(1)>' }])
    expect(m.label).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('readMenuItems (what is stored)', () => {
  it('drops anything unusable instead of failing', () => {
    const out = readMenuItems([link, { ...page, id: 'nope' }, { ...page, label: '' }, null, 'x', { ...sheet, rows: [{ label: 'ok', url: 'https://x.test' }, { label: 'bad', url: 'javascript:1' }] }])
    expect(out.map((m) => m.id)).toEqual(['c_suntex1', 'c_rvsites'])
    expect(out[1].rows).toHaveLength(1)
  })
  it('works for old hubs with nothing stored and for object-shaped lists', () => {
    expect(readMenuItems(undefined)).toEqual([])
    expect(readMenuItems(null)).toEqual([])
    expect(readMenuItems({ 0: page }).map((m) => m.id)).toEqual(['c_cabins1'])
  })
  it('knows custom ids from built-in ones', () => {
    expect(isMenuId('c_abc1')).toBe(true)
    expect(isMenuId('wifi')).toBe(false)
    expect(isMenuId('c_')).toBe(false)
  })
})

describe('details page layouts on menu items', () => {
  const page = (template: unknown) => ({ id: 'c_abc123', label: 'Patch', icon: 'info', kind: 'page', url: '', rows: [], shown: true, template })
  it('keeps a valid layout on a details page and drops it elsewhere', () => {
    const t = { slots: [{ id: 'shead', type: 'header', label: 'Title', required: true, maxRows: 10, rowKind: 'rule' }] }
    expect(parseMenuItems([page(t)])[0].template?.slots).toHaveLength(1)
    expect(parseMenuItems([{ ...page(t), kind: 'link', url: 'https://x.test/' }])[0].template).toBeUndefined()
    expect(parseMenuItems([page(null)])[0].template).toBeUndefined()
  })
  it('refuses an empty or broken layout with a plain message', () => {
    expect(() => parseMenuItems([page({ slots: [] })])).toThrow(/at least one component/)
    expect(() => parseMenuItems([page({ slots: [{ id: 'x', type: 'header', label: 'T' }] })])).toThrow(/invalid id/)
  })
  it('reads a stored layout and ignores a broken one', () => {
    const ok = { slots: [{ id: 'shead', type: 'header', label: 'Title' }] }
    expect(readMenuItems([page(ok)])[0].template?.slots[0].type).toBe('header')
    expect(readMenuItems([page({ slots: 5 })])[0].template).toBeUndefined()
  })
})

describe('sheet rows that open a details page', () => {
  const pageItem = { id: 'c_fish001', label: 'Fishing', icon: 'info', kind: 'page', url: '', rows: [], shown: true }
  const sheet = (rows: unknown[]) => ({ id: 'c_amen001', label: 'Amenities', icon: 'star', kind: 'sheet', url: '', rows, shown: true })
  it('accepts a row that opens a page of this hub next to a row that opens an address', () => {
    const out = parseMenuItems([pageItem, sheet([{ label: 'Fishing', page: 'c_fish001' }, { label: 'Suntex', url: 'https://suntex.com/' }])])
    expect(out[1].rows).toEqual([{ label: 'Fishing', url: '', page: 'c_fish001' }, { label: 'Suntex', url: 'https://suntex.com/' }])
  })
  it('refuses a row that opens a missing page, a link item, or something that is not a menu id', () => {
    expect(() => parseMenuItems([sheet([{ label: 'Gone', page: 'c_gone0001' }])])).toThrow(/does not exist/)
    expect(() => parseMenuItems([{ ...pageItem, kind: 'link', url: 'https://x.test/' }, sheet([{ label: 'X', page: 'c_fish001' }])])).toThrow(/does not exist/)
    expect(() => parseMenuItems([pageItem, sheet([{ label: 'X', page: 'rules' }])])).toThrow(/does not exist/)
  })
  it('still needs an address when the row names no page, and keeps the address when both are sent with an empty page', () => {
    expect(() => parseMenuItems([sheet([{ label: 'X', url: '' }])])).toThrow(/address/)
    expect(parseMenuItems([sheet([{ label: 'X', url: 'https://a.test/', page: '' }])])[0].rows[0]).toEqual({ label: 'X', url: 'https://a.test/' })
  })
  it('reads stored rows, dropping a page reference that is not a menu id', () => {
    const rows = readMenuItems([sheet([{ label: 'A', page: 'c_fish001' }, { label: 'B', page: 'javascript:1' }])])[0].rows
    expect(rows).toEqual([{ label: 'A', url: '', page: 'c_fish001' }])
  })
})
