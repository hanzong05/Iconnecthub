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
const PASSWORD_MIN = 10
const PASSWORD_MAX = 128
const HUB_ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Writes who changed which account to the hub's history (hubs/{id}/audit), as the Settings page does. Never records a
 * password. A failed write is logged and never blocks the change itself.
 */
async function auditUser(w: Awaited<ReturnType<typeof requireWriter>>, hubId: string | undefined, action: string, summary: string): Promise<void> {
  const at = new Date().toISOString()
  const hub = hubId && HUB_ID.test(hubId) ? hubId : '_global'
  try {
    await rtdb('PUT', `hubs/${hub}/audit/${at.slice(0, 7)}/u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, w.token, { at, by: w.session.email, action, summary: summary.slice(0, 300) })
  } catch (e) {
    console.error('[users] audit write failed', e instanceof Error ? e.message : e)
  }
}

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
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return { error: `The temporary password needs at least ${PASSWORD_MIN} characters.` }
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
      if (code.startsWith('WEAK_PASSWORD')) return { error: `That password is too weak. Use at least ${PASSWORD_MIN} characters.` }
      if (code.startsWith('OPERATION_NOT_ALLOWED')) return { error: 'Creating accounts is turned off in Firebase (enable Email/Password sign-in).' }
      if (code.startsWith('INVALID_EMAIL')) return { error: 'Enter a valid email address.' }
      console.error('[users] signUp failed:', code || res.status)
      return { error: 'The account could not be created. Try again.' }
    }

    // The record is written with the signed-in admin's token, never the new account's: the database only lets a super admin or
    // super manager write users, and letting a brand-new account write its own role would let anyone who signs up make themselves super.
    const uid = json.localId
    try {
      await rtdb('PUT', `users/${uid}`, w.token, {
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
    } catch (e) {
      // Do not leave a sign-in account with no profile: it would block trying again with "email already has an account".
      await fetch(`${env.identityBase}/v1/accounts:delete?key=${encodeURIComponent(env.firebaseApiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: json.idToken }),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null)
      if (e instanceof AccessError) return { error: 'The account could not be saved because the database refused the new user record. Nothing was created. Check the database rules for users.' }
      throw e
    }

    await auditUser(w, hubId === '_global' ? undefined : hubId, 'user.create', `Created ${role} account for ${email}.`)

    // Welcome email through the worker, if one is set up. A failure here never undoes the account.
    // The reason is shown to the admin (status and the worker's short error text only; never the password).
    let mailed = false
    let mailNote = ''
    if (!env.pushWorkerUrl) {
      mailNote = ' (no email worker is set up for this app)'
    } else {
      try {
        const h = await headers()
        const host = h.get('x-forwarded-host') ?? h.get('host')
        const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
        const base = env.pushWorkerUrl.endsWith('/') ? env.pushWorkerUrl : `${env.pushWorkerUrl}/`
        const mail = await fetch(`${base}send-welcome`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: w.token, uid, email, name, password, loginUrl: host ? `${proto}://${host}/` : '' }),
          signal: AbortSignal.timeout(15_000),
        })
        const data = (await mail.json().catch(() => ({}))) as { sent?: number; error?: unknown; id?: unknown }
        mailed = mail.ok && (data.sent ?? 0) > 0
        if (mailed && typeof data.id === 'string' && /^[\w-]{8,64}$/.test(data.id)) mailNote = ` (email id ${data.id})`
        if (!mailed) {
          const why = typeof data.error === 'string' ? data.error.replace(/\s+/g, ' ').slice(0, 120) : 'no reason given'
          mailNote = ` (the email worker answered ${mail.status}: ${why})`
        }
      } catch {
        mailed = false
        mailNote = ' (the email worker could not be reached)'
      }
    }

    revalidatePath('/dashboard/users')
    return { success: mailed ? `Account created for ${name}. A welcome email was sent.${mailNote}` : `Account created for ${name}. Give them the temporary password.${mailNote}` }
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
    const target = await loadTarget(w, uid)
    await rtdb('PATCH', `users/${uid}`, w.token, { active: Boolean(active) })
    await auditUser(w, target.hubId, active ? 'user.activate' : 'user.deactivate', `${active ? 'Activated' : 'Deactivated'} ${target.email || uid}.`)
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
    const target = await loadTarget(w, uid)
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
    await auditUser(w, hubId === '_global' ? target.hubId : hubId, 'user.access', `Changed ${target.email || uid} from ${target.role ?? 'none'} (${target.hubId ?? 'no hub'}) to ${role} (${hubId}).`)
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
    const target = await loadTarget(w, uid)
    const pw = String(newPassword ?? '')
    if (pw.length < PASSWORD_MIN || pw.length > PASSWORD_MAX) return { error: `The password needs at least ${PASSWORD_MIN} characters.` }
    const r = await callUserWorker(w, { uid, action: 'updatePassword', newPassword: pw })
    if (r.error) return r
    await auditUser(w, target.hubId, 'user.password', `Changed the password for ${target.email || uid}.`)
    return { success: 'Password updated.' }
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
    await auditUser(w, target.hubId, 'user.delete', `Deleted ${target.email || uid} (${target.role ?? 'no role'}).`)
    revalidatePath('/dashboard/users')
    return { success: `${target.name || target.email || 'The user'} was deleted.` }
  } catch (e) {
    return fail(e)
  }
}
