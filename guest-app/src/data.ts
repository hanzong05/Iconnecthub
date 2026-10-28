import { useEffect, useRef, useState } from 'react'

export interface Feed<T> { data: T | null; loaded: boolean; error: boolean }

/**
 * Reads one path of the database over its REST address and refreshes it while the page is visible.
 * Guests only ever read; nothing here writes. A failed refresh keeps the last good value.
 */
export function useFeed<T = unknown>(dbUrl: string, path: string, everyMs = 30_000, enabled = true): Feed<T> {
  const [state, setState] = useState<Feed<T>>({ data: null, loaded: !enabled, error: false })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const ctl = new AbortController()
    const load = async () => {
      try {
        const res = await fetch(`${dbUrl}/${path}.json`, { signal: ctl.signal, cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as T | null
        if (alive) setState({ data, loaded: true, error: false })
      } catch {
        if (alive) setState((p) => ({ ...p, loaded: true, error: p.data === null }))
      }
      if (alive && !document.hidden) timer.current = setTimeout(load, everyMs)
    }
    const onVisible = () => {
      if (!document.hidden) {
        if (timer.current) clearTimeout(timer.current)
        void load()
      }
    }
    void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      ctl.abort()
      if (timer.current) clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [dbUrl, path, everyMs, enabled])
  return state
}
