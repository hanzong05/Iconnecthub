'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Header from './Header'
import MainContent from './MainContent'
import type { CountKey } from './nav'
import Sidebar, { type SidebarUser } from './Sidebar'

/** Sidebar + header + main content. Owns the open state of the phone drawer. */
export default function DashboardShell({ title, user, counts, children }: { title: string; user: SidebarUser; counts?: Partial<Record<CountKey, number>>; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <Sidebar user={user} counts={counts} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} menuOpen={menuOpen} onMenu={() => setMenuOpen(true)} />
        <MainContent>{children}</MainContent>
      </div>
    </div>
  )
}
