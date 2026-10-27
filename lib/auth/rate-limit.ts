import 'server-only'

interface Bucket {
  count: number
  resetAt: number
}

// In memory: fine for one server instance. Use a shared store (Redis, database) when running several.
const buckets = new Map<string, Bucket>()

function live(key: string, now: number): Bucket | undefined {
  const b = buckets.get(key)
  if (b && b.resetAt <= now) {
    buckets.delete(key)
    return undefined
  }
  return b
}

/** Seconds until the key may try again, or 0 when it is allowed. */
export function retryAfter(key: string, max: number): number {
  const now = Date.now()
  const b = live(key, now)
  return b && b.count >= max ? Math.ceil((b.resetAt - now) / 1000) : 0
}

export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now()
  const b = live(key, now)
  if (b) b.count += 1
  else buckets.set(key, { count: 1, resetAt: now + windowMs })
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k)
}

export function clearFailures(key: string): void {
  buckets.delete(key)
}
