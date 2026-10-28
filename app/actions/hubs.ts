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
