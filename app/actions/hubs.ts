'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { AccessError, assertHubAccess, requireWriter, rtdb } from '@/lib/data/write'
import type { ActionState } from './content'

function fail(e: unknown): ActionState {
  if (e instanceof AccessError) return { error: e.message }
  console.error('[hubs]', e instanceof Error ? e.message : e)
  return { error: 'Something went wrong. Please try again.' }
}

function httpsUrl(v: string): string | null {
  try {
    const u = new URL(v)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Edits a hub's name, location and logo. Super admins only. The hub ID never changes: it links the guest app and all hub data. */
export async function updateHubAction(hubId: string, input: { name: string; location: string; logoUrl: string | null }): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    if (w.session.role !== 'super') return { error: 'Only a super admin can edit hub details.' }
    await assertHubAccess(w, hubId)
    const name = String(input.name ?? '').trim()
    const location = String(input.location ?? '').trim()
    if (!name) return { error: 'Hub name is required.' }
    if (name.length > 120 || location.length > 120) return { error: 'Keep the name and location under 120 characters.' }
    let logoUrl: string | null = null
    if (input.logoUrl) {
      logoUrl = httpsUrl(input.logoUrl)
      if (!logoUrl) return { error: 'The logo link is not valid.' }
    }
    await rtdb('PATCH', `hubs_meta/${hubId}`, w.token, { name, location: location || null, logoUrl, updatedAt: new Date().toISOString(), updatedBy: w.session.email })
    revalidatePath('/dashboard/hubs')
    return { success: 'Hub details updated.' }
  } catch (e) {
    return fail(e)
  }
}

/** Letters, numbers and dashes, 2 to 48 long, never starting with a dash or underscore (hubs/_global is reserved). */
const NEW_HUB_ID = /^[a-z0-9][a-z0-9-]{1,47}$/

/** Creates a hub record (hubs_meta/{id}) so it appears in the Hubs list and can be set up in Settings. Super admins only; never replaces an existing hub. */
export async function createHubAction(input: { id: string; name: string; location: string }): Promise<ActionState & { id?: string }> {
  try {
    const w = await requireWriter(await getSession())
    if (w.session.role !== 'super') return { error: 'Only a super admin can add a hub.' }
    const name = String(input?.name ?? '').replace(/\s+/g, ' ').trim()
    const location = String(input?.location ?? '').replace(/\s+/g, ' ').trim()
    const id = String(input?.id ?? '').trim().toLowerCase()
    if (!name) return { error: 'Hub name is required.' }
    if (name.length > 120 || location.length > 120) return { error: 'Keep the name and location under 120 characters.' }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f<>]/.test(name + location)) return { error: 'The name and location cannot contain special characters like < or >.' }
    if (!NEW_HUB_ID.test(id)) return { error: 'The hub ID must be 2 to 48 letters, numbers or dashes, and cannot start with a dash.' }
    if ((await rtdb('GET', `hubs_meta/${id}`, w.token)) !== null) return { error: 'A hub with that ID already exists. Choose another ID.' }
    const at = new Date().toISOString()
    await rtdb('PUT', `hubs_meta/${id}`, w.token, { name, ...(location ? { location } : {}), active: true, createdAt: at, createdBy: w.session.email })
    revalidatePath('/dashboard/hubs')
    revalidatePath('/dashboard', 'layout')
    return { success: `Hub "${name}" created.`, id }
  } catch (e) {
    return fail(e)
  }
}

/** Saves the hub's WiFi name and password (hubs/{id}/settings/wifi), which the guest app shows. */
export async function saveWifiAction(hubId: string, ssid: string, password: string): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    await assertHubAccess(w, hubId)
    const name = String(ssid ?? '').trim()
    const pass = String(password ?? '')
    if (name.length > 64 || pass.length > 128) return { error: 'The WiFi name or password is too long.' }
    await rtdb('PUT', `hubs/${hubId}/settings/wifi`, w.token, { ssid: name, password: pass })
    revalidatePath(`/dashboard/hubs/${hubId}`)
    return { success: 'WiFi settings updated.' }
  } catch (e) {
    return fail(e)
  }
}
