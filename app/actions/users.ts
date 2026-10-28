'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getSession } from '@/lib/auth/session'
import { getAuthEnv } from '@/lib/env'
import { AccessError, requireWriter, rtdb } from '@/lib/data/write'
import type { ActionState } from './content'

const ROLES = ['manager', 'super_manager', 'super'] as const
type Role = (typeof ROLES)[number]
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fail(e: unknown): ActionState {
  if (e instanceof AccessError) return { error: e.message }
  console.error('[users]', e instanceof Error ? e.message : e)
  return { error: 'Something went wrong. Please try again.' }
}

/**
 * Creates a sign-in account and its user record. A super admin may create any role for any hub;
 * a super manager may only create managers and super managers for their own hub.
 */
export async function createUserAction(input: { name: string; email: string; password: string; role: string; hubId: string }): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    const { session } = w
    if (session.role !== 'super' && session.role !== 'super_manager') throw new AccessError('You are not allowed to add users.')

    const name = String(input.name ?? '').trim()
    const email = String(input.email ?? '').trim().toLowerCase()
    const password = String(input.password ?? '')
    const role = input.role as Role
    if (!name || name.length > 120) return { error: 'Enter the full name (up to 120 characters).' }
    if (!EMAIL.test(email) || email.length > 200) return { error: 'Enter a valid email address.' }
    if (password.length < 6 || password.length > 128) return { error: 'The temporary password needs at least 6 characters.' }
    if (!ROLES.includes(role)) return { error: 'Choose a role.' }
    if (role === 'super' && session.role !== 'super') throw new AccessError('Only a super admin can create another super admin.')

    // Where the user belongs. Never trust the form: a super manager is locked to their own hub.
    let hubId = '_global'
    let hubName = 'All Hubs'
    if (role !== 'super') {
      hubId = session.role === 'super' ? String(input.hubId ?? '') : (session.hubId ?? '')
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(hubId)) return { error: 'Choose a hub.' }
      const meta = (await rtdb('GET', `hubs_meta/${hubId}/name`, w.token)) as string | null
      if (meta === null) return { error: 'That hub does not exist.' }
      hubName = String(meta) || hubId
    }

    const env = getAuthEnv()
    const res = await fetch(`${env.identityBase}/v1/accounts:signUp?key=${encodeURIComponent(env.firebaseApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      signal: AbortSignal.timeout(15_000),
    })
    const json = (await res.json().catch(() => ({}))) as { localId?: string; idToken?: string; error?: { message?: string } }
    if (!res.ok || !json.localId || !json.idToken) {
      const code = json.error?.message ?? ''
      if (code.startsWith('EMAIL_EXISTS')) return { error: 'That email already has an account.' }
      if (code.startsWith('WEAK_PASSWORD')) return { error: 'That password is too weak. Use at least 6 characters.' }
      if (code.startsWith('OPERATION_NOT_ALLOWED')) return { error: 'Creating accounts is turned off in Firebase (enable Email/Password sign-in).' }
      if (code.startsWith('INVALID_EMAIL')) return { error: 'Enter a valid email address.' }
      console.error('[users] signUp failed:', code || res.status)
      return { error: 'The account could not be created. Try again.' }
    }

    // The new account writes its own record, the same way the old admin does.
    const uid = json.localId
    await rtdb('PUT', `users/${uid}`, json.idToken, {
      uid,
      name,
      email,
      role,
      hubId,
      hubName,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: session.email,
    })

    // Welcome email through the worker, if one is set up. A failure here never undoes the account.
    let mailed = false
    if (env.pushWorkerUrl) {
      try {
        const h = await headers()
        const host = h.get('x-forwarded-host') ?? h.get('host')
        const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
        const base = env.pushWorkerUrl.endsWith('/') ? env.pushWorkerUrl : `${env.pushWorkerUrl}/`
        const mail = await fetch(`${base}send-welcome`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: w.token, email, name, password, loginUrl: host ? `${proto}://${host}/` : '' }),
          signal: AbortSignal.timeout(15_000),
        })
        const data = (await mail.json().catch(() => ({}))) as { sent?: number }
        mailed = mail.ok && (data.sent ?? 0) > 0
      } catch {
        mailed = false
      }
    }

    revalidatePath('/dashboard/users')
    return { success: mailed ? `Account created for ${name}. A welcome email was sent.` : `Account created for ${name}. Give them the temporary password.` }
  } catch (e) {
    return fail(e)
  }
}

const UID = /^[A-Za-z0-9_-]{6,128}$/

/**
 * Loads the person being changed and applies the same rules as the old admin: nobody edits themselves here,
 * and a super manager may only touch non-super users on their own hub. Never rely on the buttons shown.
 */
async function loadTarget(w: Awaited<ReturnType<typeof requireWriter>>, uid: string) {
  const { session } = w
  if (session.role !== 'super' && session.role !== 'super_manager') throw new AccessError('You are not allowed to manage users.')
  if (!UID.test(uid)) throw new AccessError('That user could not be found.')
  const target = (await rtdb('GET', `users/${uid}`, w.token)) as { email?: string; role?: string; hubId?: string; name?: string } | null
  if (!target) throw new AccessError('That user could not be found.')
  if (target.email && target.email.toLowerCase() === session.email.toLowerCase()) throw new AccessError('You cannot change your own account here.')
  if (session.role === 'super_manager' && (target.role === 'super' || target.hubId !== session.hubId)) throw new AccessError('You can only manage people on your own hub.')
  return target
}

export async function setUserActiveAction(uid: string, active: boolean): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    await loadTarget(w, uid)
    await rtdb('PATCH', `users/${uid}`, w.token, { active: Boolean(active) })
    revalidatePath('/dashboard/users')
    return { success: active ? 'User activated.' : 'User deactivated.' }
  } catch (e) {
    return fail(e)
  }
}

export async function updateUserAccessAction(uid: string, input: { role: string; hubId: string }): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    const { session } = w
    await loadTarget(w, uid)
    const role = input.role as Role
    if (!ROLES.includes(role)) return { error: 'Choose a role.' }
    if (role === 'super' && session.role !== 'super') throw new AccessError('Only a super admin can grant super admin access.')
    let hubId = '_global'
    let hubName = 'All Hubs'
    if (role !== 'super') {
      hubId = session.role === 'super' ? String(input.hubId ?? '') : (session.hubId ?? '')
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(hubId)) return { error: 'Choose a hub.' }
      const name = (await rtdb('GET', `hubs_meta/${hubId}/name`, w.token)) as string | null
      if (name === null) return { error: 'That hub does not exist.' }
      hubName = String(name) || hubId
    }
    await rtdb('PATCH', `users/${uid}`, w.token, { role, hubId, hubName })
    revalidatePath('/dashboard/users')
    return { success: 'Access updated.' }
  } catch (e) {
    return fail(e)
  }
}

async function callUserWorker(w: Awaited<ReturnType<typeof requireWriter>>, payload: object): Promise<ActionState> {
  const { deleteUserWorkerUrl } = getAuthEnv()
  if (!deleteUserWorkerUrl) return { error: 'This needs DELETE_USER_WORKER_URL in the server settings.' }
  const res = await fetch(`${deleteUserWorkerUrl}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, idToken: w.token }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
  if (!res.ok || !data.success) return { error: data.error || 'The request failed. Try again.' }
  return { success: 'ok' }
}

export async function changeUserPasswordAction(uid: string, newPassword: string): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    await loadTarget(w, uid)
    const pw = String(newPassword ?? '')
    if (pw.length < 6 || pw.length > 128) return { error: 'The password needs at least 6 characters.' }
    const r = await callUserWorker(w, { uid, action: 'updatePassword', newPassword: pw })
    return r.error ? r : { success: 'Password updated.' }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteUserAction(uid: string): Promise<ActionState> {
  try {
    const w = await requireWriter(await getSession())
    const target = await loadTarget(w, uid)
    const r = await callUserWorker(w, { uid })
    if (r.error) return r
    revalidatePath('/dashboard/users')
    return { success: `${target.name || target.email || 'The user'} was deleted.` }
  } catch (e) {
    return fail(e)
  }
}
