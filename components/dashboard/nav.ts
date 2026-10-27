export type IconName =
  | 'dashboard'
  | 'subscribers'
  | 'announcements'
  | 'events'
  | 'chat'
  | 'newsletter'
  | 'settings'
  | 'pin'
  | 'hubs'
  | 'users'
  | 'signout'
  | 'menu'
  | 'close'
  | 'chevron'
  | 'check'

/**
 * Who sees an item, matching the hub admin:
 *  - everyone (no value)
 *  - 'super'    : Super Admin only
 *  - 'hubAdmin' : Super Admin and Super Manager
 *  - 'manager'  : Manager and Super Manager (the day-to-day single-hub content)
 */
export type Access = 'super' | 'hubAdmin' | 'manager'

export function canSee(access: Access | undefined, role: string): boolean {
  if (!access) return true
  if (access === 'super') return role === 'super'
  if (access === 'hubAdmin') return role === 'super' || role === 'super_manager'
  return role === 'manager' || role === 'super_manager'
}

export type CountKey = 'subscribers' | 'announcements' | 'events' | 'hubs' | 'users'

export interface NavLink {
  label: string
  icon?: IconName
  /** A small count shown at the right of the item. */
  badge?: { text: string; tone: 'blue' | 'green' }
  /** Which live count to show as the badge, and its colour. */
  count?: { key: CountKey; tone: 'blue' | 'green' }
  active?: boolean
  /** Who may see this item. Hiding it is only for tidiness: pages and actions check access on the server too. */
  access?: Access
  /** Pages that exist so far. Other items are still mockups. */
  href?: string
  /** Sub-items turn the entry into an expandable group. */
  children?: NavLink[]
}

export interface NavGroup {
  /** Empty means no heading. */
  label: string
  items: NavLink[]
}

/** The sidebar menu. Items a role may not see are filtered out in the sidebar. */
export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', icon: 'dashboard', href: '/dashboard' },
      { label: 'Subscribers', icon: 'subscribers', href: '/dashboard/subscribers', count: { key: 'subscribers', tone: 'green' } },
    ],
  },
  {
    label: 'My Hub Content',
    items: [
      { label: 'Announcements', icon: 'announcements', access: 'manager', count: { key: 'announcements', tone: 'blue' } },
      { label: 'Events', icon: 'events', access: 'manager', count: { key: 'events', tone: 'green' } },
      { label: 'Guest Chat', icon: 'chat', access: 'manager' },
      { label: 'Newsletter', icon: 'newsletter', access: 'manager' },
    ],
  },
  {
    label: '',
    items: [{ label: 'Settings', icon: 'settings', access: 'hubAdmin' }],
  },
  {
    label: 'Tools',
    items: [
      {
        label: 'Path Finder',
        icon: 'pin',
        access: 'super',
        children: [{ label: 'Campgrounds' }, { label: 'Map & Locations' }, { label: 'Calibration' }],
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Hubs', icon: 'hubs', access: 'super', href: '/dashboard/hubs', count: { key: 'hubs', tone: 'blue' } },
      { label: 'Users', icon: 'users', access: 'hubAdmin', href: '/dashboard/users', count: { key: 'users', tone: 'blue' } },
    ],
  },
]
