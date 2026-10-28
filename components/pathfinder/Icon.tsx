'use client'

import type { ReactNode } from 'react'

/** Line icons drawn as inline SVG (24×24, stroke = currentColor). */
const PATHS: Record<string, ReactNode> = {
  all: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  tent: <><path d="M3 20 12 4l9 16z" /><path d="M12 20v-7" /><path d="M9.5 20 12 13l2.5 7" /></>,
  rv: <><path d="M2 7h12v9H2z" /><path d="M14 10h4l4 4v2h-8z" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  cabin: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
  restroom: <><circle cx="8" cy="5" r="2" /><path d="M6 9h4l-1 6h-2z" /><path d="M6 15v6M10 15v6" /><circle cx="16" cy="5" r="2" /><path d="M14 9h4v6h-1v6h-2v-6h-1z" /></>,
  shower: <><path d="M4 3v4M9 3v4M14 3v4" /><path d="M3 9h18" /><path d="M7 9v2a5 5 0 0 0 10 0V9" /><path d="M9 19v2M12 19v2M15 19v2" /></>,
  dump: <><path d="M3 18h18" /><path d="M6 18 8 10h8l2 8" /><path d="M10 10V6h4v4" /></>,
  water: <><path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" /></>,
  electric: <><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></>,
  playground: <><path d="M5 21V7" /><path d="M5 7h12l-3 4 3 4H5" /><path d="M3 21h4" /></>,
  pavilion: <><path d="M2 10 12 4l10 6" /><path d="M4 10v10M20 10v10" /><path d="M9 20v-6h6v6" /></>,
  fishing: <><path d="M4 20c5-2 7-7 7-16" /><path d="M11 8c3 2 6 2 9 0" /><path d="M14 14l5 6" /></>,
  hiking: <><path d="M3 20 9 9l4 6 3-4 5 9z" /></>,
  parking: <><path d="M8 21V3h5a4.5 4.5 0 0 1 0 9H8" /></>,
  emergency: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M7 12h10" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7.5v.01" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  guide: <><path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" /><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z" /></>,
  more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
  campgrounds: <><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  signout: <><path d="M15 4h4v16h-4" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h10" /></>,
  locate: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v4h16v-4" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /></>,
  back: <><path d="m15 18-6-6 6-6" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  directions: <><path d="M3 11 20 4l-7 17-2-7z" /></>,
  pin: <><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
}

export type IconName = keyof typeof PATHS

export default function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

/** Default site picture used on the details card and bottom bar, until a site has its own photo. */
export function SitePhoto({ className = 'h-14 w-14' }: { className?: string }) {
  return <img src="/site-photo.jpg" alt="" aria-hidden="true" className={`${className} rounded-xl object-cover object-top`} />
}
