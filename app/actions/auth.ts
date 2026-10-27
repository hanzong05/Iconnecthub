'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requestPasswordReset, signInWithFirebase } from '@/lib/auth/credentials'
import { clearFailures, recordFailure, retryAfter } from '@/lib/auth/rate-limit'
import { endSession, startSession } from '@/lib/auth/session'
import { validateLogin, type LoginFieldErrors } from '@/lib/auth/validation'
import { getAuthEnv } from '@/lib/env'

export interface LoginState {
  error?: string
  fieldErrors?: LoginFieldErrors
  email?: string
}

export interface ResetState {
  error?: string
  success?: string
}

async function clientKey(scope: string, email: string) {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  return `${scope}|${ip}|${email.toLowerCase()}`
}

/** A Server Action is a public endpoint: everything is validated and limited here. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  const fieldErrors = validateLogin({ email, password })
  if (Object.keys(fieldErrors).length) return { fieldErrors, email }

  const env = getAuthEnv()
  const key = await clientKey('login', email)

  const wait = retryAfter(key, env.maxAttempts)
  if (wait) return { error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`, email }

  const result = await signInWithFirebase(email, password)
  if (!result.ok) {
    if (result.reason === 'unavailable') return { error: 'Sign-in is unavailable right now. Try again shortly.', email }
    recordFailure(key, env.windowMs)
    if (result.reason === 'throttled') return { error: 'Too many attempts. Try again later.', email }
    if (result.reason === 'disabled') return { error: 'This account has been disabled.', email }
    const hint = process.env.NODE_ENV === 'development' && result.detail ? ` [dev: ${result.detail}]` : ''
    return { error: `Incorrect email or password.${hint}`, email } // same message for unknown email and wrong password
  }

  clearFailures(key)
  await startSession(result.user, result.refreshToken)
  redirect('/dashboard')
}

/** Sends a reset email through the password reset worker. Limited per email and IP. */
export async function forgotPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get('email') ?? '').trim()
  const errors = validateLogin({ email, password: 'x' })
  if (errors.email) return { error: errors.email === 'Enter your email.' ? 'Enter your email address above first.' : errors.email }

  const env = getAuthEnv()
  const key = await clientKey('reset', email)
  if (retryAfter(key, 3)) return { error: 'Too many reset requests. Try again later.' }
  recordFailure(key, env.windowMs) // every request counts, successful or not

  const result = await requestPasswordReset(email)
  return result.ok ? { success: 'Reset email sent. Check your inbox (and spam folder).' } : { error: result.message }
}

export async function logoutAction(): Promise<void> {
  await endSession()
  redirect('/')
}
