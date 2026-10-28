'use server'

import { getSession } from '@/lib/auth/session'
import { getAuthEnv } from '@/lib/env'
import { AccessError, assertHubAccess, requireWriter, rtdb } from '@/lib/data/write'

export interface PushStatus {
  configured: boolean
  subscribed: boolean
}

/** Whether push is set up on the server, and whether this account already has a subscription saved. */
export async function pushStatusAction(): Promise<PushStatus> {
  try {
    const { pushWorkerUrl } = getAuthEnv()
    const w = await requireWriter(await getSession())
    if (!pushWorkerUrl) return { configured: false, subscribed: false }
    const sub = await rtdb('GET', `users/${w.session.sub}/webPushSub`, w.token)
    return { configured: true, subscribed: sub !== null }
  } catch {
    return { configured: false, subscribed: false }
  }
}

export async function getVapidKeyAction(): Promise<{ key?: string; error?: string }> {
  try {
    await requireWriter(await getSession())
    const { pushWorkerUrl } = getAuthEnv()
    if (!pushWorkerUrl) return { error: "Push isn't configured on the server yet." }
    const res = await fetch(`${pushWorkerUrl}/vapid-public-key`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    const json = (await res.json()) as { publicKey?: string }
    if (!res.ok || typeof json.publicKey !== 'string' || !json.publicKey) return { error: "Push isn't configured on the server yet." }
    return { key: json.publicKey }
  } catch (e) {
    return { error: e instanceof AccessError ? e.message : 'Could not reach the push service.' }
  }
}

interface SubJson {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
  expirationTime?: unknown
}

export async function saveSubscriptionAction(sub: SubJson): Promise<{ saved?: boolean; error?: string }> {
  try {
    const w = await requireWriter(await getSession())
    const { pushWorkerUrl } = getAuthEnv()
    if (!pushWorkerUrl) return { error: "Push isn't configured on the server yet." }
    const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : ''
    const p256dh = sub?.keys?.p256dh
    const auth = sub?.keys?.auth
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 2000 || typeof p256dh !== 'string' || typeof auth !== 'string') return { error: 'That notification subscription is not valid.' }
    const res = await fetch(`${pushWorkerUrl}/save-manager-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: w.token, subscription: { endpoint, keys: { p256dh, auth }, expirationTime: null } }),
      signal: AbortSignal.timeout(15_000),
    })
    const json = (await res.json().catch(() => ({}))) as { saved?: boolean; error?: string }
    if (!res.ok || !json.saved) return { error: json.error ? 'The server could not save the subscription.' : 'Save failed.' }
    return { saved: true }
  } catch (e) {
    return { error: e instanceof AccessError ? e.message : 'Could not reach the push service.' }
  }
}

/**
 * Sends a notification to the signed-in person's own saved device only, marked [TEST], so a manager can see
 * what guests will get before sending it to all of them. Never reaches a guest.
 */
export async function sendTestNotificationAction(hubId: string, title: string, body: string): Promise<{ sent?: boolean; error?: string }> {
  try {
    const w = await requireWriter(await getSession())
    await assertHubAccess(w, hubId)
    const t = title.trim()
    if (!t) return { error: 'Add a title first.' }
    if (t.length > 120 || body.length > 2000) return { error: 'That message is too long.' }
    const { pushWorkerUrl } = getAuthEnv()
    if (!pushWorkerUrl) return { error: "Push isn't configured on the server yet." }
    const res = await fetch(`${pushWorkerUrl}/send-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hubId, title: t, body: body.trim().slice(0, 120), idToken: w.token }),
      signal: AbortSignal.timeout(15_000),
    })
    const json = (await res.json().catch(() => ({}))) as { sent?: number; noDevice?: boolean }
    if (res.ok && json.sent) return { sent: true }
    if (json.noDevice || res.status === 409) return { error: 'No device of yours is saved yet. Turn on notifications on this device (bell button), then try again.' }
    if (res.status === 403) return { error: 'You are not allowed to send for this hub.' }
    if (res.status === 404 || res.status === 405) return { error: 'The push service does not support test sends yet.' }
    return { error: 'The test could not be delivered to your device.' }
  } catch (e) {
    return { error: e instanceof AccessError ? e.message : 'Could not reach the push service.' }
  }
}
