import { describe, expect, it } from 'vitest'
import { SettingsInvalid, httpsUrl, parseContacts, parseExtraContacts, parseLocation, parseMapDisplay, parseTabOrder } from './settings-validate'

describe('settings validation', () => {
  it('accepts only https links', () => {
    expect(httpsUrl('', 'x')).toBe('')
    expect(httpsUrl('https://a.com/p', 'x')).toBe('https://a.com/p')
    for (const v of ['http://a.com', 'javascript:alert(1)', 'https://u:p@a.com', 'nope', 5]) expect(() => httpsUrl(v, 'x')).toThrow(SettingsInvalid)
  })
  it('checks contacts', () => {
    expect(parseContacts({ name: 'Park Office', phone: '+1 (555) 010-2000', email: 'a@b.co', website: 'https://x.com', address: ' 1 Main ' }).address).toBe('1 Main')
    expect(() => parseContacts({ email: 'bad' })).toThrow()
    expect(() => parseContacts({ phone: 'abc' })).toThrow()
    expect(() => parseContacts({ website: 'http://x.com' })).toThrow()
  })
  it('checks extra contacts (emergency, socials)', () => {
    expect(parseExtraContacts(undefined)).toEqual([])
    const ok = parseExtraContacts([{ label: ' Emergency ', kind: 'phone', value: '911' }, { label: 'Facebook', kind: 'link', value: 'https://facebook.com/camp' }, { label: 'Office', kind: 'email', value: 'a@b.co' }])
    expect(ok[0].label).toBe('Emergency')
    expect(() => parseExtraContacts([{ label: '', kind: 'phone', value: '911' }])).toThrow()
    expect(() => parseExtraContacts([{ label: 'X', kind: 'link', value: 'http://x.com' }])).toThrow(/https/)
    expect(() => parseExtraContacts([{ label: 'X', kind: 'link', value: 'javascript:alert(1)' }])).toThrow()
    expect(() => parseExtraContacts([{ label: 'X', kind: 'fax', value: '1' }])).toThrow()
    expect(() => parseExtraContacts(Array.from({ length: 13 }, () => ({ label: 'a', kind: 'phone', value: '911' })))).toThrow(/at most/)
    expect(parseContacts({ extra: [{ label: 'E', kind: 'phone', value: '911' }] }).extra).toHaveLength(1)
  })
  it('checks coordinates', () => {
    expect(parseLocation({ lat: '', lon: '' })).toBeNull()
    expect(parseLocation({ lat: '44.1', lon: '-73.2' })).toEqual({ lat: 44.1, lon: -73.2 })
    expect(() => parseLocation({ lat: 91, lon: 0 })).toThrow()
    expect(() => parseLocation({ lat: 10, lon: '' })).toThrow()
  })
  it("checks the map display against the hub's own maps", () => {
    expect(parseMapDisplay({ mode: 'none' }, null).mode).toBe('none')
    expect(parseMapDisplay({ mode: 'pathfinder', campgroundId: 'abc' }, ['abc']).campgroundId).toBe('abc')
    expect(() => parseMapDisplay({ mode: 'pathfinder', campgroundId: 'other-hub-map' }, ['abc'])).toThrow(/does not exist/)
    expect(() => parseMapDisplay({ mode: 'embed', embedUrl: '' }, null)).toThrow()
    expect(() => parseMapDisplay({ mode: 'bogus' }, null)).toThrow()
  })
  it('checks tab order', () => {
    expect(parseTabOrder(['more', 'home', 'events'])).toHaveLength(3)
    expect(() => parseTabOrder(['home', 'home', 'more'])).toThrow()
    expect(() => parseTabOrder(['home'])).toThrow()
  })
})
