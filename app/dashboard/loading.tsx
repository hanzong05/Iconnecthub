/** Shown inside the content area while a page loads its data. The sidebar and header stay where they are. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="flex flex-col gap-[18px]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-[24px] bg-surface" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-[24px] bg-surface" />
      </div>
    </div>
  )
}
