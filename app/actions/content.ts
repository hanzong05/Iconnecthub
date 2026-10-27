'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { getAuthEnv } from '@/lib/env'
import { AccessError, assertHubAccess, requireWriter, rtdb, type Writer } from '@/lib/data/write'

export interface ActionState {
  error?: string
  success?: string
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

function fail(e: unknown): ActionState {
  if (e instanceof AccessError) return { error: e.message }
  console.error('[content]', e instanceof Error ? e.message : e)
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

/** Optional push and email to guests through the existing worker. Never blocks or fails the save. */
async function notifyGuests(w: Writer, hubId: string, title: string, body: string): Promise<string> {
  const { pushWorkerUrl } = getAuthEnv()
  if (!pushWorkerUrl) return ''
  const hubName = String(((await rtdb('GET', `hubs_meta/${hubId}/name`, w.token).catch(() => null)) as string | null) ?? hubId)
  const post = (url: string, payload: object) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) }).then((r) => r.ok)
  const [push, email] = await Promise.all([
    post(pushWorkerUrl, { hubId, title, body: body.slice(0, 120), idToken: w.token }).catch(() => false),
    post(`${pushWorkerUrl}/send-email-resend`, { hubId, type: 'announcement', title, body, hubName, idToken: w.token }).catch(() => false),
  ])
  return push || email ? ' Guests were notified.' : ' Saved, but guests could not be notified.'
}

export async function createAnnouncementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    const hubId = await assertHubAccess(w, text(formData, 'hubId'))
    const title = text(formData, 'title')
    const message = text(formData, 'message')
    if (!title || !message) return { error: 'Fill in the title and message.' }
    if (title.length > 120) return { error: 'The title is too long (120 characters at most).' }
    if (message.length > 2000) return { error: 'The message is too long (2000 characters at most).' }

    const created = (await rtdb('POST', `hubs/${hubId}/announcements`, w.token, {
      title,
      message,
      type: 'info',
      active: true,
      hubId,
      createdBy: w.session.email,
      createdAt: new Date().toISOString(),
      expiresAt: null,
    })) as { name?: string }
    if (created.name) await rtdb('PATCH', `hubs/${hubId}/announcements/${created.name}`, w.token, { id: created.name })

    const note = formData.get('notify') === 'on' ? await notifyGuests(w, hubId, title, message) : ''
    revalidatePath('/dashboard')
    return { success: `Announcement published.${note}` }
  } catch (e) {
    return fail(e)
  }
}

export async function createEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    const hubId = await assertHubAccess(w, text(formData, 'hubId'))
    const title = text(formData, 'title')
    const description = text(formData, 'description')
    const fullDesc = text(formData, 'fullDesc')
    const hours = text(formData, 'hours')
    const location = text(formData, 'location')
    if (!title) return { error: 'The event title is required.' }
    if (title.length > 120 || description.length > 300 || fullDesc.length > 3000 || hours.length > 120 || location.length > 120) {
      return { error: 'One of the fields is too long.' }
    }

    let imageUrl = ''
    if (text(formData, 'imageUrl')) {
      const checked = httpsUrl(text(formData, 'imageUrl'))
      if (!checked) return { error: 'The image link is not valid.' }
      imageUrl = checked
    }

    const days = text(formData, 'days').split(',').filter(Boolean)
    if (days.some((d) => !DAYS.includes(d))) return { error: 'Invalid weekday.' }
    const dates = text(formData, 'dates').split(',').filter(Boolean)
    if (dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) return { error: 'Invalid date.' }
    if (dates.length > 366) return { error: 'Too many dates.' }

    const count = (await rtdb('GET', `hubs/${hubId}/activities`, w.token)) as Record<string, unknown> | null
    const created = (await rtdb('POST', `hubs/${hubId}/activities`, w.token, {
      title,
      description,
      fullDesc,
      hours,
      location,
      imageUrl,
      active: formData.get('active') === 'on',
      // Repeating weekdays replace specific dates, as on the hub admin.
      dates: days.length ? [] : [...new Set(dates)].sort(),
      days,
      order: Object.keys(count ?? {}).length,
      hubId,
      createdAt: new Date().toISOString(),
      createdBy: w.session.email,
    })) as { name?: string }
    if (created.name) await rtdb('PATCH', `hubs/${hubId}/activities/${created.name}`, w.token, { id: created.name })

    let note = ''
    if (formData.get('active') === 'on' && formData.get('notify') === 'on') {
      note = await notifyGuests(w, hubId, `New Event: ${title}`, [hours, location].filter(Boolean).join(' · ') || description || 'Check the Events tab for details.')
    }
    revalidatePath('/dashboard')
    return { success: `Event added.${note}` }
  } catch (e) {
    return fail(e)
  }
}

export async function getNewsletterImageAction(hubId: string): Promise<{ url: string | null; error?: string }> {
  try {
    const w = await requireWriter(await getSession())
    await assertHubAccess(w, hubId)
    const url = (await rtdb('GET', `hubs/${hubId}/settings/newsletterImageUrl`, w.token)) as string | null
    return { url: typeof url === 'string' ? url : null }
  } catch (e) {
    return { url: null, error: fail(e).error }
  }
}

export async function saveNewsletterImageAction(hubId: string, url: string | null): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    await assertHubAccess(w, hubId)
    if (url !== null && !httpsUrl(url)) return { error: 'The image link is not valid.' }
    await rtdb('PUT', `hubs/${hubId}/settings/newsletterImageUrl`, w.token, url)
    revalidatePath('/dashboard')
    return { success: url ? 'Newsletter image saved.' : 'Newsletter image removed.' }
  } catch (e) {
    return fail(e)
  }
}

/** Deletes a guest profile and its chat thread (they share the same key), as the hub admin does. */
export async function deleteSubscriberAction(hubId: string, key: string): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    await assertHubAccess(w, hubId)
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(key)) return { error: 'That guest could not be found.' }
    await Promise.all([rtdb('DELETE', `hubs/${hubId}/guests/${key}`, w.token), rtdb('DELETE', `hubs/${hubId}/chats/${key}`, w.token)])
    revalidatePath('/dashboard')
    return { success: 'Guest profile deleted.' }
  } catch (e) {
    return fail(e)
  }
}
