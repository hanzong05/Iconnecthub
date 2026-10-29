import { describe, expect, it } from 'vitest'
import { diffSettings, mergeDraft, readDraftState, toLive } from './settings-draft'
import { parseSettings } from './settings-parse'

const parse = (raw: unknown) => parseSettings(raw, {}, 'h', 'Hub')

describe('mergeDraft', () => {
  it('replaces plain settings and merges the per-item maps', () => {
    const live = { wifi: { ssid: 'a', password: 'b' }, heroImages: { home: 'https://x/h.png', events: 'https://x/e.png' }, visibility: { more: { wifi: false } } }
    const draft = { wifi: { ssid: 'c', password: 'd' }, heroImages: { home: '' }, visibility: { more: { rules: false } } }
    expect(mergeDraft(live, draft)).toEqual({
      wifi: { ssid: 'c', password: 'd' },
      heroImages: { home: '', events: 'https://x/e.png' },
      visibility: { more: { wifi: false, rules: false } },
    })
  })
  it('does not change the live object', () => {
    const live = { wifi: { ssid: 'a', password: 'b' } }
    mergeDraft(live, { wifi: { ssid: 'z', password: 'z' } })
    expect(live.wifi.ssid).toBe('a')
  })
})

describe('diffSettings', () => {
  it('shows only real differences and never prints the WiFi password', () => {
    const live = parse({ wifi: { ssid: 'old', password: 'secret1' } })
    const next = parse({ wifi: { ssid: 'old', password: 'secret2' } })
    const d = diffSettings(live, next)
    expect(d).toHaveLength(1)
    expect(JSON.stringify(d)).not.toMatch(/secret/)
  })
  it('an edit that returns to the live value is no change', () => {
    const raw = { contacts: { phone: '+1 555 0100' } }
    const { draft } = readDraftState(raw, { version: 3, data: { contacts: { phone: '+1 555 0100' } } }, {}, 'h', 'Hub')
    expect(draft.changes).toEqual([])
    expect(draft.version).toBe(3)
  })
  it('describes hidden and shown menu items, and removed pictures', () => {
    const live = parse({ visibility: { more: { wifi: false } }, heroImages: { home: 'https://x/h.png' } })
    const next = parse({ visibility: { more: { rules: false } }, heroImages: {} })
    const d = Object.fromEntries(diffSettings(live, next).map((c) => [c.path, c.after]))
    expect(d['visibility/more']).toMatch(/Rules: hidden/)
    expect(d['visibility/more']).toMatch(/WiFi: shown/)
    expect(d.heroImages).toMatch(/Home: no picture/)
  })
})

describe('toLive', () => {
  it('stores nothing for empty values, so publishing can clear them', () => {
    const l = toLive(parse({}))
    expect(l.contacts).toBeNull()
    expect(l.location).toBeNull()
    expect(l.heroImages).toBeNull()
    expect(l.privacyPolicyUrl).toBeNull()
    expect(l.localGuideUrl).toBeNull()
    expect(l.mapDisplay).toBeNull()
  })
})

describe('built-in item names', () => {
  it('reads only known ids with clean, short names', async () => {
    const { readMoreLabels } = await import('./settings-catalog')
    expect(readMoreLabels({ contact: ' Call  us ', wifi: '', rules: 5, c_x: 'no', chat: 'x'.repeat(41) })).toEqual({ contact: 'Call us' })
    expect(readMoreLabels(null)).toEqual({})
    expect(readMoreLabels(['a'])).toEqual({})
  })

  it('a draft name is laid over live names, and an empty one clears a live name', async () => {
    const { readDraftState } = await import('./settings-draft')
    const live = { moreLabels: { contact: 'Old', wifi: 'Net' } }
    const s = readDraftState(live, { data: { moreLabels: { contact: '', rules: 'House Rules' } } }, {}, 'h', 'H')
    expect(s.effective.moreLabels).toEqual({ wifi: 'Net', rules: 'House Rules' })
    expect(s.live.moreLabels).toEqual({ contact: 'Old', wifi: 'Net' })
    const c = s.draft.changes.find((x) => x.path === 'moreLabels')
    expect(c?.label).toBe('Built-in item names')
    expect(c?.after).toMatch(/Contact Us: default name/)
    expect(c?.after).toMatch(/Rules: "House Rules"/)
  })

  it('no change shows nothing to review', async () => {
    const { readDraftState } = await import('./settings-draft')
    const s = readDraftState({ moreLabels: { wifi: 'Net' } }, { data: { moreLabels: { wifi: 'Net' } } }, {}, 'h', 'H')
    expect(s.draft.changes.find((x) => x.path === 'moreLabels')).toBeUndefined()
  })
})

describe('house rules in the draft', () => {
  it('reads saved rules from a list or a keyed object, dropping rules without a title', async () => {
    const { readHouseRules } = await import('./settings-catalog')
    expect(readHouseRules([{ title: 'A', details: 'a' }, { details: 'no title' }, 'x', null])).toEqual([{ title: 'A', details: 'a' }])
    expect(readHouseRules({ k1: { title: 'B', details: '' } })).toEqual([{ title: 'B', details: '' }])
    expect(readHouseRules(false)).toEqual([])
  })

  it('a draft list replaces the live list, and false clears it', async () => {
    const { readDraftState } = await import('./settings-draft')
    const live = { houseRules: [{ title: 'Old', details: 'o' }] }
    const edited = readDraftState(live, { data: { houseRules: [{ title: 'New', details: 'n' }] } }, {}, 'h', 'H')
    expect(edited.effective.houseRules).toEqual([{ title: 'New', details: 'n' }])
    const c = edited.draft.changes.find((x) => x.path === 'houseRules')
    expect(c?.label).toBe('Rules')
    expect(c?.after).toMatch(/1 rule: New/)
    const cleared = readDraftState(live, { data: { houseRules: false } }, {}, 'h', 'H')
    expect(cleared.effective.houseRules).toEqual([])
    expect(cleared.draft.changes.find((x) => x.path === 'houseRules')?.after).toBe('None')
  })

  it('builds the guest rules page with the link last, only for an https link', async () => {
    const { houseRulesPage } = await import('./settings-catalog')
    const p = houseRulesPage([{ title: 'Pets', details: 'On a leash' }], 'https://x.test/rules')
    expect(p.title).toBe('Rules')
    expect(p.blocks.map((b) => b.type)).toEqual(['rule', 'contact'])
    expect(houseRulesPage([{ title: 'Pets', details: '' }], 'javascript:alert(1)').blocks).toHaveLength(1)
  })
})
