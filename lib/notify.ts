import 'server-only'
import { getAuthEnv } from '@/lib/env'
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

/**
 * Push and email to a hub's guests through the existing worker, the same two calls the hub admin makes.
 * Never throws and never blocks a save. Returns a short sentence for the success message ('' when no worker is set up).
 */
export async function notifyGuests(w: Writer, hubId: string, n: NotifyInput): Promise<string> {
  const { pushWorkerUrl } = getAuthEnv()
  if (!pushWorkerUrl) return ''
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
  if (parts.length) return ` Guests notified: ${parts.join(' + ')}.`
  return push || email.ok ? ' Guests were notified.' : ' Saved, but guests could not be notified.'
}
