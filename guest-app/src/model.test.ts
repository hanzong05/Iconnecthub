import { describe, expect, it } from 'vitest'
import type { MenuItem } from '@/lib/menu'
import { dateRangeLabel, dateStrip, eventsOnDate, hubEvents, liveAnnouncements, menuGroups, publishedPages, tabsFor, telHref, timeAgo, upcomingEvents, validDb, validHub } from './model'
import { DEFAULT_VIS_GROUPS } from '@/lib/settings-catalog'

const NOW = Date.parse('2026-10-28T12:00:00Z')

describe('liveAnnouncements', () => {
  it('hides inactive, expired and not-yet-published ones and sorts newest first', () => {
    const out = liveAnnouncements(
      {
        a: { title: 'Old', message: 'm', active: true, createdAt: '2026-10-01T00:00:00Z' },
        b: { title: 'New', message: 'm', active: true, createdAt: '2026-10-20T00:00:00Z' },
        c: { title: 'Off', message: 'm', active: false, createdAt: '2026-10-25T00:00:00Z' },
        d: { title: 'Expired', message: 'm', active: true, createdAt: '2026-10-02T00:00:00Z', expiresAt: '2026-10-10T00:00:00Z' },
        e: { title: 'Later', message: 'm', active: true, createdAt: '2026-10-02T00:00:00Z', scheduledAt: '2026-11-01T00:00:00Z' },
      },
      NOW,
    )
    expect(out.map((a) => a.title)).toEqual(['New', 'Old'])
  })
  it('copes with nothing, junk and odd types', () => {
    expect(liveAnnouncements(null, NOW)).toEqual([])
    expect(liveAnnouncements({ x: 5, y: { title: 't', type: 'weird', createdAt: 'nope' } }, NOW)[0].type).toBe('info')
  })
})

describe('events as the live hubs read them', () => {
  const evs = hubEvents({
    past: { title: 'Past', dates: ['2026-10-01'] },
    today: { title: 'Today', dates: ['2026-10-28', '2026-11-05'], hours: '9-5', order: 2 },
    fest: { title: 'Festival', dates: ['2026-10-30', '2026-10-31', '2026-11-01'] },
    daily: { title: 'Daily', days: ['Daily'], order: 1 },
    wed: { title: 'Wednesdays', days: ['Wed'] },
    none: { title: 'No schedule' },
    off: { title: 'Off', active: false, days: ['Daily'] },
    img: { title: 'Img', days: ['Daily'], imageUrl: 'javascript:alert(1)' },
  })
  it('lists a day by dates first, then by weekday, and ignores inactive ones', () => {
    expect(eventsOnDate(evs, '2026-10-28').map((e) => e.title)).toEqual(['Img', 'Wednesdays', 'Daily', 'Today'])
    expect(eventsOnDate(evs, '2026-10-29').map((e) => e.title)).toEqual(['Img', 'Daily'])
    expect(evs.find((e) => e.title === 'Img')?.imageUrl).toBe('')
    expect(evs.some((e) => e.title === 'Off')).toBe(false)
  })
  it('groups a multi-day event into one upcoming card with a range label', () => {
    const up = upcomingEvents(evs, '2026-10-28', 10)
    const fest = up.find((u) => u.event.title === 'Festival')
    expect(fest?.dates).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
    expect(dateRangeLabel(fest!.dates)).toBe('Oct 30–Nov 1')
    expect(dateRangeLabel(['2026-10-30'])).toBe('Fri, Oct 30')
    expect(dateRangeLabel(['2026-10-30', '2026-11-05'])).toBe('Oct 30 +1 more')
  })
  it('builds the date strip from a week back to a month ahead', () => {
    const strip = dateStrip('2026-10-28')
    expect(strip).toHaveLength(38)
    expect(strip[7]).toEqual({ iso: '2026-10-28', day: 'Today', num: 28, today: true })
    expect(strip[0].iso).toBe('2026-10-21')
  })
  it('says how long ago something was posted', () => {
    expect(timeAgo(NOW - 30_000, NOW)).toBe('Just now')
    expect(timeAgo(NOW - 5 * 60_000, NOW)).toBe('5m ago')
    expect(timeAgo(NOW - 3 * 3600_000, NOW)).toBe('3h ago')
    expect(timeAgo(NOW - 2 * 86400_000, NOW)).toBe('2d ago')
    expect(timeAgo(0, NOW)).toBe('')
  })
})

describe('tabs, menu and links', () => {
  it('keeps Map second and Local Guide fourth and follows the saved order', () => {
    expect(tabsFor(['more', 'home', 'events'])).toEqual(['more', 'map', 'home', 'guide', 'events'])
    expect(tabsFor(['home', 'home', 'x'])).toEqual(['home', 'map', 'events', 'guide', 'more'])
  })
  it('removes hidden items and empty groups', () => {
    const g = DEFAULT_VIS_GROUPS
    const hideAllHelp = Object.fromEntries(['contact', 'chat', 'review'].map((i) => [i, false]))
    const out = menuGroups({ groups: g, visibility: { ...hideAllHelp, wifi: false }, menuItems: [] })
    expect(out.find((x) => x.id === 'help')).toBeUndefined()
    expect(out.find((x) => x.id === 'campinfo')?.items.map((i) => i.id)).not.toContain('wifi')
  })
  it('shows custom items by their own name and hides hidden, empty or unknown ones', () => {
    const item = (o: Partial<MenuItem> & { id: string }): MenuItem => ({ label: 'Thing', icon: 'info', kind: 'page', url: '', rows: [], shown: true, ...o })
    const menuItems = [
      item({ id: 'c_aaa1', label: 'Pumpkin Patch' }),
      item({ id: 'c_aaa2', label: 'Hidden', shown: false }),
      item({ id: 'c_aaa3', label: 'No address', kind: 'link' }),
      item({ id: 'c_aaa4', label: 'Empty sheet', kind: 'sheet' }),
      item({ id: 'c_aaa5', label: 'Suntex', kind: 'link', url: 'https://suntex.com/' }),
    ]
    const groups = [{ id: 'g1', icon: 'person', label: 'More', items: ['wifi', 'c_aaa1', 'c_aaa2', 'c_aaa3', 'c_aaa4', 'c_aaa5', 'c_gone'] }]
    const out = menuGroups({ groups, visibility: {}, menuItems })
    expect(out[0].items.map((i) => `${i.id}:${i.label}`)).toEqual(['wifi:WiFi', 'c_aaa1:Pumpkin Patch', 'c_aaa5:Suntex'])
  })
  it('reads published pages for custom items too, and ignores unknown names', () => {
    const page = { title: 'Pumpkin Patch', subtitle: '', banner: '', blocks: [{ id: 'b1', type: 'rule', title: 'Open', body: 'Daily' }] }
    const out = publishedPages({ c_aaa1: page, evil: page, rules: page })
    expect(Object.keys(out).sort()).toEqual(['c_aaa1', 'rules'])
  })
  it('builds safe tel links and validates embed attributes', () => {
    expect(telHref('+1 (555) 010-0199')).toBe('tel:+15550100199')
    expect(telHref('abc')).toBe('')
    expect(validHub('stone-mountain-park-hub')).toBe(true)
    expect(validHub('a/../b')).toBe(false)
    expect(validDb('https://x.firebaseio.com/path')).toBe('https://x.firebaseio.com')
    expect(validDb('http://evil.test')).toBeNull()
    expect(validDb('javascript:alert(1)')).toBeNull()
    expect(validDb('http://localhost:4477')).toBe('http://localhost:4477')
  })
})

describe('publishedPages', () => {
  it('returns only known, non-empty pages and drops bad blocks', () => {
    const out = publishedPages({
      rules: { title: 'Rules', n: 2, blocks: [{ id: 'a', type: 'rule', title: 'Quiet hours', body: '10pm' }, { id: 'b', type: 'contact', label: 'x', kind: 'link', value: 'javascript:alert(1)' }] },
      reservations: { title: 'Only a title', subtitle: '', banner: '', n: 0 },
      hacked: { title: 'x', n: 1, blocks: [{ id: 'a', type: 'rule', title: 't', body: 'b' }] },
    })
    expect(Object.keys(out)).toEqual(['rules'])
    expect(out.rules.blocks).toHaveLength(1)
  })
  it('handles an empty database', () => {
    expect(publishedPages(null)).toEqual({})
  })
})
