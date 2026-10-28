'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Icon from '@/components/ui/Icon'
import Header from './Header'
import MainContent from './MainContent'
import { ShellSetterContext, type Counts, type ShellInfo } from './ShellContext'
import Sidebar, { type SidebarUser } from './Sidebar'

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/hubs': 'Hubs',
  '/dashboard/users': 'Users',
  '/dashboard/subscribers': 'Subscribers',
  '/dashboard/announcements': 'Announcements',
  '/dashboard/events': 'Events',
  '/dashboard/chat': 'Guest Chat',
  '/dashboard/newsletter': 'Newsletter',
  '/dashboard/settings': 'Settings',
  '/dashboard/monthly-happenings': 'Monthly Happenings',
  '/dashboard/music-festival': 'Music Festival',
  '/dashboard/campgrounds': 'Maps',
  '/dashboard/map-locations': 'Map & Locations',
  '/dashboard/calibration': 'Calibration',
}

/** A title that is right the moment the address changes, before the new page has sent its own. */
function titleFor(path: string): string {
  return TITLES[path] ?? (path.startsWith('/dashboard/hubs/') ? 'Manage Hub' : 'Dashboard')
}

/**
 * The sidebar, header and scrolling area, mounted once by the dashboard layout. Moving between pages swaps only the
 * content inside; the menu, its scroll position, the badges and the phone drawer are not rebuilt.
 */
export default function DashboardFrame({ user, children }: { user: SidebarUser; children: ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [info, setInfo] = useState<ShellInfo | null>(null)
  const [counts, setCounts] = useState<Counts>({})
  const mainRef = useRef<HTMLElement>(null)

  const set = useCallback((next: ShellInfo, nextCounts?: Counts) => {
    setInfo(next)
    if (nextCounts) {
      // Keep badges from pages visited earlier; only replace the ones this page knows.
      const known = Object.fromEntries(Object.entries(nextCounts).filter(([, v]) => typeof v === 'number'))
      setCounts((prev) => ({ ...prev, ...known }))
    }
  }, [])

  // A new page starts at the top and closes the phone drawer.
  useEffect(() => {
    setMenuOpen(false)
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const current = info && info.path === pathname ? info : null
  const title = current?.title ?? titleFor(pathname)
  // The hub view stays as it was until the next page reports its own, so the menu does not flip back and forth.
  const viewAs = (current ?? info)?.viewAs
  const backToHubs = current?.backToHubs ?? false

  return (
    <ShellSetterContext.Provider value={set}>
      <div className="flex h-dvh overflow-hidden bg-bg">
        <Sidebar user={user} counts={counts} viewAs={viewAs} open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            title={title}
            menuOpen={menuOpen}
            onMenu={() => setMenuOpen(true)}
            action={
              backToHubs ? (
                <Link href="/dashboard/hubs" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line2 bg-surface px-3 text-[13px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand">
                  <Icon name="left" className="h-4 w-4" />
                  Back to Hubs
                </Link>
              ) : undefined
            }
          />
          <MainContent ref={mainRef}>{children}</MainContent>
        </div>
      </div>
    </ShellSetterContext.Provider>
  )
}
