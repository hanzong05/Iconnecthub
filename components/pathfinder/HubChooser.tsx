'use client'

import { useRouter } from 'next/navigation'

/** The "Select hub" card used by Path Finder. A Super Admin picks the hub from a dropdown; nothing is shown until one is picked. */
export function HubSelectCard({ hubs, base, value }: { hubs: { id: string; name: string }[]; base: string; value?: string }) {
  const router = useRouter()
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
      <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink2">
        Select hub
        <select
          className="min-h-11 w-full rounded-xl border border-line2 bg-surface2 px-3.5 py-2.5 text-base font-semibold normal-case tracking-normal text-ink outline-none focus:border-brand sm:text-sm"
          value={value ?? ''}
          disabled={hubs.length === 0}
          onChange={(e) => e.target.value && router.push(`${base}?hub=${encodeURIComponent(e.target.value)}`)}
        >
          {!value && <option value="">{hubs.length ? '— Choose a hub —' : 'No hubs yet'}</option>}
          {hubs.map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      </label>
    </section>
  )
}

/** Path Finder works on one hub at a time. Before a hub is picked, only the dropdown and an empty state show. */
export default function HubChooser({ hubs, base, title }: { hubs: { id: string; name: string }[]; base: string; title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <HubSelectCard hubs={hubs} base={base} />
      <div className="rounded-2xl border border-dashed border-line2 bg-surface px-6 py-16 text-center">
        <div className="text-[15px] font-bold text-ink">{title}</div>
        <p className="mt-1 text-[13px] text-ink3">Select a hub above to see and edit its maps.</p>
      </div>
    </div>
  )
}
