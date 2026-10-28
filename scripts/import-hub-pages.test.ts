import { describe, expect, it } from 'vitest'
import { validatePage } from '@/lib/pages'
import { extractPages, toText } from './import-hub-pages.mjs'

const HTML = `
<div id="tab-rules">
  <div class="contact-header"><div class="contact-back">Back</div><h2>Rules &amp; Regulations</h2><p>Park policies</p></div>
  <div class="contact-body">
    <div class="rules-section" style="border-left:4px solid #ef4444;">
      <div class="rules-section-label" style="color:#ef4444;">🚨 Emergency Numbers</div>
      <div class="rules-rule" style="border-top:none;"><div class="rules-rule-title">Police</div><div class="rules-rule-body"><a href="tel:7704135333">770-413-5333</a></div></div>
    </div>
    <div class="rules-section">
      <div class="rules-section-label">Check-In</div>
      <div class="rules-rule"><div class="rules-rule-title">Time</div><div class="rules-rule-body"><strong>2:00 PM</strong> &mdash; ID required.<br>Lodging &amp; RVs <script>alert(1)</script></div></div>
    </div>
  </div>
</div>
<div class="notif-overlay" id="reserveOverlay"><div class="notif-sheet">
  <div class="notif-sheet-header"><div class="notif-sheet-title">Choose Your Stay</div><button>x</button></div>
  <div>
    <div onclick="window.open('https://example.com/camp/','_blank','noopener,noreferrer');closeReservePicker();"><div><svg></svg></div><div style="flex:1;"><div style="font-size:15px;font-weight:600;">Campground</div><div style="font-size:12px;color:#6b7280;">RV &amp; Tent</div></div></div>
    <div onclick="window.open('javascript:alert(1)','_blank')"><div style="font-size:15px;">Evil</div></div>
  </div>
</div></div>`

describe('import-hub-pages (dry run parser)', () => {
  const pages = extractPages(HTML)
  it('reads the Rules page into sections, phone contacts and rules', () => {
    expect(pages.rules.title).toBe('Rules & Regulations')
    expect(pages.rules.blocks.map((b) => b.type)).toEqual(['section', 'contact', 'section', 'rule'])
    expect(pages.rules.blocks[0]).toMatchObject({ title: '🚨 Emergency Numbers', tone: 'alert' })
    expect(pages.rules.blocks[1]).toMatchObject({ label: 'Police', kind: 'phone', value: '770-413-5333' })
    expect(pages.rules.blocks[3]).toMatchObject({ title: 'Time' })
  })
  it('keeps bold and line breaks and never carries markup or script text as HTML', () => {
    const body = String((pages.rules.blocks[3] as { body: string }).body)
    expect(body).toContain('**2:00 PM** — ID required.\n')
    expect(body).not.toMatch(/<[a-z]/i)
  })
  it('reads reservation rows and ignores non-https targets', () => {
    expect(pages.reservations.blocks).toHaveLength(1)
    expect(pages.reservations.blocks[0]).toMatchObject({ kind: 'link', value: 'https://example.com/camp/', label: 'Campground · RV & Tent' })
  })
  it('produces pages that pass the same checks as the admin editor', () => {
    expect(() => validatePage(pages.rules)).not.toThrow()
    expect(() => validatePage(pages.reservations)).not.toThrow()
  })
  it('finds nothing in a page without those sections', () => {
    expect(extractPages('<div>hello</div>')).toEqual({})
  })
  it('decodes entities', () => {
    expect(toText('A&nbsp;&amp;&nbsp;B&#33;')).toBe('A & B!')
  })
})
