'use client'

import type { ReactNode } from 'react'
import NavIcon from './NavIcon'
import type { IconName } from './nav'

const TONE = {
  blue: { icon: 'bg-gradient-to-br from-[#e8f0fe] to-[#dfe9f8] text-brand', btn: 'from-brand to-blue-600 shadow-[0_4px_12px_rgba(26,86,219,0.25)] hover:from-blue-700 hover:to-blue-800' },
  green: { icon: 'bg-gradient-to-br from-[#d9f7e8] to-[#c6f0db] text-emerald-600', btn: 'from-emerald-600 to-emerald-500 shadow-[0_4px_12px_rgba(5,150,105,0.25)] hover:from-emerald-700 hover:to-emerald-600' },
  purple: { icon: 'bg-gradient-to-br from-[#ece2fb] to-[#e0d0f7] text-violet-600', btn: 'from-violet-600 to-purple-600 shadow-[0_4px_12px_rgba(124,58,237,0.25)] hover:from-violet-700 hover:to-violet-600' },
} as const

interface Props {
  title: string
  icon: IconName
  tone: keyof typeof TONE
  empty: string
  action: string
  count: number
  onAction?: () => void
  children?: ReactNode
}

/** A quick-action card: icon, title, a short list, and a full-width button (button is a mockup for now). */
export default function ListCard({ title, icon, tone, empty, action, count, onAction, children }: Props) {
  const t = TONE[tone]
  return (
    <section className="group flex min-w-0 flex-col rounded-[18px] border border-line bg-gradient-to-br from-white to-[#f9fbff] p-5 shadow-[0_2px_8px_rgba(15,31,74,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_12px_24px_rgba(26,86,219,0.10)]">
      <div className={`mb-2.5 flex h-[50px] w-[50px] items-center justify-center rounded-xl ${t.icon}`}>
        <NavIcon name={icon} className="h-[22px] w-[22px]" />
      </div>
      <h3 className="mb-2.5 text-[15px] font-bold text-ink">{title}</h3>
      <div className="mb-2.5 flex flex-1 flex-col gap-2">
        {count ? children : <div className="rounded-[10px] bg-surface2 px-3 py-2.5 text-[11px] font-medium text-ink3">{empty}</div>}
      </div>
      <button type="button" onClick={onAction} className={`w-full rounded-[10px] bg-gradient-to-br px-4 py-[11px] text-[13px] font-bold text-white transition-all duration-200 hover:-translate-y-px ${t.btn}`}>
        {action}
      </button>
    </section>
  )
}
