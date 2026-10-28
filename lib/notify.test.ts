import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = vi.hoisted(() => ({ db: {} as Record<string, unknown>, worker: [] as string[] }))
vi.mock('@/lib/env', () => ({ getAuthEnv: () => ({ pushWorkerUrl: 'https://push.test' }) }))
vi.mock('@/lib/data/write', () => ({
  rtdb: async (method: string, path: string, _t: string, body?: unknown) => {
    if (method === 'GET') return path in st.db ? st.db[path] : null
    st.db[path] = body
    return body
  },
}))

import { notifyGuests, type NotifyInput } from './notify'

const w = { token: 't', session: { email: 'boss@x.test' } } as never
const msg: NotifyInput = { pushTitle: 'Hello', pushBody: 'Body', emailType: 'announcement', emailTitle: 'Hello', emailBody: 'Body' }

beforeEach(() => {
  st.db = { 'hubs_meta/hub-a/name': 'A' }
  st.worker = []
  vi.stubGlobal('fetch', async (url: string) => {
    st.worker.push(url)
    return { ok: true, json: async () => ({ sent: 3 }) }
  })
})

describe('notifyGuests safety', () => {
  it('sends once, records it in the history, and refuses an identical repeat', async () => {
    expect(await notifyGuests(w, 'hub-a', msg)).toMatch(/3 emails/)
    expect(st.worker).toHaveLength(2)
    expect(Object.keys(st.db).some((k) => k.startsWith('hubs/hub-a/audit/'))).toBe(true)
    expect(await notifyGuests(w, 'hub-a', msg)).toMatch(/already sent/)
    expect(st.worker).toHaveLength(2)
  })
  it('allows a different message and the same message on another hub', async () => {
    await notifyGuests(w, 'hub-a', msg)
    await notifyGuests(w, 'hub-a', { ...msg, pushBody: 'Other' })
    await notifyGuests(w, 'hub-b', msg)
    expect(st.worker).toHaveLength(6)
  })
  it('sends nothing when the hub turned guest notifications off', async () => {
    st.db['hubs/hub-a/settings/guestNotifications'] = false
    expect(await notifyGuests(w, 'hub-a', msg)).toMatch(/turned off/)
    expect(st.worker).toHaveLength(0)
  })
  it('sends again after the duplicate window', async () => {
    await notifyGuests(w, 'hub-a', msg)
    for (const k of Object.keys(st.db)) if (k.includes('/notifyLog/')) st.db[k] = Date.now() - 11 * 60 * 1000
    await notifyGuests(w, 'hub-a', msg)
    expect(st.worker).toHaveLength(4)
  })
})
