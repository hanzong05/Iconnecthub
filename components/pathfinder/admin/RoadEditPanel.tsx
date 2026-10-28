'use client'

interface Props {
  name: string
  /** How many road points are selected on the map. */
  pointCount: number
  onDeletePoints: () => void
  onDeleteRoad: () => void
  onClose: () => void
}

/** Admin: options for the road that was tapped on the map. */
export default function RoadEditPanel({ name, pointCount, onDeletePoints, onDeleteRoad, onClose }: Props) {
  const btn = 'rounded-lg bg-surface2 px-3 py-2 text-xs font-semibold text-ink hover:bg-line'
  return (
    <div className="absolute inset-x-3 top-3 z-20 space-y-2 rounded-xl border border-line bg-bg/95 p-3 text-ink shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-semibold">Road “{name}”</div>
        <button onClick={onClose} className="text-xs text-ink3 underline">
          Close
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {pointCount > 0 && (
          <button className={btn} onClick={onDeletePoints}>
            {pointCount === 2 ? 'Delete line between the 2 points' : `Delete ${pointCount} selected point${pointCount === 1 ? '' : 's'}`}
          </button>
        )}
        <button className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700" onClick={onDeleteRoad}>
          Delete road
        </button>
      </div>
      {pointCount === 0 && <p className="text-[11px] text-ink3">Tap white points on the road to select them. Tap again to unselect.</p>}
    </div>
  )
}
