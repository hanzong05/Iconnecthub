import type { ReactNode } from 'react'
import NavIcon from './NavIcon'
import PushButton from './PushButton'

interface Props {
  title: string
  onMenu: () => void
  menuOpen: boolean
  /** Optional control shown at the right end of the bar. */
  action?: ReactNode
}

/** The top bar: menu button (phones) and the page title. */
export default function Header({ title, onMenu, menuOpen, action }: Props) {
  return (
    <header className="flex h-[58px] shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-6">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="sidebar"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface2 md:hidden"
      >
        <NavIcon name="menu" className="h-5 w-5" />
      </button>

      <h1 className="min-w-0 flex-1 truncate text-base font-bold text-ink">{title}</h1>
      <PushButton />
      {action}
    </header>
  )
}
