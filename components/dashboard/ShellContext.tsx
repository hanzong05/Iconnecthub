'use client'

import { createContext, useContext, useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'
import type { CountKey } from './nav'

export interface ShellInfo {
  /** The page the details below belong to. */
  path: string
  title: string
  viewAs?: { hubId: string; hubName: string }
  backToHubs: boolean
}

export type Counts = Partial<Record<CountKey, number>>

interface Setter {
  (info: ShellInfo, counts?: Counts): void
}

export const ShellSetterContext = createContext<Setter | null>(null)

/**
 * Rendered by each page. It hands the page's title, badge counts and hub view to the shared sidebar and header,
 * which stay mounted while only the page content changes. It draws nothing itself.
 */
export function ShellSync({ title, counts, viewAs, backToHubs = false }: { title: string; counts?: Counts; viewAs?: { hubId: string; hubName: string }; backToHubs?: boolean }) {
  const set = useContext(ShellSetterContext)
  const path = usePathname()
  const key = JSON.stringify([path, title, counts, viewAs, backToHubs])
  useLayoutEffect(() => {
    set?.({ path, title, viewAs, backToHubs }, counts)
    // key already captures every input above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set])
  return null
}
