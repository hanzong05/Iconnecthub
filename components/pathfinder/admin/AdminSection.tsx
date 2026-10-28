'use client'

import type { ReactNode } from 'react'

interface Props {
  title: string
  count?: number
  description?: string
  children: ReactNode
}

/** One block in the admin panel: a title with an optional count, a short description, then the controls. */
export default function AdminSection({ title, count, description, children }: Props) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {count !== undefined && <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-semibold text-ink2">{count}</span>}
      </header>
      {description && <p className="mt-1 text-xs leading-relaxed text-ink3">{description}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

/** Shared control styles for the admin screens. Dark surfaces, 38px inputs and buttons, purple primary. */
export const adminField = 'h-[38px] w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink3 outline-none focus:border-brand'
export const adminBtnPrimary = 'h-[38px] rounded-[9px] bg-brand px-3.5 text-[13px] font-semibold text-white hover:bg-brand-dim disabled:bg-line disabled:text-ink3'
export const adminBtnAmber = 'h-[38px] rounded-[9px] bg-[#F59E0B] px-3.5 text-[13px] font-semibold text-ink hover:bg-[#FBBF24] disabled:bg-line disabled:text-ink3'
export const adminBtnRed = 'h-[38px] rounded-[9px] bg-[#EF4444] px-3.5 text-[13px] font-semibold text-white hover:bg-[#DC2626] disabled:bg-line disabled:text-ink3'
export const adminBtnGhost = 'h-9 rounded-[9px] border border-line bg-surface2 px-3.5 text-[13px] font-semibold text-ink hover:bg-line disabled:text-ink3'
export const adminLinkDanger = 'text-xs font-semibold text-[#EF4444] hover:underline'
export const adminLinkAction = 'text-xs font-semibold text-brand hover:underline'
