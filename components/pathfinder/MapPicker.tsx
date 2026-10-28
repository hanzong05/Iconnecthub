import Link from 'next/link'
import RemoteImg from '@/components/ui/RemoteImg'
import type { CampgroundRecord } from '@/lib/pathfinder/model'

/** Shown when a map screen is opened without a campground chosen (or with an unknown one). */
export default function MapPicker({ items, base, hubQuery, title, notFound }: { items: CampgroundRecord[]; base: string; hubQuery: string; title: string; notFound?: boolean }) {
  const notice = notFound ? (
    <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] font-medium text-amber-800">
      That map could not be found in this hub.{items.length ? ' Choose one below.' : ''}
    </div>
  ) : null
  if (items.length === 0)
    return (
      <div>
        {notice}
      <div className="rounded-2xl border border-dashed border-line2 bg-surface px-6 py-12 text-center">
        <p className="text-sm font-semibold text-ink">No maps yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink3">Add a map first, then come back to {title.toLowerCase()}.</p>
        <Link href={`/dashboard/campgrounds${hubQuery ? `?${hubQuery}` : ''}`} className="mt-4 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dim">
          Go to Maps
        </Link>
      </div>
      </div>
    )
  return (
    <div>
      {notice}
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <p className="mb-4 text-[13px] text-ink3">Choose a map.</p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((c) => (
          <li key={c.id}>
            <Link href={`${base}?map=${encodeURIComponent(c.id)}${hubQuery ? `&${hubQuery}` : ''}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm transition-colors hover:border-brand">
              <RemoteImg src={c.mapImage} w={120} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
              <span className="min-w-0 truncate text-sm font-semibold text-ink">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
