'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { getAuthEnv } from '@/lib/env'
import { getChatMessages, getChatThreads, type ChatMessage, type ChatThread } from '@/lib/data/content'
import { AccessError, assertHubAccess, requireWriter, rtdb, type Writer } from '@/lib/data/write'
import { notifyGuests } from '@/lib/notify'
import type { ActionState } from './content'

const TYPES = ['info', 'warning', 'alert', 'success']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const field = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const ID = /^[A-Za-z0-9_-]{1,128}$/

function fail(e: unknown): ActionState {
  if (e instanceof AccessError) return { error: e.message }
  console.error('[hubcontent]', e instanceof Error ? e.message : e)
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

/** A hub the user may act on. Posts to every hub (_global) are for super admins only. */
async function scope(w: Writer, hubId: string): Promise<string> {
  if (hubId === '_global') {
    if (w.session.role !== 'super') throw new AccessError('Only a super admin can change posts for every hub.')
    return hubId
  }
  return assertHubAccess(w, hubId)
}

const isoOrNull = (v: string): string | null => {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

// ─── Announcements ──────────────────────────────────────────────────────────

/** Creates or edits an announcement. With an id it edits; without one it creates (and may notify guests). */
export async function saveAnnouncementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    const hubId = await scope(w, field(formData, 'hubId'))
    const id = field(formData, 'id')
    const title = field(formData, 'title')
    const message = field(formData, 'message')
    const type = field(formData, 'type') || 'info'
    const active = formData.get('active') === 'on'
    if (!title || !message) return { error: 'Fill in the title and message.' }
    if (title.length > 120) return { error: 'The title is too long (120 characters at most).' }
    if (message.length > 2000) return { error: 'The message is too long (2000 characters at most).' }
    if (!TYPES.includes(type)) return { error: 'Choose a type.' }

    const expiresRaw = field(formData, 'expiresAt')
    const scheduledRaw = field(formData, 'scheduledAt')
    const expiresAt = isoOrNull(expiresRaw)
    const scheduledAt = !active ? isoOrNull(scheduledRaw) : null
    if (expiresRaw && !expiresAt) return { error: 'The expiry time is not valid.' }
    if (scheduledRaw && !active && !scheduledAt) return { error: 'The scheduled time is not valid.' }
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) return { error: "The expiry time must be in the future — guests won't see a post that has already expired." }
    if (scheduledAt && Date.parse(scheduledAt) <= Date.now()) return { error: 'The scheduled time must be in the future.' }

    if (id) {
      if (!ID.test(id)) return { error: 'That announcement could not be found.' }
      await rtdb('PATCH', `hubs/${hubId}/announcements/${id}`, w.token, { title, message, type, active, expiresAt, scheduledAt, updatedAt: new Date().toISOString(), updatedBy: w.session.email })
      revalidatePath('/dashboard/announcements')
      return { success: 'Announcement updated.' }
    }

    const created = (await rtdb('POST', `hubs/${hubId}/announcements`, w.token, {
      title,
      message,
      type,
      active,
      hubId,
      createdBy: w.session.email,
      createdAt: new Date().toISOString(),
      expiresAt,
      scheduledAt,
    })) as { name?: string }
    if (created.name) await rtdb('PATCH', `hubs/${hubId}/announcements/${created.name}`, w.token, { id: created.name })

    const note = active && hubId !== '_global' && formData.get('notify') === 'on' ? await notifyGuests(w, hubId, { pushTitle: title, pushBody: message, emailType: 'announcement', emailTitle: title, emailBody: message }) : ''
    revalidatePath('/dashboard/announcements')
    revalidatePath('/dashboard')
    const when = scheduledAt ? ` It will go live on ${new Date(scheduledAt).toUTCString().replace(' GMT', ' UTC')}.` : ''
    return { success: `${active ? 'Announcement published.' : scheduledAt ? 'Announcement scheduled.' : 'Saved as a draft.'}${when}${note}` }
  } catch (e) {
    return fail(e)
  }
}

export async function toggleAnnouncementAction(hubId: string, id: string, active: boolean): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    await scope(w, hubId)
    if (!ID.test(id)) return { error: 'That announcement could not be found.' }
    await rtdb('PATCH', `hubs/${hubId}/announcements/${id}`, w.token, { active: Boolean(active), ...(active ? { scheduledAt: null } : {}) })
    revalidatePath('/dashboard/announcements')
    return { success: active ? 'Announcement is live.' : 'Announcement is hidden from guests.' }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteAnnouncementAction(hubId: string, id: string): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    await scope(w, hubId)
    if (!ID.test(id)) return { error: 'That announcement could not be found.' }
    await rtdb('DELETE', `hubs/${hubId}/announcements/${id}`, w.token)
    revalidatePath('/dashboard/announcements')
    revalidatePath('/dashboard')
    return { success: 'Announcement deleted.' }
  } catch (e) {
    return fail(e)
  }
}

/** Publishes scheduled announcements whose time has come, then pushes them to guests. Called by the page while it is open. */
export async function runDueAnnouncementsAction(hubId: string): Promise<{ published: number }> {
  try {
    const w = await requireWriter(await getSession())
    await assertHubAccess(w, hubId)
    const raw = (await rtdb('GET', `hubs/${hubId}/announcements`, w.token)) as Record<string, { active?: boolean; scheduledAt?: string; title?: string; message?: string }> | null
    const now = Date.now()
    const due = Object.entries(raw ?? {}).filter(([, a]) => a && a.active === false && a.scheduledAt && Date.parse(a.scheduledAt) <= now)
    for (const [id, a] of due) {
      // Mark it live first, so two open pages cannot publish (and notify) it twice.
      await rtdb('PATCH', `hubs/${hubId}/announcements/${id}`, w.token, { active: true })
      const { pushWorkerUrl } = getAuthEnv()
      if (pushWorkerUrl) {
        fetch(pushWorkerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hubId, title: a.title ?? '', body: String(a.message ?? '').slice(0, 120), idToken: w.token }),
          signal: AbortSignal.timeout(15_000),
        }).catch(() => undefined)
      }
    }
    if (due.length) revalidatePath('/dashboard/announcements')
    return { published: due.length }
  } catch {
    return { published: 0 }
  }
}

// ─── Events ─────────────────────────────────────────────────────────────────

/** Creates or edits an event. With an id it edits; without one it creates (and may notify guests). */
export async function saveEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    const hubId = await scope(w, field(formData, 'hubId'))
    const id = field(formData, 'id')
    const title = field(formData, 'title')
    const description = field(formData, 'description')
    const fullDesc = field(formData, 'fullDesc')
    const hours = field(formData, 'hours')
    const location = field(formData, 'location')
    const active = formData.get('active') === 'on'
    if (!title) return { error: 'The event title is required.' }
    if (title.length > 120 || description.length > 300 || fullDesc.length > 3000 || hours.length > 120 || location.length > 120) return { error: 'One of the fields is too long.' }

    let imageUrl = ''
    if (field(formData, 'imageUrl')) {
      const ok = httpsUrl(field(formData, 'imageUrl'))
      if (!ok) return { error: 'The image link is not valid.' }
      imageUrl = ok
    }
    const days = field(formData, 'days').split(',').filter(Boolean)
    if (days.some((d) => !DAYS.includes(d))) return { error: 'Invalid weekday.' }
    const dates = field(formData, 'dates').split(',').filter(Boolean)
    if (dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) return { error: 'Invalid date.' }
    if (dates.length > 366) return { error: 'Too many dates.' }
    // Repeating weekdays replace specific dates, as on the hub admin.
    const body = { title, description, fullDesc, hours, location, imageUrl, active, dates: days.length ? [] : [...new Set(dates)].sort(), days }

    if (id) {
      if (!ID.test(id)) return { error: 'That event could not be found.' }
      await rtdb('PATCH', `hubs/${hubId}/activities/${id}`, w.token, { ...body, updatedAt: new Date().toISOString(), updatedBy: w.session.email })
      revalidatePath('/dashboard/events')
      revalidatePath('/dashboard')
      return { success: 'Event updated.' }
    }

    const existing = (await rtdb('GET', `hubs/${hubId}/activities`, w.token)) as Record<string, unknown> | null
    const created = (await rtdb('POST', `hubs/${hubId}/activities`, w.token, { ...body, order: Object.keys(existing ?? {}).length, hubId, createdAt: new Date().toISOString(), createdBy: w.session.email })) as { name?: string }
    if (created.name) await rtdb('PATCH', `hubs/${hubId}/activities/${created.name}`, w.token, { id: created.name })

    let note = ''
    if (active && hubId !== '_global' && formData.get('notify') === 'on') {
      const text = [hours, location].filter(Boolean).join(' · ') || description || 'Check the Events tab for details.'
      note = await notifyGuests(w, hubId, { pushTitle: `📅 New Event: ${title}`, pushBody: text, emailType: 'announcement', emailTitle: `New Event: ${title}`, emailBody: text })
    }
    revalidatePath('/dashboard/events')
    revalidatePath('/dashboard')
    return { success: `Event added.${note}` }
  } catch (e) {
    return fail(e)
  }
}

export async function toggleEventAction(hubId: string, id: string, active: boolean): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    await scope(w, hubId)
    if (!ID.test(id)) return { error: 'That event could not be found.' }
    await rtdb('PATCH', `hubs/${hubId}/activities/${id}`, w.token, { active: Boolean(active) })
    revalidatePath('/dashboard/events')
    revalidatePath('/dashboard')
    return { success: active ? 'Event is live.' : 'Event is hidden from guests.' }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteEventAction(hubId: string, id: string): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    await scope(w, hubId)
    if (!ID.test(id)) return { error: 'That event could not be found.' }
    await rtdb('DELETE', `hubs/${hubId}/activities/${id}`, w.token)
    revalidatePath('/dashboard/events')
    revalidatePath('/dashboard')
    return { success: 'Event deleted.' }
  } catch (e) {
    return fail(e)
  }
}

function startTime(hours: string): number | null {
  const m = hours.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (!m) return null
  let hour = parseInt(m[1], 10)
  const min = parseInt(m[2] ?? '0', 10)
  const ampm = (m[3] ?? '').toUpperCase()
  if (ampm === 'PM' && hour < 12) hour += 12
  if (ampm === 'AM' && hour === 12) hour = 0
  return hour * 60 + min
}

/**
 * "Starting now" alerts, as on the hub admin: when an event's start time arrives (the page's own clock), guests get a push and an email.
 * The day is recorded on the event so two open pages never send it twice.
 */
export async function runEventAlertsAction(hubId: string, localDate: string, localMinutes: number): Promise<{ sent: number }> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !Number.isFinite(localMinutes)) return { sent: 0 }
    const w = await requireWriter(await getSession())
    await assertHubAccess(w, hubId)
    const { pushWorkerUrl } = getAuthEnv()
    if (!pushWorkerUrl) return { sent: 0 }
    const raw = (await rtdb('GET', `hubs/${hubId}/activities`, w.token)) as Record<string, { active?: boolean; dates?: string[]; hours?: string; title?: string; description?: string; fullDesc?: string; location?: string; alertedOn?: string }> | null
    let sent = 0
    for (const [id, a] of Object.entries(raw ?? {})) {
      if (!a || a.active === false || !a.dates?.includes(localDate) || a.alertedOn === localDate) continue
      const start = startTime(a.hours ?? '')
      if (start === null || Math.abs(localMinutes - start) > 1) continue
      await rtdb('PATCH', `hubs/${hubId}/activities/${id}`, w.token, { alertedOn: localDate })
      const dateLabel = new Date(`${localDate}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
      await notifyGuests(w, hubId, {
        pushTitle: `📅 ${a.title ?? 'Event'} is starting now!`,
        pushBody: [a.hours, a.location].filter(Boolean).join(' · ') || a.description || '',
        emailType: 'event',
        emailTitle: a.title ?? 'Event',
        emailBody: a.description || a.fullDesc || '',
        eventDate: dateLabel,
        eventHours: a.hours ?? '',
      })
      sent++
    }
    return { sent }
  } catch {
    return { sent: 0 }
  }
}

// ─── Guest chat ─────────────────────────────────────────────────────────────

export async function listChatThreadsAction(hubId: string): Promise<{ threads?: ChatThread[]; error?: string }> {
  try {
    const w = await requireWriter(await getSession())
    await assertHubAccess(w, hubId)
    return { threads: await getChatThreads(hubId) }
  } catch (e) {
    return { error: fail(e).error }
  }
}

/** Opens a conversation: returns its messages and marks it read. */
export async function openChatAction(hubId: string, sessionId: string): Promise<{ messages?: ChatMessage[]; error?: string }> {
  try {
    const w = await requireWriter(await getSession())
    await assertHubAccess(w, hubId)
    if (!ID.test(sessionId)) return { error: 'That conversation could not be found.' }
    const messages = await getChatMessages(hubId, sessionId)
    await rtdb('PATCH', `hubs/${hubId}/chats/${sessionId}`, w.token, { unreadAdmin: false }).catch(() => undefined)
    return { messages }
  } catch (e) {
    return { error: fail(e).error }
  }
}

/** Sends a staff reply, and pushes it to that one guest's phone. */
export async function sendChatReplyAction(hubId: string, sessionId: string, message: string, guestName?: string): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    await assertHubAccess(w, hubId)
    if (!ID.test(sessionId)) return { error: 'That conversation could not be found.' }
    const text = String(message ?? '').trim()
    if (!text) return { error: 'Type a message first.' }
    if (text.length > 2000) return { error: 'The message is too long (2000 characters at most).' }
    const now = new Date().toISOString()
    const created = (await rtdb('POST', `hubs/${hubId}/chats/${sessionId}/messages`, w.token, { text, sender: 'admin', senderName: w.session.name || w.session.email, at: now, readByGuest: false })) as { name?: string }
    if (created.name) await rtdb('PATCH', `hubs/${hubId}/chats/${sessionId}/messages/${created.name}`, w.token, { id: created.name })
    const convo: Record<string, unknown> = { lastMessage: text, lastAt: now, unreadGuest: true, unreadAdmin: false }
    // A thread started from the guest list has no name on it yet.
    if (guestName) convo.guestName = String(guestName).slice(0, 120)
    await rtdb('PATCH', `hubs/${hubId}/chats/${sessionId}`, w.token, convo)

    const { pushWorkerUrl } = getAuthEnv()
    if (pushWorkerUrl) {
      const hubName = String(((await rtdb('GET', `hubs_meta/${hubId}/name`, w.token).catch(() => null)) as string | null) ?? hubId)
      // To this one guest only, never the hub-wide broadcast.
      fetch(`${pushWorkerUrl}/chat-guest-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubId, guestToken: sessionId, title: `💬 New message from ${hubName}`, body: text, idToken: w.token }),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => undefined)
    }
    return { success: 'sent' }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteChatAction(hubId: string, sessionId: string): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    await assertHubAccess(w, hubId)
    if (!ID.test(sessionId)) return { error: 'That conversation could not be found.' }
    await rtdb('DELETE', `hubs/${hubId}/chats/${sessionId}`, w.token)
    revalidatePath('/dashboard/chat')
    return { success: 'Conversation deleted.' }
  } catch (e) {
    return fail(e)
  }
}
