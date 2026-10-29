'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { AccessError, assertHubAccess, requireWriter, rtdb, type Writer } from '@/lib/data/write'
import { GROUP_ICON_IDS, MORE_LABEL_MAX, PALETTE_FIELDS, QUICK_IDS, VIS_IDS, generatePalette, DEFAULT_BRAND, type VisGroup } from '@/lib/settings-catalog'
import { MENU_LIMITS, parseMenuItems, readMenuItems, type MenuItem } from '@/lib/menu'
import { PageInvalid, toStored } from '@/lib/pages'
import { cleanValues, fillToPage } from '@/lib/template'
import { getCampgrounds } from '@/lib/data/pathfinder'
import { SettingsInvalid, httpsUrl, parseContacts, parseHeroSlot, parseHouseRules, parseLocation, parseMapDisplay, parseTabOrder } from '@/lib/settings-validate'
import { DRAFT_PATHS, readDraftState, toLive, type DraftPath } from '@/lib/settings-draft'
import type { ActionState } from './content'

/** An action result that also carries the draft's new version, so the page can detect when someone else saved in between. */
export type DraftState = ActionState & { version?: number; conflict?: boolean }

class DraftConflict extends Error {}

const HEX = /^#[0-9a-fA-F]{6}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fail(e: unknown): DraftState {
  if (e instanceof DraftConflict) return { error: e.message, conflict: true }
  if (e instanceof AccessError || e instanceof SettingsInvalid || e instanceof PageInvalid) return { error: e.message }
  console.error('[settings]', e instanceof Error ? e.message : e)
  return { error: 'Something went wrong. Please try again.' }
}

/** Hub settings are for the Super Admin only. */
async function admin(hubId: string): Promise<{ w: Writer; hubId: string }> {
  const w = await requireWriter(await getSession())
  if (w.session.role !== 'super') throw new AccessError('Only a super admin can change hub settings.')
  return { w, hubId: await assertHubAccess(w, hubId) }
}

const stamp = () => new Date().toISOString()
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const month = (iso: string) => iso.slice(0, 7)

interface DraftNode { version: number; updatedAt: string; updatedBy: string; data: unknown }
async function readDraftNode(hubId: string, token: string): Promise<DraftNode> {
  const raw = (await rtdb('GET', `hubs/${hubId}/settingsDraft`, token)) as Record<string, unknown> | null
  const d = raw && typeof raw === 'object' ? raw : {}
  return { version: typeof d.version === 'number' ? d.version : 0, updatedAt: String(d.updatedAt ?? ''), updatedBy: String(d.updatedBy ?? ''), data: d.data ?? null }
}

/** Saves values into the draft (not the live hub). `base` is the draft version the page loaded: a different one means someone else saved first. */
async function draft(hubId: string, entries: Record<string, unknown>, ok: string, base: number | undefined): Promise<DraftState> {
  const { w } = await admin(hubId)
  const cur = await readDraftNode(hubId, w.token)
  if (base !== undefined && base !== cur.version) {
    const who = cur.updatedBy ? ` (${cur.updatedBy})` : ''
    throw new DraftConflict(`Someone else saved changes${who} after you opened this page. Reload to see their changes, then try again.`)
  }
  const version = cur.version + 1
  const body: Record<string, unknown> = { version, updatedAt: stamp(), updatedBy: w.session.email }
  for (const [path, value] of Object.entries(entries)) body[`data/${path}`] = value
  await rtdb('PATCH', `hubs/${hubId}/settingsDraft`, w.token, body)
  revalidatePath('/dashboard/settings')
  return { success: `${ok} Saved to the draft; publish to make it live.`, version }
}

/** Direct (not drafted) changes are still written to the history, after the change itself. */
async function audit(w: Writer, hubId: string, action: string, summary: string): Promise<void> {
  const at = stamp()
  try {
    await rtdb('PUT', `hubs/${hubId}/audit/${month(at)}/${newId('a')}`, w.token, { at, by: w.session.email, action, summary })
  } catch (e) {
    console.error('[settings] audit write failed', e instanceof Error ? e.message : e)
  }
}

export async function saveHubNameAction(hubId: string, name: string): Promise<DraftState> {
  try {
    const { w } = await admin(hubId)
    const n = name.trim()
    if (!n) return { error: 'Hub name is required.' }
    if (n.length > 80) return { error: 'The hub name is too long (80 characters at most).' }
    await rtdb('PATCH', `hubs_meta/${hubId}`, w.token, { name: n })
    await audit(w, hubId, 'hub.name', `Hub name changed to "${n}".`)
    revalidatePath('/dashboard', 'layout')
    return { success: 'Hub name updated.' }
  } catch (e) {
    return fail(e)
  }
}

export async function saveWifiAction(hubId: string, ssid: string, password: string, base?: number): Promise<DraftState> {
  try {
    if (ssid.length > 64 || password.length > 128) return { error: 'The network name or password is too long.' }
    return await draft(hubId, { wifi: { ssid: ssid.trim(), password } }, 'WiFi settings updated.', base)
  } catch (e) {
    return fail(e)
  }
}

export async function saveQuickActionsAction(hubId: string, slots: string[], base?: number): Promise<DraftState> {
  try {
    if (!Array.isArray(slots) || slots.length !== 4 || slots.some((x) => !QUICK_IDS.includes(x))) return { error: 'Choose four valid quick actions.' }
    return await draft(hubId, { quickActions: slots }, 'Quick actions updated.', base)
  } catch (e) {
    return fail(e)
  }
}

export async function saveGeofenceAction(hubId: string, enabled: boolean, base?: number): Promise<DraftState> {
  try {
    return await draft(hubId, { geofenceEnabled: enabled === true }, enabled ? '25-mile radius turned on.' : '25-mile radius turned off.', base)
  } catch (e) {
    return fail(e)
  }
}

/** Not drafted: it is a safety switch, so it takes effect at once. When off, no push or email goes to this hub's guests. */
export async function saveGuestNotifyAction(hubId: string, enabled: boolean): Promise<DraftState> {
  try {
    const { w } = await admin(hubId)
    await rtdb('PUT', `hubs/${hubId}/settings/guestNotifications`, w.token, enabled === true)
    await audit(w, hubId, 'guestnotify', enabled ? 'Notifications to guests turned on.' : 'Notifications to guests turned off.')
    revalidatePath('/dashboard/settings')
    return { success: enabled ? 'Guests can be notified.' : 'Guest notifications are off. Nothing will be sent to this hub\'s guests.' }
  } catch (err) {
    return fail(err)
  }
}

/** Not drafted: the notification address is operational, not guest-facing, so it takes effect at once (and is written to the history). */
export async function savePwNotifyAction(hubId: string, enabled: boolean, email: string): Promise<DraftState> {
  try {
    const e = email.trim()
    if (enabled && !e) return { error: 'Enter an email address to notify.' }
    if (e && (!EMAIL.test(e) || e.length > 200)) return { error: 'That email address does not look right.' }
    const { w } = await admin(hubId)
    await rtdb('PUT', `hubs/${hubId}/settings/passwordResetNotify`, w.token, { enabled: enabled === true, email: e || null })
    await audit(w, hubId, 'pwnotify', enabled ? `Password reset notifications sent to ${e}.` : 'Password reset notifications turned off.')
    revalidatePath('/dashboard/settings')
    return { success: enabled ? 'Password reset notifications saved.' : 'Password reset notifications turned off.' }
  } catch (err) {
    return fail(err)
  }
}

function checkedPalette(colors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of PALETTE_FIELDS) {
    const v = String(colors?.[f.key] ?? '')
    if (!HEX.test(v)) throw new SettingsInvalid(`${f.label} must be a 6-digit color like #1a56db.`)
    out[f.key] = v.toLowerCase()
  }
  out.tabDark = out.dark
  return out
}

export async function savePaletteAction(hubId: string, colors: Record<string, string>, base?: number): Promise<DraftState> {
  try {
    return await draft(hubId, { colorPalette: checkedPalette(colors) }, 'Color palette updated.', base)
  } catch (e) {
    return fail(e)
  }
}

export async function resetPaletteAction(hubId: string, base?: number): Promise<DraftState> {
  try {
    const p = generatePalette(DEFAULT_BRAND)
    return await draft(hubId, { colorPalette: { ...p, tabDark: p.dark } }, 'Color palette reset.', base)
  } catch (e) {
    return fail(e)
  }
}

export async function saveVisibilityAction(hubId: string, itemId: string, on: boolean, base?: number): Promise<DraftState> {
  try {
    if (!VIS_IDS.includes(itemId)) return { error: 'Unknown item.' }
    return await draft(hubId, { [`visibility/more/${itemId}`]: on === true }, 'Visibility updated.', base)
  } catch (e) {
    return fail(e)
  }
}

/** Gives a built-in More item its own name, or puts the default name back (empty text). Super Admin only; saved as a draft. */
export async function saveMoreLabelAction(hubId: string, itemId: string, name: string, base?: number): Promise<DraftState> {
  try {
    if (typeof itemId !== 'string' || !VIS_IDS.includes(itemId)) return { error: 'Unknown item.' }
    if (typeof name !== 'string') return { error: 'The name must be text.' }
    const t = name.replace(/\s+/g, ' ').trim()
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f<>]/.test(t)) return { error: 'The name cannot contain special characters like < or >.' }
    if (t.length > MORE_LABEL_MAX) return { error: `The name is too long (${MORE_LABEL_MAX} characters at most).` }
    // An empty value is kept in the draft (not deleted) so a name already live can be cleared; readers ignore empty names.
    return await draft(hubId, { [`moreLabels/${itemId}`]: t }, t ? 'Name updated.' : 'Default name restored.', base)
  } catch (e) {
    return fail(e)
  }
}

/** Checks the menu groups. Built-in items are known by id; custom items must be in `custom` (the ids of the hub's menu items). */
function cleanGroups(groups: VisGroup[], custom: Set<string>): VisGroup[] | string {
  if (!Array.isArray(groups) || groups.length > 12) return 'Too many groups.'
  const seen = new Set<string>()
  const clean: VisGroup[] = []
  for (const g of groups) {
    const id = String(g?.id ?? '')
    const label = String(g?.label ?? '').trim()
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || seen.has(id)) return 'Invalid group.'
    if (!label || label.length > 40) return 'Each group needs a name (40 characters at most).'
    seen.add(id)
    const items = (Array.isArray(g.items) ? g.items : []).filter((i) => VIS_IDS.includes(i) || custom.has(i))
    clean.push({ id, label, icon: GROUP_ICON_IDS.includes(g.icon) ? g.icon : 'person', items: [...new Set(items)] })
  }
  // An item can only live in one group.
  const placed = new Set<string>()
  for (const g of clean) g.items = g.items.filter((i) => (placed.has(i) ? false : (placed.add(i), true)))
  return clean
}

/** The ids of the custom menu items in the draft (or, with no draft change, the live ones). */
async function customIds(hubId: string, token: string): Promise<Set<string>> {
  const node = await readDraftNode(hubId, token)
  const draftItems = (node.data as Record<string, unknown> | null)?.menuItems
  const raw = draftItems !== undefined ? draftItems : await rtdb('GET', `hubs/${hubId}/settings/menuItems`, token)
  return new Set(readMenuItems(raw).map((m) => m.id))
}

export async function saveGroupsAction(hubId: string, groups: VisGroup[], base?: number): Promise<DraftState> {
  try {
    const { w, hubId: id } = await admin(hubId)
    const clean = cleanGroups(groups, await customIds(id, w.token))
    if (typeof clean === 'string') return { error: clean }
    return await draft(id, { visibilityGroups: clean }, 'Menu groups updated.', base)
  } catch (e) {
    return fail(e)
  }
}

/** Saves the custom menu items and where they sit in the groups in one step, so an item is never left in a group after it is deleted. */
export async function saveMenuAction(hubId: string, input: { items: unknown; groups: VisGroup[] }, base?: number): Promise<DraftState> {
  try {
    const { hubId: id } = await admin(hubId)
    const items = parseMenuItems(input?.items)
    const clean = cleanGroups(input?.groups, new Set(items.map((m) => m.id)))
    if (typeof clean === 'string') return { error: clean }
    return await draft(id, { menuItems: items, visibilityGroups: clean }, 'Menu updated.', base)
  } catch (e) {
    return fail(e)
  }
}

/**
 * Loads an import plan (made by scripts/import-hub-menu.mjs from a hub's HTML) as a DRAFT: the menu items go into the
 * settings draft, and each new details page gets its filled-in content as a page draft. Nothing reaches guests until
 * the Super Admin publishes the settings and each page is published. The plan is only data: every item, layout and value
 * is checked here exactly as if it had been typed in, everything is checked before anything is written, and a page that
 * already has live content or a draft is left alone. Items are not placed in any menu group.
 */
export async function importMenuPlanAction(hubId: string, plan: unknown, base?: number): Promise<DraftState & { pages?: number; skipped?: number; menu?: MenuItem[] }> {
  try {
    const { w, hubId: id } = await admin(hubId)
    const p = plan && typeof plan === 'object' ? (plan as Record<string, unknown>) : null
    if (!p || !Array.isArray(p.items) || !p.items.length) return { error: 'That file has no menu items in it.' }
    if (JSON.stringify(plan).length > 400_000) return { error: 'That file is too large to import.' }
    if (p.items.length > MENU_LIMITS.items) return { error: `A plan can have ${MENU_LIMITS.items} items at most.` }
    const incoming = parseMenuItems(p.items)
    // the items already there (the draft if there is one, otherwise the live ones), with the incoming ones replacing same-id items
    const dn = await readDraftNode(id, w.token)
    const dd = dn.data && typeof dn.data === 'object' ? (dn.data as Record<string, unknown>) : null
    const existing: MenuItem[] = readMenuItems(dd && 'menuItems' in dd ? dd.menuItems : await rtdb('GET', `hubs/${id}/settings/menuItems`, w.token))
    const ids = new Set(incoming.map((m) => m.id))
    const merged = parseMenuItems([...existing.filter((m) => !ids.has(m.id)), ...incoming])
    // every page: layout and content checked now, before anything is saved
    const values = p.values && typeof p.values === 'object' ? (p.values as Record<string, unknown>) : {}
    const drafts: { id: string; label: string; body: Record<string, unknown> }[] = []
    for (const m of incoming) {
      if (m.kind !== 'page' || !m.template) continue
      const v = cleanValues(m.template, values[m.id])
      const page = fillToPage(m.template, v)
      drafts.push({ id: m.id, label: m.label, body: { ...toStored(page), values: v } })
    }
    // a page that already has live content or a draft is not touched
    const keep = new Set<string>()
    for (const d of drafts) {
      const [live, dr] = await Promise.all([rtdb('GET', `hubs/${id}/pages/${d.id}`, w.token), rtdb('GET', `hubs/${id}/pagesDraft/${d.id}`, w.token)])
      if (live !== null || dr !== null) keep.add(d.id)
    }
    const r = await draft(id, { menuItems: merged }, `Imported ${incoming.length} menu item${incoming.length === 1 ? '' : 's'}.`, base)
    if (r.error) return r
    const at = stamp()
    let written = 0
    for (const d of drafts) {
      if (keep.has(d.id)) continue
      await rtdb('PUT', `hubs/${id}/pagesDraft/${d.id}`, w.token, { ...d.body, version: 1, baseAt: '', updatedAt: at, updatedBy: w.session.email })
      written++
    }
    await audit(w, id, 'menu.import', `Loaded an import plan: ${incoming.length} menu items, ${written} page drafts${keep.size ? `, ${keep.size} pages already had content and were left alone` : ''}.`)
    revalidatePath('/dashboard/pages')
    return { ...r, pages: written, skipped: keep.size, menu: merged }
  } catch (e) {
    return fail(e)
  }
}

export async function saveContactsAction(hubId: string, contacts: unknown, base?: number): Promise<DraftState> {
  try {
    return await draft(hubId, { contacts: parseContacts(contacts) }, 'Contacts updated.', base)
  } catch (e) {
    return fail(e)
  }
}

/** Saves the rules guests read (title + details). An empty list is stored as false because the draft cannot hold an empty list; it clears the live rules on publish. */
export async function saveHouseRulesAction(hubId: string, rules: unknown, base?: number): Promise<DraftState> {
  try {
    const list = parseHouseRules(rules)
    return await draft(hubId, { houseRules: list.length ? list : false }, list.length ? 'Rules updated.' : 'Rules cleared.', base)
  } catch (e) {
    return fail(e)
  }
}

export async function saveLocationAction(hubId: string, location: unknown, base?: number): Promise<DraftState> {
  try {
    const l = parseLocation(location)
    // false = cleared (the database cannot hold a null inside a draft).
    return await draft(hubId, { location: l ?? false }, l ? 'Location updated.' : 'Location cleared.', base)
  } catch (e) {
    return fail(e)
  }
}

/** The picture itself is uploaded through /api/upload first; this stores its https address (or clears the slot with an empty one). */
export async function saveHeroImageAction(hubId: string, slot: string, url: string, base?: number): Promise<DraftState> {
  try {
    const key = parseHeroSlot(slot)
    const clean = httpsUrl(url, 'The picture address')
    return await draft(hubId, { [`heroImages/${key}`]: clean }, clean ? 'Picture updated.' : 'Picture removed.', base)
  } catch (e) {
    return fail(e)
  }
}

export async function saveMapDisplayAction(hubId: string, value: unknown, base?: number): Promise<DraftState> {
  try {
    const { hubId: id } = await admin(hubId)
    let known: string[] | null = null
    if ((value as { mode?: unknown } | null)?.mode === 'pathfinder') known = (await getCampgrounds(id)).map((c) => c.id)
    return await draft(id, { mapDisplay: parseMapDisplay(value, known) }, 'Map display updated.', base)
  } catch (e) {
    return fail(e)
  }
}

export async function savePrivacyPolicyAction(hubId: string, url: string, base?: number): Promise<DraftState> {
  try {
    const clean = httpsUrl(url, 'The rules link')
    return await draft(hubId, { privacyPolicyUrl: clean }, clean ? 'Rules link updated.' : 'Rules link removed.', base)
  } catch (e) {
    return fail(e)
  }
}

export async function saveLocalGuideAction(hubId: string, url: string, base?: number): Promise<DraftState> {
  try {
    const clean = httpsUrl(url, 'The local guide link')
    return await draft(hubId, { localGuideUrl: clean }, clean ? 'Local guide link updated.' : 'Local guide link removed.', base)
  } catch (e) {
    return fail(e)
  }
}

export async function saveTabOrderAction(hubId: string, order: unknown, base?: number): Promise<DraftState> {
  try {
    return await draft(hubId, { tabOrder: parseTabOrder(order) }, 'Tab order updated.', base)
  } catch (e) {
    return fail(e)
  }
}

/** Marks the hub active or inactive (hubs_meta). Takes effect at once, not drafted; written to the history. */
export async function saveHubStatusAction(hubId: string, active: boolean): Promise<DraftState> {
  try {
    const { w, hubId: id } = await admin(hubId)
    const on = active === true
    await rtdb('PATCH', `hubs_meta/${id}`, w.token, { active: on, status: on ? 'active' : 'inactive', updatedAt: new Date().toISOString(), updatedBy: w.session.email })
    await audit(w, id, 'hub.status', on ? 'Hub set to active.' : 'Hub set to inactive.')
    revalidatePath('/dashboard', 'layout')
    return { success: on ? 'Hub is active.' : 'Hub is inactive.' }
  } catch (e) {
    return fail(e)
  }
}

/** Reads what a publish or restore needs: the live settings, the draft and the hub's own map list. */
async function load(hubId: string) {
  const { w, hubId: id } = await admin(hubId)
  const [rawLive, node, meta, current] = await Promise.all([
    rtdb('GET', `hubs/${id}/settings`, w.token),
    readDraftNode(id, w.token),
    rtdb('GET', `hubs_meta/${id}`, w.token).catch(() => null),
    rtdb('GET', `hubs/${id}/releaseCurrent`, w.token),
  ])
  return { w, id, rawLive, node, meta, current: typeof current === 'string' ? current : null }
}

/** Checks the values about to go live again, on the server, so a stale or hand-edited draft cannot publish something invalid. */
async function validateForPublish(hubId: string, eff: ReturnType<typeof readDraftState>['effective']): Promise<void> {
  parseContacts(eff.contacts)
  parseLocation(eff.location)
  parseTabOrder(eff.tabOrder)
  for (const h of ['home', 'events', 'more'] as const) httpsUrl(eff.heroImages[h], `The ${h} picture`)
  httpsUrl(eff.privacyPolicyUrl, 'The rules link')
  httpsUrl(eff.localGuideUrl, 'The local guide link')
  parseMenuItems(eff.menuItems ?? [])
  parseHouseRules(eff.houseRules ?? [])
  checkedPalette(eff.palette as unknown as Record<string, string>)
  if (eff.mapDisplay.mode === 'pathfinder') {
    const ids = (await getCampgrounds(hubId)).map((c) => c.id)
    try {
      parseMapDisplay(eff.mapDisplay, ids)
    } catch {
      throw new SettingsInvalid('The Path Finder map chosen for Map display no longer exists. Choose another map display, then publish.')
    }
  } else parseMapDisplay(eff.mapDisplay, null)
}

/**
 * Makes the draft live in one atomic update: the changed settings, a new release (a snapshot to restore from),
 * a history entry and the cleared draft are written together, so a failure leaves the hub exactly as it was.
 */
export async function publishSettingsAction(hubId: string, base?: number): Promise<DraftState> {
  try {
    const { w, id, rawLive, node, meta, current } = await load(hubId)
    if (base !== undefined && base !== node.version) {
      throw new DraftConflict(`Someone else saved changes${node.updatedBy ? ` (${node.updatedBy})` : ''} after you opened this page. Reload to review them before publishing.`)
    }
    const state = readDraftState(rawLive, { data: node.data }, meta, id, '')
    if (state.draft.changes.length === 0) {
      if (node.data) await rtdb('PATCH', `hubs/${id}/settingsDraft`, w.token, { data: null, version: node.version + 1, updatedAt: stamp(), updatedBy: w.session.email })
      revalidatePath('/dashboard/settings')
      return { success: 'Nothing to publish: the draft matches what is live.', version: node.version + 1 }
    }
    await validateForPublish(id, state.effective)
    const at = stamp()
    const live = toLive(state.live)
    const next = toLive(state.effective)
    const update: Record<string, unknown> = {}
    // Only the settings that changed are written, so changes made elsewhere to other settings are not overwritten.
    for (const c of state.draft.changes) update[`settings/${c.path}`] = next[c.path as DraftPath] ?? null
    // The first publish also saves what was live before, so it can be restored.
    if (!current) {
      const baseId = newId('r')
      update[`releases/${baseId}`] = { at, by: w.session.email, kind: 'baseline', summary: ['Settings as they were before the first publish.'], snapshot: nullless(live) }
      update[`audit/${month(at)}/${newId('a')}`] = { at, by: w.session.email, action: 'baseline', summary: 'Saved the settings as they were before the first publish.', releaseId: baseId }
    }
    const releaseId = newId('r')
    const summary = state.draft.changes.map((c) => `${c.label}: ${c.after}`)
    update[`releases/${releaseId}`] = { at, by: w.session.email, kind: 'publish', summary, snapshot: nullless(next) }
    update.releaseCurrent = releaseId
    update[`audit/${month(at)}/${newId('a')}`] = { at: at, by: w.session.email, action: 'publish', summary: summary.join(' · ').slice(0, 600), releaseId }
    update['settingsDraft/data'] = null
    update['settingsDraft/version'] = node.version + 1
    update['settingsDraft/updatedAt'] = at
    update['settingsDraft/updatedBy'] = w.session.email
    await rtdb('PATCH', `hubs/${id}`, w.token, update)
    revalidatePath('/dashboard/settings')
    return { success: `Published ${state.draft.changes.length} change${state.draft.changes.length === 1 ? '' : 's'}. Guests see them the next time they open the hub.`, version: node.version + 1 }
  } catch (e) {
    return fail(e)
  }
}

/** Throws away the unpublished draft; the live hub is untouched. */
export async function discardDraftAction(hubId: string, base?: number): Promise<DraftState> {
  try {
    const { w, id, node } = await load(hubId)
    if (base !== undefined && base !== node.version) throw new DraftConflict('The draft changed after you opened this page. Reload to see the latest.')
    const at = stamp()
    await rtdb('PATCH', `hubs/${id}`, w.token, {
      'settingsDraft/data': null,
      'settingsDraft/version': node.version + 1,
      'settingsDraft/updatedAt': at,
      'settingsDraft/updatedBy': w.session.email,
      [`audit/${month(at)}/${newId('a')}`]: { at, by: w.session.email, action: 'discard', summary: 'Discarded the unpublished draft.' },
    })
    revalidatePath('/dashboard/settings')
    return { success: 'Draft discarded.', version: node.version + 1 }
  } catch (e) {
    return fail(e)
  }
}

/** Puts an earlier published version back live (and clears the draft). Sent notifications, guests and analytics are not undone. */
export async function restoreReleaseAction(hubId: string, releaseId: string): Promise<DraftState> {
  try {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(releaseId))) return { error: 'Choose a version to restore.' }
    const { w, id, node, current } = await load(hubId)
    const rel = (await rtdb('GET', `hubs/${id}/releases/${releaseId}`, w.token)) as { at?: string; snapshot?: unknown } | null
    if (!rel || typeof rel !== 'object' || !rel.snapshot || typeof rel.snapshot !== 'object') return { error: 'That version no longer exists.' }
    const snap = rel.snapshot as Record<string, unknown>
    const at = stamp()
    const update: Record<string, unknown> = {}
    for (const path of DRAFT_PATHS) update[`settings/${path}`] = snapshotValue(snap, path)
    const newRelease = newId('r')
    const when = typeof rel.at === 'string' ? rel.at.slice(0, 16).replace('T', ' ') + ' UTC' : 'an earlier time'
    update[`releases/${newRelease}`] = { at, by: w.session.email, kind: 'restore', restoredFrom: releaseId, summary: [`Restored the version from ${when}.`], snapshot: snap }
    update.releaseCurrent = newRelease
    update[`audit/${month(at)}/${newId('a')}`] = { at, by: w.session.email, action: 'restore', summary: `Restored the version from ${when}.`, releaseId: newRelease }
    update['settingsDraft/data'] = null
    update['settingsDraft/version'] = node.version + 1
    update['settingsDraft/updatedAt'] = at
    update['settingsDraft/updatedBy'] = w.session.email
    if (current === releaseId) return { error: 'That version is already the live one.' }
    await rtdb('PATCH', `hubs/${id}`, w.token, update)
    revalidatePath('/dashboard/settings')
    return { success: `Restored the version from ${when}.`, version: node.version + 1 }
  } catch (e) {
    return fail(e)
  }
}

/** Snapshot keys cannot contain "/" (it is a path separator in the database), so "visibility/more" is stored as "visibility__more". */
const snapKey = (path: string) => path.replace(/\//g, '__')
function snapshotValue(snap: Record<string, unknown>, path: string): unknown {
  return snap[snapKey(path)] ?? null
}

/** Release snapshots are stored by path with nulls left out (the database drops them anyway). */
function nullless(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[snapKey(k)] = v
  return out
}
