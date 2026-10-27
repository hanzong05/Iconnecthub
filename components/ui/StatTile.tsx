import Icon, { type IconName } from './Icon'

const TONES = {
  green: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-brand',
  purple: 'bg-violet-50 text-violet-600',
  orange: 'bg-orange-50 text-orange-500',
} as const

/** A summary figure with an icon tile, as at the top of the Subscribers and Hubs pages. */
export default function StatTile({ icon, tone, label, value, note }: { icon: IconName; tone: keyof typeof TONES; label: string; value: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2.5 rounded-2xl border border-line bg-surface p-3.5 shadow-[0_2px_8px_rgba(15,31,74,0.04)] sm:flex-row sm:items-center sm:gap-3.5 sm:p-[18px]">
      <div aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-[52px] sm:w-[52px] ${TONES[tone]}`}>
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <div className="min-w-0 max-w-full">
        <div className="text-xs font-medium text-ink2">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xl font-extrabold leading-tight text-ink sm:text-2xl" suppressHydrationWarning>{value}</span>
          {note && <span className="text-[11px] text-ink3">{note}</span>}
        </div>
      </div>
    </div>
  )
}
