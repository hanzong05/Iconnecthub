import 'server-only'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`)
  return value
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive whole number.`)
  return n
}

function url(name: string): string {
  const value = required(name).replace(/\/+$/, '')
  if (!/^https?:\/\//.test(value)) throw new Error(`${name} must start with https://`)
  return value
}

function optionalUrl(name: string): string | null {
  const value = process.env[name]?.trim().replace(/\/+$/, '')
  if (!value) return null
  if (!/^https?:\/\//.test(value)) throw new Error(`${name} must start with https://`)
  return value
}

/** Validated server-side settings. Read lazily so a build does not need the values. */
export function getAuthEnv() {
  const secret = required('AUTH_SECRET')
  if (secret.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters.')
  const emulator = process.env.NODE_ENV !== 'production' ? process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim() : undefined
  return {
    secret,
    firebaseApiKey: required('FIREBASE_API_KEY'),
    firebaseDatabaseUrl: url('FIREBASE_DATABASE_URL'),
    // Standard Firebase convention for local testing only. Ignored in production.
    identityBase: emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com',
    tokenBase: emulator ? `http://${emulator}/securetoken.googleapis.com` : 'https://securetoken.googleapis.com',
    // Optional features: leave unset to switch them off.
    imgbbApiKey: process.env.IMGBB_API_KEY?.trim() || null,
    imgbbUploadUrl: (process.env.NODE_ENV !== 'production' && process.env.IMGBB_API_URL?.trim()) || 'https://api.imgbb.com/1/upload',
    pushWorkerUrl: optionalUrl('PUSH_WORKER_URL'),
    passwordResetWorkerUrl: url('PASSWORD_RESET_WORKER_URL'),
    sessionSeconds: positiveInt('SESSION_HOURS', 8) * 3600,
    maxAttempts: positiveInt('LOGIN_MAX_ATTEMPTS', 5),
    windowMs: positiveInt('LOGIN_WINDOW_MINUTES', 15) * 60_000,
  }
}
