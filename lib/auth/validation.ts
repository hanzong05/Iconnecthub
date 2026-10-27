export interface LoginInput {
  email: string
  password: string
}

export type LoginFieldErrors = Partial<Record<keyof LoginInput, string>>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Checks the sign-in fields. Used on the server (the real check) and in the browser (for quick feedback). */
export function validateLogin(input: LoginInput): LoginFieldErrors {
  const errors: LoginFieldErrors = {}
  if (!input.email) errors.email = 'Enter your email.'
  else if (input.email.length > 254 || !EMAIL.test(input.email)) errors.email = 'Enter a valid email address.'
  if (!input.password) errors.password = 'Enter your password.'
  else if (input.password.length > 200) errors.password = 'Password is too long.'
  return errors
}
