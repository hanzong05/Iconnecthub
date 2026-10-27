import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { getAuthEnv } from '@/lib/env'

const key = () => createHash('sha256').update(`vault:${getAuthEnv().secret}`).digest()

/** Encrypts a short secret (AES-256-GCM) so it can sit in an HttpOnly cookie without being readable. */
export function seal(text: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')
}

export function unseal(value: string | undefined): string | null {
  if (!value) return null
  try {
    const raw = Buffer.from(value, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
