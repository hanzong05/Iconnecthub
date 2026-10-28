'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { NavLink } from './nav'
import NavIcon from './NavIcon'

const BADGE = {
  blue: 'bg-brand text-white',
  green: 'bg-emerald-600 text-white',
}

const ROW = 'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14.5px] font-medium transition-colors duration-150'

/** A sidebar entry. With children it becomes an expandable group. */
export default function NavItem({ item }: { item: NavLink }) {
  const pathname = usePathname()
  const hub = useSearchParams().get('hub')
  const childActive = Boolean(item.children?.some((c) => c.href && pathname === c.href.split('?')[0]))
  const [open, setOpen] = useState(childActive)
  // Opening a page inside the group opens the group; the person can still fold it by hand.
  useEffect(() => {
    if (childActive) setOpen(true)
  }, [childActive])
  const path = item.href?.split('?')[0]
  const active = path ? pathname === path || (path !== '/dashboard' && pathname.startsWith(`${path}/`)) : item.active
  const state = active ? 'bg-sb-active text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'

  if (item.children) {
    return (
      <details className="group mb-1" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className={`${ROW} cursor-pointer list-none select-none ${state} [&::-webkit-details-marker]:hidden`}>
          {item.icon && <NavIcon name={item.icon} />}
          <span className="flex-1">{item.label}</span>
          <NavIcon name="chevron" className="h-4 w-4 transition-transform duration-150 group-open:rotate-180" />
        </summary>
        <div className="mt-1 flex flex-col gap-0.5 pl-9">
          {item.children.map((child) => (
            <NavItem key={child.label} item={{ ...child, active: false }} />
          ))}
        </div>
      </details>
    )
  }

  if (item.href) {
    return (
      <Link href={hub && /^\/dashboard\/(campgrounds|map-locations|calibration)$/.test(item.href) ? `${item.href}?hub=${encodeURIComponent(hub)}` : item.href} aria-current={active ? 'page' : undefined} className={`${ROW} mb-1 ${state}`}>
        {item.icon && <NavIcon name={item.icon} />}
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[item.badge.tone]}`}>{item.badge.text}</span>}
      </Link>
    )
  }

  return (
    <button type="button" aria-current={active ? 'page' : undefined} className={`${ROW} mb-1 ${state}`}>
      {item.icon && <NavIcon name={item.icon} />}
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[item.badge.tone]}`}>{item.badge.text}</span>}
    </button>
  )
}
