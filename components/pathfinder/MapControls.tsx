'use client'

interface Props {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

const btn = 'flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-800 shadow-lg ring-1 ring-slate-900/10 active:scale-95'

/** Zoom and "show the whole map" buttons, floating on the right edge of the map. */
export default function MapControls({ onZoomIn, onZoomOut, onFit }: Props) {
  return (
    <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
      <button type="button" className={btn} onClick={onZoomIn} aria-label="Zoom in">
        <span className="text-xl font-semibold">+</span>
      </button>
      <button type="button" className={btn} onClick={onZoomOut} aria-label="Zoom out">
        <span className="text-xl font-semibold">−</span>
      </button>
      <button type="button" className={btn} onClick={onFit} aria-label="Show the whole map" title="Show the whole map">
        <span className="text-lg">◎</span>
      </button>
    </div>
  )
}
