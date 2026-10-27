'use client'

import { useActionState, useState } from 'react'
import { forgotPasswordAction, loginAction, type LoginState, type ResetState } from '@/app/actions/auth'
import { validateLogin } from '@/lib/auth/validation'
import PrimaryButton from './PrimaryButton'
import TextField from './TextField'

const INITIAL: LoginState = {}
const INITIAL_RESET: ResetState = {}

/** The sign-in form. Checks fields in the browser for quick feedback; the server checks again. */
export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL)
  const [reset, resetAction, resetting] = useActionState(forgotPasswordAction, INITIAL_RESET)
  const [last, setLast] = useState<'login' | 'reset'>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [clientErrors, setClientErrors] = useState<ReturnType<typeof validateLogin>>({})

  const errors = { ...state.fieldErrors, ...clientErrors }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // The forgot-password button only needs an email, which its own action checks.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null
    if (submitter?.dataset.skipValidation) {
      setLast('reset')
      return
    }
    setLast('login')
    const data = new FormData(e.currentTarget)
    const found = validateLogin({ email: String(data.get('email') ?? '').trim(), password: String(data.get('password') ?? '') })
    setClientErrors(found)
    if (Object.keys(found).length) e.preventDefault()
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate>
      {last === 'reset' && reset.success && (
        <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] font-medium text-emerald-700">
          {reset.success}
        </div>
      )}
      {(last === 'login' ? state.error : reset.error) && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] font-medium text-red-700">
          {last === 'login' ? state.error : reset.error}
        </div>
      )}

      <TextField
        id="email"
        name="email"
        label="Email"
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        defaultValue={state.email}
        error={errors.email}
        onChange={() => clientErrors.email && setClientErrors((c) => ({ ...c, email: undefined }))}
      />
      <TextField
        id="password"
        name="password"
        label="Password"
        type={showPassword ? 'text' : 'password'}
        placeholder="••••••••"
        autoComplete="current-password"
        error={errors.password}
        onChange={() => clientErrors.password && setClientErrors((c) => ({ ...c, password: undefined }))}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            className="rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-brand/10"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        }
      />

      <div className="-mt-1 mb-3 text-right">
        <button type="submit" data-skip-validation="true" formAction={resetAction} formNoValidate disabled={resetting} className="text-xs font-semibold text-brand hover:underline disabled:opacity-60">
          {resetting ? 'Sending…' : 'Forgot password?'}
        </button>
      </div>

      <PrimaryButton type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign In →'}
      </PrimaryButton>
    </form>
  )
}
