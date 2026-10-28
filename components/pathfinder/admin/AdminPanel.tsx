'use client'

import { useState, type ReactNode } from 'react'
import Icon, { type IconName } from '../Icon'

export interface AdminTab {
  id: string
  label: string
  icon: IconName
  content: ReactNode
}

interface Props {
  title: string
  subtitle?: string
  tabs: AdminTab[]
}

/** The editing column beside the map (below it on a phone). One section shows at a time. */
export default function AdminPanel({ title, subtitle, tabs }: Props) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '')
  const current = tabs.find((t) => t.id === activeId) ?? tabs[0]

  return (
    <aside className="flex w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface md:min-h-0 md:w-[340px] md:shrink-0">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <div className="truncate text-xs text-ink2">{subtitle}</div>}
      </div>
      <div role="tablist" aria-label="Map editing sections" className="mx-3 flex gap-1 rounded-[10px] bg-surface p-1">
        {tabs.map((t) => {
          const selected = t.id === current?.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveId(t.id)}
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[8px] text-xs font-semibold transition-colors duration-150 ${
                selected ? 'bg-brand text-white' : 'text-ink2 hover:bg-line'
              }`}
            >
              <Icon name={t.icon} className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" className="flex-1 space-y-3 p-3 md:overflow-y-auto">
        {current?.content}
      </div>
    </aside>
  )
}
