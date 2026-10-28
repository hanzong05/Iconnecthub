import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = vi.hoisted(() => ({ calls: [] as { url: string; body: Record<string, unknown> }[], status: 200, payload: {} as Record<string, unknown>, access: true }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => ({ role: 'manager', hubId: 'hub-a', email: 'm@x.test' }) }))
vi.mock('@/lib/env', () => ({ getAuthEnv: () => ({ pushWorkerUrl: 'https://push.test' }) }))
vi.mock('@/lib/data/write', () => {
  class AccessError extends Error {}
  return {
    AccessError,
    requireWriter: async (s: unknown) => ({ token: 'tok', session: s }),
    assertHubAccess: async (_w: unknown, hubId: string) => {
      if (hubId !== 'hub-a') throw new AccessError('You do not have access to that hub.')
    },
    rtdb: async () => null,
  }
})

import { sendTestNotificationAction } from './push'

beforeEach(() => {
  st.calls = []
  st.status = 200
  st.payload = { sent: 1 }
  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    st.calls.push({ url, body: JSON.parse(init.body) })
    return { ok: st.status < 300, status: st.status, json: async () => st.payload }
  })
})

describe('sendTestNotificationAction', () => {
  it('sends to the test route with the signed-in token and reports success', async () => {
    expect(await sendTestNotificationAction('hub-a', ' Pool closed ', 'Back at 3')).toEqual({ sent: true })
    expect(st.calls).toHaveLength(1)
    expect(st.calls[0].url).toBe('https://push.test/send-test')
    expect(st.calls[0].body).toMatchObject({ hubId: 'hub-a', title: 'Pool closed', body: 'Back at 3', idToken: 'tok' })
  })
  it('refuses another hub and an empty title without calling the worker', async () => {
    expect((await sendTestNotificationAction('hub-b', 'x', '')).error).toMatch(/access/)
    expect((await sendTestNotificationAction('hub-a', '  ', '')).error).toMatch(/title/)
    expect(st.calls).toHaveLength(0)
  })
  it('explains a missing device, a refusal and an old worker', async () => {
    st.status = 409
    st.payload = { noDevice: true }
    expect((await sendTestNotificationAction('hub-a', 'x', '')).error).toMatch(/Turn on notifications/)
    st.status = 403
    st.payload = {}
    expect((await sendTestNotificationAction('hub-a', 'x', '')).error).toMatch(/not allowed/)
    st.status = 405
    st.payload = {}
    expect((await sendTestNotificationAction('hub-a', 'x', '')).error).toMatch(/does not support/)
  })
})
