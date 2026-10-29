import { describe, expect, it } from 'vitest'
import { VIS_IDS } from '@/lib/settings-catalog'
import { parseMenuItems } from '@/lib/menu'
import { PAGE_IDS } from '@/lib/pages'
import { cleanValues, fillToPage, readTemplate } from '@/lib/template'
import { BUILT_IN, buildPlan, handlerTarget, readMoreDefs } from './import-hub-menu.mjs'

/** A small hub page in the shape of the live hubs: a picker with two rows (one page, one address), a details page and a channel list. */
const HUB = `
<script>
const MORE_ITEM_DEFS = {
  wifi: {
    bg: '#e0f7fa', onclick: 'openWifi()',
    title: 'WiFi', sub: 'x',
  },
  trails: {
    bg: '#fff', onclick: 'openTrailsPicker()',
    title: 'Park Trails &amp; More', sub: 'x',
  },
  cable: {
    bg: '#fff', onclick: 'openCableChannels()',
    title: 'Cable Channels', sub: 'x',
  },
  bookNow: {
    bg: '#fff', onclick: 'openBookingWebview()',
    title: 'Book Now', sub: 'x',
  },
};
const DEFAULT_MORE_ORDER = ['wifi', 'trails', 'cable', 'bookNow'];
function openTrailsPicker() { document.getElementById('trailsOverlay').classList.add('open'); }
function openLoop() { const el = document.getElementById('tab-loop'); el.style.display = 'flex'; }
function openCableChannels() { document.getElementById('tab-cable').classList.add('active'); }
window.openBookingWebview = function () {
  window.open('https://book.example.com/stay', '_blank', 'noopener,noreferrer');
};
</script>
<div class="notif-overlay" id="trailsOverlay">
  <div class="notif-sheet">
    <div class="notif-sheet-header"><div class="notif-sheet-title">Trails</div></div>
    <div style="padding:8px 0 4px;">
      <div onclick="closeTrailsPicker();openLoop();" style="display:flex;">
        <div style="flex:1;"><div style="font-size:15px;font-weight:600;">The Loop</div></div>
      </div>
      <div onclick="window.open('https://maps.example.com/trails','_blank')" style="display:flex;">
        <div style="flex:1;"><div style="font-size:15px;font-weight:600;">Trail map</div></div>
      </div>
    </div>
  </div>
</div>
<div id="tab-loop" style="display:none;">
  <div class="contact-header"><h2>The Loop</h2><p>3 miles</p></div>
  <div class="contact-body">
    <div class="contact-section">
      <img src="" alt="Loop">
      <div style="padding:14px;">Add a description of the Loop here.</div>
      <button onclick="openBookingWebview()">Book
        Now</button>
    </div>
    <div class="contact-section">
      <div class="contact-section-label">Good to know</div>
      <div style="padding:14px;">Open <strong>dawn to dusk</strong>.<br>Dogs on leash.</div>
    </div>
  </div>
</div>
<div id="tab-cable">
  <div class="contact-header"><h2>Cable Channels</h2><p>Guide</p></div>
  <div class="contact-body">
    <div class="cable-channel-section">
      <div class="cable-section-label">Channels</div>
      <div class="cable-channel-row"><div class="cable-channel-num">2</div><div class="cable-channel-name">CBS</div></div>
      <div class="cable-channel-row"><div class="cable-channel-num">5</div><div class="cable-channel-name">FOX</div></div>
    </div>
  </div>
</div>`

describe('import-hub-menu: reading a hub page', () => {
  it('reads the More items in the hub order with their names and handlers', () => {
    const { defs, order } = readMoreDefs(HUB)
    expect(order).toEqual(['wifi', 'trails', 'cable', 'bookNow'])
    expect(defs.trails).toEqual(['Park Trails & More', 'openTrailsPicker()'])
  })
  it('tells a picker, a details page and an address apart', () => {
    expect(handlerTarget(HUB, 'openTrailsPicker()')).toEqual({ kind: 'sheet', id: 'trailsOverlay' })
    expect(handlerTarget(HUB, 'openLoop()')).toEqual({ kind: 'page', id: 'tab-loop' })
    expect(handlerTarget(HUB, 'openBookingWebview()')).toEqual({ kind: 'link', url: 'https://book.example.com/stay' })
    expect(handlerTarget(HUB, 'openNothing()')).toBeNull()
  })
  it('builds items for what the admin does not have, and skips built-in items', () => {
    const plan = buildPlan(HUB, 'demo')
    expect(plan.items.map((i) => `${i.id}:${i.kind}`)).toEqual(['c_loop:page', 'c_trails:sheet', 'c_cable:page'])
    const trails = plan.items.find((i) => i.id === 'c_trails')
    expect(trails?.rows).toEqual([{ label: 'The Loop', url: '', page: 'c_loop' }, { label: 'Trail map', url: 'https://maps.example.com/trails' }])
  })
  it('turns a details page into a layout plus its filled-in content, leaving placeholder text empty', () => {
    const plan = buildPlan(HUB)
    const loop = plan.items.find((i) => i.id === 'c_loop')
    expect(loop?.template?.slots.map((s) => `${s.type}:${s.label}`)).toEqual(['header:Title', 'hero:Hero picture', 'description:About', 'button:Book Now', 'description:Good to know'])
    const v = plan.values.c_loop
    expect(Object.values(v)[0]).toEqual({ title: 'The Loop', subtitle: '3 miles' })
    expect(Object.values(v)[4]).toEqual({ title: 'Good to know', body: 'Open **dawn to dusk**.\nDogs on leash.' })
    expect(Object.values(v)[3]).toEqual({ label: 'Book Now', value: 'https://book.example.com/stay' })
    expect(plan.notes.some((n) => /placeholder/.test(n))).toBe(true)
  })
  it('reads channel rows with their numbers', () => {
    const plan = buildPlan(HUB)
    const rows = (Object.values(plan.values.c_cable)[1] as { rows: unknown[] }).rows
    expect(rows).toEqual([{ title: 'CBS', body: 'Channel 2' }, { title: 'FOX', body: 'Channel 5' }])
  })
  it('gives the same plan every time, so running it twice replaces rather than duplicates', () => {
    expect(JSON.stringify(buildPlan(HUB))).toBe(JSON.stringify(buildPlan(HUB)))
  })
})

describe('import-hub-menu: the plan is accepted by the admin checks', () => {
  const plan = buildPlan(HUB)
  it('passes the menu item checks and every page layout and content check', () => {
    const items = parseMenuItems(plan.items)
    expect(items).toHaveLength(3)
    for (const item of items.filter((i) => i.kind === 'page')) {
      const t = readTemplate(item.template)
      expect(t, item.label).not.toBeNull()
      const page = fillToPage(t!, cleanValues(t!, plan.values[item.id]))
      expect(page.title).toBeTruthy()
    }
  })
  it('only uses ids that cannot clash with the built-in items', () => {
    for (const i of plan.items) expect(i.id).toMatch(/^c_[a-z0-9]{3,24}$/)
  })
})

describe('import-hub-menu: built-in list stays in step with the admin', () => {
  it('names only items the admin knows', () => {
    for (const id of BUILT_IN) expect([...VIS_IDS, ...PAGE_IDS], id).toContain(id)
  })
  it('lists every item that has its own page or switch except those that are About-less pickers the hubs build themselves', () => {
    // amenities and cable exist in the admin as switches only: their content is hardcoded in each hub, so they are importable.
    expect(BUILT_IN).not.toContain('amenities')
    expect(BUILT_IN).not.toContain('cable')
  })
})
