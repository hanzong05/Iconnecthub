import type { ReactNode } from 'react'

/** One small tile in the feature box: an icon over a label. */
export default function FeatureChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface p-2">
      {icon}
      <span className="text-[8.5px] font-semibold text-ink min-[401px]:text-[9px]">{label}</span>
    </div>
  )
}
