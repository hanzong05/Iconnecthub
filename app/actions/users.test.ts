import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  session: null as null | { role: string; hubId?: string; email: string },
  calls: [] as { method: string; url: string; auth: string; body: unknown }[],
  denyUserWrite: false,
  signUpError: '',
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'admin.test' }) }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => state.session, getFirebaseToken: async () => 'ADMIN_TOKEN' }))

beforeEach(() => {
  process.env.AUTH_SECRET = 'x'.repeat(40)
  process.env.FIREBASE_API_KEY = 'k'
  process.env.FIREBASE_DATABASE_URL = 'https://db.test'
  process.env.PASSWORD_RESET_WORKER_URL = 'https://w.test'
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST
  delete process.env.PUSH_WORKER_URL
  state.session = { role: 'super', email: 'boss@x.test' }
  state.calls = []
  state.denyUserWrite = false
  state.signUpError = ''
  vi.stubGlobal('fetch', async (input: string, init?: { method?: string; body?: string }) => {
    const u = new URL(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body) : null
    const res = (status: number, v: unknown) => ({ ok: status < 400, status, json: async () => v })
    if (u.hostname === 'identitytoolkit.googleapis.com') {
      state.calls.push({ method, url: u.pathname, auth: 'idtoolkit', body })
      if (u.pathname.endsWith('accounts:signUp')) return state.signUpError ? res(400, { error: { message: state.signUpError } }) : res(200, { localId: 'newuid123', idToken: 'NEW_USER_TOKEN' })
      return res(200, {})
    }
    const path = decodeURIComponent(u.pathname).replace(/^\//, '').replace(/\.json$/, '')
    const auth = u.searchParams.get('auth') ?? ''
    state.calls.push({ method, url: path, auth, body })
    if (method === 'GET' && path === 'users/target1') return res(200, { email: 't@x.test', role: 'manager', hubId: 'test-hub', name: 'Tess' })
    if (method === 'GET') return res(200, path === 'hubs_meta/test-hub/name' ? 'Test hub' : null)
    if (path.startsWith('users/') && state.denyUserWrite) return res(401, { error: 'Permission denied' })
    return res(200, body)
  })
})

const actions = () => import('./users')
const input = { name: 'Chritian', email: 'New@Example.com', password: 'secret-pass-1', role: 'manager', hubId: 'test-hub' }
const writes = () => state.calls.filter((c) => c.method === 'PUT' && c.url.startsWith('users/'))

describe('creating a user', () => {
  it('saves the user record with the admin token, not the new account token, and lowercases the email', async () => {
    const { createUserAction } = await actions()
    const r = await createUserAction(input)
    expect(r.error).toBeUndefined()
    expect(writes()).toHaveLength(1)
    expect(writes()[0]).toMatchObject({ url: 'users/newuid123', auth: 'ADMIN_TOKEN', body: { uid: 'newuid123', email: 'new@example.com', role: 'manager', hubId: 'test-hub', hubName: 'Test hub', active: true, createdBy: 'boss@x.test' } })
    expect(state.calls.some((c) => c.auth === 'NEW_USER_TOKEN')).toBe(false)
  })

  it('removes the new sign-in account when the record is refused, so the email can be used again', async () => {
    const { createUserAction } = await actions()
    state.denyUserWrite = true
    const r = await createUserAction(input)
    expect(r.error).toMatch(/Nothing was created/)
    const del = state.calls.find((c) => c.url.endsWith('accounts:delete'))
    expect(del?.body).toEqual({ idToken: 'NEW_USER_TOKEN' })
  })

  it('refuses a hub that does not exist before creating any account', async () => {
    const { createUserAction } = await actions()
    const r = await createUserAction({ ...input, hubId: 'ghost' })
    expect(r.error).toBe('That hub does not exist.')
    expect(state.calls.some((c) => c.url.endsWith('accounts:signUp'))).toBe(false)
  })

  it('is for super admins and super managers only, and only a super admin creates a super admin', async () => {
    const { createUserAction } = await actions()
    state.session = { role: 'manager', hubId: 'test-hub', email: 'm@x.test' }
    expect((await createUserAction(input)).error).toMatch(/not allowed/)
    state.session = { role: 'super_manager', hubId: 'test-hub', email: 'sm@x.test' }
    expect((await createUserAction({ ...input, role: 'super' })).error).toMatch(/Only a super admin/)
    expect(state.calls.some((c) => c.url.endsWith('accounts:signUp'))).toBe(false)
  })

  it('locks a super manager to their own hub whatever the form says', async () => {
    const { createUserAction } = await actions()
    state.session = { role: 'super_manager', hubId: 'test-hub', email: 'sm@x.test' }
    await createUserAction({ ...input, hubId: 'hub-b' })
    expect(writes()[0].body).toMatchObject({ hubId: 'test-hub' })
  })

  it('says so when the email already has an account, and writes nothing', async () => {
    const { createUserAction } = await actions()
    state.signUpError = 'EMAIL_EXISTS'
    expect((await createUserAction(input)).error).toBe('That email already has an account.')
    expect(writes()).toHaveLength(0)
  })
})

describe('the welcome email after creating a user', () => {
  const withWorker = (answer: { status: number; body: unknown } | 'down') => {
    process.env.PUSH_WORKER_URL = 'https://push.test'
    const inner = globalThis.fetch as (i: string, init?: unknown) => Promise<unknown>
    vi.stubGlobal('fetch', async (input: string, init?: { body?: string }) => {
      if (new URL(input).hostname !== 'push.test') return inner(input, init)
      state.calls.push({ method: 'POST', url: new URL(input).pathname, auth: 'worker', body: init?.body ? JSON.parse(init.body) : null })
      if (answer === 'down') throw new Error('network down')
      return { ok: answer.status < 400, status: answer.status, json: async () => answer.body }
    })
  }
  it('says an email was sent only when the worker reports one sent', async () => {
    withWorker({ status: 200, body: { sent: 1 } })
    const { createUserAction } = await actions()
    expect((await createUserAction(input)).success).toBe('Account created for Chritian. A welcome email was sent.')
    withWorker({ status: 200, body: { sent: 1, id: 'abc12345-def6' } })
    expect((await createUserAction({ ...input, email: 'two@example.com' })).success).toBe('Account created for Chritian. A welcome email was sent. (email id abc12345-def6)')
  })
  it('shows the worker status and its short error when the email is refused, and never the password', async () => {
    withWorker({ status: 401, body: { error: 'Unauthorized' } })
    const { createUserAction } = await actions()
    const r = await createUserAction(input)
    expect(r.success).toContain('Give them the temporary password.')
    expect(r.success).toContain('answered 401: Unauthorized')
    expect(r.success).not.toContain('secret-pass-1')
  })
  it('says when the worker cannot be reached, or when none is set up', async () => {
    withWorker('down')
    const { createUserAction } = await actions()
    expect((await createUserAction(input)).success).toContain('could not be reached')
    delete process.env.PUSH_WORKER_URL
    expect((await createUserAction({ ...input, email: 'other@example.com' })).success).toContain('no email worker is set up')
  })
})

describe('auditing user changes', () => {
  const audits = () => state.calls.filter((c) => c.method === 'PUT' && c.url.includes('/audit/'))

  it('records who created an account and never the password', async () => {
    const { createUserAction } = await actions()
    await createUserAction(input)
    expect(audits()).toHaveLength(1)
    expect(audits()[0].url.startsWith('hubs/test-hub/audit/')).toBe(true)
    expect(audits()[0].body).toMatchObject({ by: 'boss@x.test', action: 'user.create' })
    expect(JSON.stringify(state.calls.filter((c) => c.url.includes('/audit/')))).not.toContain(input.password)
  })

  it('refuses a temporary password shorter than 10 characters', async () => {
    const { createUserAction } = await actions()
    expect((await createUserAction({ ...input, password: 'short-pw1' })).error).toMatch(/at least 10/)
    expect(state.calls.some((c) => c.url.endsWith('accounts:signUp'))).toBe(false)
  })
})

describe('changing an existing account', () => {
  const audits = () => state.calls.filter((c) => c.method === 'PUT' && c.url.includes('/audit/'))

  it('deactivating writes the flag and a history entry naming who did it', async () => {
    const { setUserActiveAction } = await actions()
    expect((await setUserActiveAction('target1', false)).success).toBe('User deactivated.')
    expect(state.calls.find((c) => c.method === 'PATCH' && c.url === 'users/target1')?.body).toEqual({ active: false })
    expect(audits()[0].body).toMatchObject({ by: 'boss@x.test', action: 'user.deactivate' })
  })

  it('a role change records the old and the new role', async () => {
    const { updateUserAccessAction } = await actions()
    expect((await updateUserAccessAction('target1', { role: 'super_manager', hubId: 'test-hub' })).success).toBe('Access updated.')
    const note = (audits()[0].body as { summary: string }).summary
    expect(note).toContain('manager')
    expect(note).toContain('super_manager')
  })

  it('a manager cannot deactivate anyone, and nothing is written', async () => {
    const { setUserActiveAction } = await actions()
    state.session = { role: 'manager', hubId: 'test-hub', email: 'm@x.test' }
    expect((await setUserActiveAction('target1', false)).error).toMatch(/not allowed/)
    expect(state.calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('a super manager cannot touch a user on another hub', async () => {
    const { setUserActiveAction } = await actions()
    state.session = { role: 'super_manager', hubId: 'hub-b', email: 'sm@x.test' }
    expect((await setUserActiveAction('target1', false)).error).toMatch(/own hub/)
    expect(state.calls.some((c) => c.method === 'PATCH')).toBe(false)
  })
})
