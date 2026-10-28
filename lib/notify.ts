import 'server-only'
import { getAuthEnv } from '@/lib/env'
import { createHash } from 'node:crypto'
import { rtdb, type Writer } from '@/lib/data/write'

export interface NotifyInput {
  pushTitle: string
  pushBody: string
  emailType: 'announcement' | 'event'
  emailTitle: string
  emailBody: string
  eventDate?: string
  eventHours?: string
}

const post = (url: string, payload: object) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) })

export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000

async function record(w: Writer, hubId: string, summary: string) {
  const at = new Date().toISOString()
  try {
    await rtdb('PUT', `hubs/${hubId}/audit/${at.slice(0, 7)}/n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, w.token, { at, by: w.session.email, action: 'notify', summary })
  } catch {
    // The history is a record, not a gate: a failed write must not block or repeat a send.
  }
}

/**
 * Push and email to a hub's guests through the existing worker, the same two calls the hub admin makes.
 * Safety, in order: the hub must allow guest notifications (settings/guestNotifications, on unless turned off);
 * the same message to the same hub within 10 minutes is refused as a duplicate; every send is written to the history.
 * Never throws and never blocks a save. Returns a short sentence for the success message ('' when no worker is set up).
 */
export async function notifyGuests(w: Writer, hubId: string, n: NotifyInput): Promise<string> {
  const { pushWorkerUrl } = getAuthEnv()
  if (!pushWorkerUrl) return ''
  const allowed = await rtdb('GET', `hubs/${hubId}/settings/guestNotifications`, w.token).catch(() => null)
  if (allowed === false) return " Guest notifications are turned off for this hub, so nobody was notified."
  // Claim the message before sending, so a double click or a second open page cannot send it twice.
  const key = createHash('sha256').update(`${n.pushTitle}\n${n.pushBody}\n${n.emailTitle}\n${n.emailBody}`).digest('hex').slice(0, 24)
  const now = Date.now()
  const last = await rtdb('GET', `hubs/${hubId}/notifyLog/${key}`, w.token).catch(() => null)
  if (typeof last === 'number' && now - last < DUPLICATE_WINDOW_MS) return ' This exact message was already sent to guests a few minutes ago, so it was not sent again.'
  await rtdb('PUT', `hubs/${hubId}/notifyLog/${key}`, w.token, now).catch(() => null)
  const hubName = String(((await rtdb('GET', `hubs_meta/${hubId}/name`, w.token).catch(() => null)) as string | null) ?? hubId)
  const [push, email] = await Promise.all([
    post(pushWorkerUrl, { hubId, title: n.pushTitle, body: n.pushBody.slice(0, 120), idToken: w.token })
      .then((r) => r.ok)
      .catch(() => false),
    post(`${pushWorkerUrl}/send-email-resend`, {
      hubId,
      type: n.emailType,
      title: n.emailTitle,
      body: n.emailBody,
      hubName,
      ...(n.eventDate ? { eventDate: n.eventDate } : {}),
      ...(n.eventHours !== undefined ? { eventHours: n.eventHours } : {}),
      idToken: w.token,
    })
      .then(async (r) => ({ ok: r.ok, data: (await r.json().catch(() => ({}))) as { sent?: number; smsSent?: number } }))
      .catch(() => ({ ok: false, data: {} as { sent?: number; smsSent?: number } })),
  ])
  const parts: string[] = []
  if (email.data.sent) parts.push(`${email.data.sent} email${email.data.sent === 1 ? '' : 's'}`)
  if (email.data.smsSent) parts.push(`${email.data.smsSent} SMS`)
  await record(w, hubId, `${n.pushTitle.slice(0, 80)}: push ${push ? 'accepted' : 'failed'}, email ${email.ok ? `accepted${parts.length ? ` (${parts.join(' + ')})` : ''}` : 'failed'}.`)
  if (parts.length) return ` Guests notified: ${parts.join(' + ')}.`
  return push || email.ok ? ' Guests were notified.' : ' Saved, but guests could not be notified.'
}
