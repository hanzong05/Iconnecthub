'use client'

import { useEffect, useState } from 'react'
import { getVapidKeyAction, pushStatusAction, saveSubscriptionAction } from '@/app/actions/push'

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** "Enable notifications": lets this admin get a push the moment a guest writes in, even with the page closed. */
export default function PushButton() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)

  useEffect(() => {
    let live = true
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (!supported || Notification.permission === 'denied') return
    // Per account, not per browser: another person may have allowed notifications on this device before.
    pushStatusAction().then((s) => live && setShow(s.configured && !s.subscribed))
    return () => {
      live = false
    }
  }, [])

  async function enable() {
    setBusy(true)
    setMsg(null)
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setMsg({ text: 'Notification permission was not granted.' })
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      const k = await getVapidKeyAction()
      if (!k.key) return setMsg({ text: k.error ?? "Push isn't configured on the server yet.", error: true })
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.key) }))
      const r = await saveSubscriptionAction(sub.toJSON())
      if (!r.saved) return setMsg({ text: r.error ?? 'Could not save.', error: true })
      setShow(false)
      setMsg({ text: 'Notifications enabled.' })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not turn on notifications.', error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <span role="status" aria-live="polite" className={`hidden text-xs font-medium sm:inline ${msg?.error ? 'text-red-600' : 'text-emerald-700'}`}>
        {msg?.text}
      </span>
      {show && (
        <button type="button" onClick={enable} disabled={busy} className="inline-flex h-9 shrink-0 items-center rounded-lg border border-line2 bg-surface px-3 text-[13px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60">
          {busy ? 'Turning on…' : 'Enable notifications'}
        </button>
      )}
    </>
  )
}
