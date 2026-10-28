import NavIcon from './NavIcon'
import type { IconName } from './nav'

const TONE = {
  purple: { name: 'hubs', icon: 'text-violet-600', line: 'stroke-violet-600', d: 'M0,22 C12,22 16,10 26,12 S40,24 52,18 66,8 78,14 92,20 100,12' },
  green: { name: 'subscribers', icon: 'text-emerald-600', line: 'stroke-emerald-600', d: 'M0,18 C12,20 18,24 28,20 S44,8 56,14 70,22 82,12 94,14 100,16' },
  amber: { name: 'users', icon: 'text-amber-600', line: 'stroke-amber-600', d: 'M0,20 C14,16 20,8 32,14 S48,24 60,16 74,10 86,18 94,16 100,14' },
  blue: { name: 'announcements', icon: 'text-brand', line: 'stroke-brand', d: 'M0,16 C12,14 18,22 30,18 S46,10 58,16 72,22 84,14 94,16 100,18' },
  cyan: { name: 'announcements', icon: 'text-sky-500', line: 'stroke-sky-500', d: 'M0,20 C12,18 18,10 30,14 S46,22 58,16 72,8 84,14 94,12 100,10' },
} as const satisfies Record<string, { name: IconName; icon: string; line: string; d: string }>

const ICON = { hubs: 'hubs', group: 'subscribers', person: 'users', bell: 'announcements' } as const

export type Tone = keyof typeof TONE

/** A summary number with a label, an icon tile and a small trend-line decoration (as on the hub admin). */
export default function StatCard({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon?: keyof typeof ICON }) {
  const t = TONE[tone]
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[18px] border border-line bg-surface p-3.5 shadow min-[480px]:p-[18px]-[0_2px_8px_rgba(15,31,74,0.04)]">
      {tone === 'cyan' && <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-sky-500 to-transparent" />}
      <div className="mb-2 truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-ink3">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[26px] font-extrabold leading-none text-ink sm:text-[30px]">{value}</div>
        <div aria-hidden="true" className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] bg-[#e8f0fe] ${t.icon}`}>
          <NavIcon name={(icon && ICON[icon]) || t.name} className="h-5 w-5" />
        </div>
      </div>
      <svg aria-hidden="true" viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-3 block h-[30px] w-full">
        <path d={t.d} fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className={t.line} />
      </svg>
    </div>
  )
}
