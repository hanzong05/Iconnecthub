import { logoutAction } from '@/app/actions/auth'
import { canSee, NAV, type CountKey, type NavLink } from './nav'
import NavIcon from './NavIcon'
import NavItem from './NavItem'

const LOGO_URL = 'https://assets.cdn.filesafe.space/Sk7XUXxjVtIrJHKp3GhX/media/6a5634ab46ff6bf8017aab21.png'

export interface SidebarUser {
  email: string
  name: string | null
  role: string
  hub: string | null
  hubId?: string | null
}

const ROLE_LABEL: Record<string, string> = { super: 'Super Admin', manager: 'Manager' }

interface Props {
  user: SidebarUser
  counts?: Partial<Record<CountKey, number>>
  /** A super admin managing one hub sees that hub's manager menu instead of the admin one. */
  viewAs?: { hubId: string; hubName: string }
  /** Phones: whether the drawer is showing. Wide screens always show the sidebar. */
  open: boolean
  onClose: () => void
}

/** The dark-blue navigation column. A fixed column from 768px up, a slide-in drawer below it. */
function withBadge(item: NavLink, counts?: Props['counts']): NavLink {
  const n = item.count && counts?.[item.count.key]
  return n === undefined || !item.count ? item : { ...item, badge: { text: n.toLocaleString('en-US'), tone: item.count.tone } }
}

/** The hub-manager menu points the shared items at the hub being managed. */
function forHub(item: NavLink, hubId: string): NavLink {
  if (item.children) return { ...item, children: item.children.map((c) => forHub(c, hubId)) }
  if (item.href === '/dashboard') return { ...item, href: `/dashboard/hubs/${encodeURIComponent(hubId)}` }
  if (item.href && item.href !== '/dashboard/hubs' && item.href !== '/dashboard/users') return { ...item, href: `${item.href}?hub=${encodeURIComponent(hubId)}` }
  return item
}

export default function Sidebar({ user, counts, viewAs, open, onClose }: Props) {
  const role = viewAs ? 'manager' : user.role
  return (
    <>
      {open && <button type="button" aria-label="Close menu" onClick={onClose} className="fixed inset-0 z-40 bg-ink/50 md:hidden" />}
      <aside
        id="sidebar"
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] max-w-[85vw] flex-col overflow-hidden bg-sb shadow-2xl transition-transform duration-200 md:static md:z-auto md:w-60 md:max-w-none md:translate-x-0 md:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-[18px] pb-4 pt-[22px]">
          <div className="flex min-w-0 items-center gap-[9px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="" width={34} height={34} decoding="async" className="h-[34px] w-[34px] shrink-0 rounded-[9px] object-cover" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold leading-tight text-white">iConnectHub Admin</div>
              <div className="text-[10px] text-white/65">Powered by BlueSpot</div>
            </div>
          </div>
          <button type="button" aria-label="Close menu" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 md:hidden">
            <NavIcon name="close" />
          </button>
        </div>

        <div className="mx-3.5 mb-4 mt-3 rounded-[10px] border border-white/10 bg-white/10 px-3 py-[11px]">
          <div className="mb-[3px] text-[9px] font-bold uppercase tracking-[0.08em] text-sky-300">{viewAs ? 'Viewing as Manager' : (ROLE_LABEL[user.role] ?? user.role)}</div>
          <div className="truncate text-xs font-semibold text-white">{user.name ?? user.email}</div>
          <div className="mt-px truncate text-[10px] text-white/65">{viewAs ? viewAs.hubName : user.role === 'super' ? 'All Hubs' : (user.hub ?? '—')}</div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-3">
          {NAV.map((group) => ({ ...group, items: group.items.filter((i) => (i.superOnly ? user.role === 'super' : true) && (!i.onlyHub || i.onlyHub === (viewAs?.hubId ?? user.hubId)) && (canSee(i.access, role) || Boolean(viewAs && i.href === '/dashboard/settings'))) }))
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <div key={group.label || group.items[0].label} className="mb-1">
                {group.label && <div className="px-2 pb-[5px] pt-2.5 text-[9px] font-bold uppercase tracking-widest text-white/40">{group.label}</div>}
                {group.items.map((item) => (
                  <NavItem key={item.label} item={withBadge(viewAs ? forHub(item, viewAs.hubId) : item, counts)} />
                ))}
              </div>
            ))}
        </nav>

        <div className="border-t border-white/10 p-3.5">
          <NavItem item={{ label: 'Account', icon: 'users', href: '/dashboard/account' }} />
          <form action={logoutAction}>
            <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[14.5px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white">
              <NavIcon name="signout" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
