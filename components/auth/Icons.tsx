import type { ReactNode } from 'react'

function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="var(--color-brand)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const MonitorIcon = ({ size = 18 }: { size?: number }) => (
  <Svg size={size}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="2" y1="17" x2="22" y2="17" />
  </Svg>
)

export const BellIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
  </Svg>
)

export const CalendarIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Svg>
)

export const HomeIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </Svg>
)

export const InfoIcon = ({ size = 12 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </Svg>
)
