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
