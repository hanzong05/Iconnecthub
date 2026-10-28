'use client'

import { useState, useTransition } from 'react'
import { sendTestNotificationAction } from '@/app/actions/push'

/**
 * "Send a test to my device": sends what the form currently says, marked [TEST], to the signed-in person's own
 * saved device only. Nothing is saved and no guest is contacted.
 */
export default function TestSendButton({ hubId, titleField, bodyField, titlePrefix = '' }: { hubId: string; titleField: string; bodyField: string; titlePrefix?: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <div className="mb-3">
      <button
        type="button"
        disabled={pending}
        className="h-9 rounded-lg border border-line2 bg-surface px-3 text-xs font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
        onClick={(e) => {
          const form = e.currentTarget.form ?? e.currentTarget.closest('form')
          const val = (n: string) => (form?.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? ''
          const title = val(titleField).trim()
          setMsg(null)
          if (!title) return setMsg({ ok: false, text: 'Add a title first.' })
          start(async () => {
            const r = await sendTestNotificationAction(hubId, `${titlePrefix}${title}`, val(bodyField))
            setMsg(r.sent ? { ok: true, text: 'Test sent to your device only. No guests were contacted.' } : { ok: false, text: r.error ?? 'The test could not be sent.' })
          })
        }}
      >
        {pending ? 'Sending test…' : 'Send a test to my device'}
      </button>
      <p role="status" aria-live="polite" className={`mt-1.5 text-xs ${msg ? (msg.ok ? 'text-emerald-700' : 'text-red-600') : 'sr-only'}`}>{msg?.text ?? ''}</p>
    </div>
  )
}
