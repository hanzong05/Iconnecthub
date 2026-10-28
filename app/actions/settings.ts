'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { AccessError, assertHubAccess, requireWriter, rtdb, type Writer } from '@/lib/data/write'
import { GROUP_ICON_IDS, PALETTE_FIELDS, QUICK_IDS, VIS_IDS, generatePalette, DEFAULT_BRAND, type VisGroup } from '@/lib/settings-catalog'
import { getCampgrounds } from '@/lib/data/pathfinder'
import { SettingsInvalid, httpsUrl, parseContacts, parseHeroSlot, parseLocation, parseMapDisplay, parseTabOrder } from '@/lib/settings-validate'
import type { ActionState } from './content'

const HEX = /^#[0-9a-fA-F]{6}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fail(e: unknown): ActionState {
  if (e instanceof AccessError || e instanceof SettingsInvalid) return { error: e.message }
  console.error('[settings]', e instanceof Error ? e.message : e)
  return { error: 'Something went wrong. Please try again.' }
}

/** Hub settings are for the Super Admin only. */
async function admin(hubId: string): Promise<{ w: Writer; hubId: string }> {
  const w = await requireWriter(await getSession())
  if (w.session.role !== 'super') throw new AccessError('Only a super admin can change hub settings.')
  return { w, hubId: await assertHubAccess(w, hubId) }
}

async function put(hubId: string, key: string, value: unknown, ok: string): Promise<ActionState> {
  const { w } = await admin(hubId)
  await rtdb('PUT', `hubs/${hubId}/settings/${key}`, w.token, value)
  revalidatePath('/dashboard/settings')
  return { success: ok }
}

export async function saveHubNameAction(hubId: string, name: string): Promise<ActionState> {
  try {
    const { w } = await admin(hubId)
    const n = name.trim()
    if (!n) return { error: 'Hub name is required.' }
    if (n.length > 80) return { error: 'The hub name is too long (80 characters at most).' }
    await rtdb('PATCH', `hubs_meta/${hubId}`, w.token, { name: n })
    revalidatePath('/dashboard', 'layout')
    return { success: 'Hub name updated.' }
  } catch (e) {
    return fail(e)
  }
}

export async function saveWifiAction(hubId: string, ssid: string, password: string): Promise<ActionState> {
  try {
    if (ssid.length > 64 || password.length > 128) return { error: 'The network name or password is too long.' }
    return await put(hubId, 'wifi', { ssid: ssid.trim(), password }, 'WiFi settings updated.')
  } catch (e) {
    return fail(e)
  }
}

export async function saveQuickActionsAction(hubId: string, slots: string[]): Promise<ActionState> {
  try {
    if (!Array.isArray(slots) || slots.length !== 4 || slots.some((x) => !QUICK_IDS.includes(x))) return { error: 'Choose four valid quick actions.' }
    return await put(hubId, 'quickActions', slots, 'Quick actions updated.')
  } catch (e) {
    return fail(e)
  }
}

export async function saveGeofenceAction(hubId: string, enabled: boolean): Promise<ActionState> {
  try {
    return await put(hubId, 'geofenceEnabled', enabled === true, enabled ? '25-mile radius turned on.' : '25-mile radius turned off. Alerts now go to all guests.')
  } catch (e) {
    return fail(e)
  }
}

export async function savePwNotifyAction(hubId: string, enabled: boolean, email: string): Promise<ActionState> {
  try {
    const e = email.trim()
    if (enabled && !e) return { error: 'Enter an email address to notify.' }
    if (e && (!EMAIL.test(e) || e.length > 200)) return { error: 'That email address does not look right.' }
    return await put(hubId, 'passwordResetNotify', { enabled: enabled === true, email: e || null }, enabled ? 'Password reset notifications saved.' : 'Password reset notifications turned off.')
  } catch (err) {
    return fail(err)
  }
}

export async function savePaletteAction(hubId: string, colors: Record<string, string>): Promise<ActionState> {
  try {
    const out: Record<string, string> = {}
    for (const f of PALETTE_FIELDS) {
      const v = String(colors?.[f.key] ?? '')
      if (!HEX.test(v)) return { error: `${f.label} must be a 6-digit color like #1a56db.` }
      out[f.key] = v.toLowerCase()
    }
    out.tabDark = out.dark
    return await put(hubId, 'colorPalette', out, 'Color palette applied.')
  } catch (e) {
    return fail(e)
  }
}

export async function resetPaletteAction(hubId: string): Promise<ActionState> {
  try {
    const p = generatePalette(DEFAULT_BRAND)
    return await put(hubId, 'colorPalette', { ...p, tabDark: p.dark }, 'Color palette reset.')
  } catch (e) {
    return fail(e)
  }
}

export async function saveVisibilityAction(hubId: string, itemId: string, on: boolean): Promise<ActionState> {
  try {
    if (!VIS_IDS.includes(itemId)) return { error: 'Unknown item.' }
    const { w } = await admin(hubId)
    await rtdb('PUT', `hubs/${hubId}/settings/visibility/more/${itemId}`, w.token, on === true)
    return { success: 'Saved.' }
  } catch (e) {
    return fail(e)
  }
}

export async function saveGroupsAction(hubId: string, groups: VisGroup[]): Promise<ActionState> {
  try {
    if (!Array.isArray(groups) || groups.length > 12) return { error: 'Too many groups.' }
    const seen = new Set<string>()
    const clean: VisGroup[] = []
    for (const g of groups) {
      const id = String(g?.id ?? '')
      const label = String(g?.label ?? '').trim()
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || seen.has(id)) return { error: 'Invalid group.' }
      if (!label || label.length > 40) return { error: 'Each group needs a name (40 characters at most).' }
      seen.add(id)
      const items = (Array.isArray(g.items) ? g.items : []).filter((i) => VIS_IDS.includes(i))
      clean.push({ id, label, icon: GROUP_ICON_IDS.includes(g.icon) ? g.icon : 'person', items: [...new Set(items)] })
    }
    // An item can only live in one group.
    const placed = new Set<string>()
    for (const g of clean) g.items = g.items.filter((i) => (placed.has(i) ? false : (placed.add(i), true)))
    const { w } = await admin(hubId)
    await rtdb('PUT', `hubs/${hubId}/settings/visibilityGroups`, w.token, clean)
    return { success: 'Menu groups saved.' }
  } catch (e) {
    return fail(e)
  }
}

export async function saveContactsAction(hubId: string, contacts: unknown): Promise<ActionState> {
  try {
    return await put(hubId, 'contacts', parseContacts(contacts), 'Contacts saved.')
  } catch (e) {
    return fail(e)
  }
}

export async function saveLocationAction(hubId: string, location: unknown): Promise<ActionState> {
  try {
    const l = parseLocation(location)
    return await put(hubId, 'location', l, l ? 'Location saved.' : 'Location cleared.')
  } catch (e) {
    return fail(e)
  }
}

/** The picture itself is uploaded through /api/upload first; this stores its https address (or clears the slot with an empty one). */
export async function saveHeroImageAction(hubId: string, slot: string, url: string): Promise<ActionState> {
  try {
    const key = parseHeroSlot(slot)
    const clean = httpsUrl(url, 'The picture address')
    const { w } = await admin(hubId)
    await rtdb('PUT', `hubs/${hubId}/settings/heroImages/${key}`, w.token, clean || null)
    revalidatePath('/dashboard/settings')
    return { success: clean ? 'Picture saved.' : 'Picture removed.' }
  } catch (e) {
    return fail(e)
  }
}

export async function saveMapDisplayAction(hubId: string, value: unknown): Promise<ActionState> {
  try {
    const { hubId: id } = await admin(hubId)
    let known: string[] | null = null
    if ((value as { mode?: unknown } | null)?.mode === 'pathfinder') known = (await getCampgrounds(id)).map((c) => c.id)
    return await put(id, 'mapDisplay', parseMapDisplay(value, known), 'Map display saved.')
  } catch (e) {
    return fail(e)
  }
}

export async function savePrivacyPolicyAction(hubId: string, url: string): Promise<ActionState> {
  try {
    const clean = httpsUrl(url, 'The privacy policy link')
    return await put(hubId, 'privacyPolicyUrl', clean || null, clean ? 'Privacy policy link saved.' : 'Privacy policy link removed.')
  } catch (e) {
    return fail(e)
  }
}

export async function saveTabOrderAction(hubId: string, order: unknown): Promise<ActionState> {
  try {
    return await put(hubId, 'tabOrder', parseTabOrder(order), 'Tab order saved.')
  } catch (e) {
    return fail(e)
  }
}

/** Marks the hub active or inactive (hubs_meta). Writes both fields the admin reads so they cannot disagree. */
export async function saveHubStatusAction(hubId: string, active: boolean): Promise<ActionState> {
  try {
    const { w, hubId: id } = await admin(hubId)
    const on = active === true
    await rtdb('PATCH', `hubs_meta/${id}`, w.token, { active: on, status: on ? 'active' : 'inactive', updatedAt: new Date().toISOString(), updatedBy: w.session.email })
    revalidatePath('/dashboard', 'layout')
    return { success: on ? 'Hub is active.' : 'Hub is inactive.' }
  } catch (e) {
    return fail(e)
  }
}
