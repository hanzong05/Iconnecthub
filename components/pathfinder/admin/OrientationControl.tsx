'use client'

interface Props {
  /** Current default orientation in degrees clockwise. */
  value: number
  onChange: (degrees: number) => void
}

const norm = (d: number) => ((d % 360) + 360) % 360

/** Admin: rotate the map image. The new orientation is shown on load and changes only while navigating. */
export default function OrientationControl({ value, onChange }: Props) {
  const btn = 'rounded-lg bg-surface2 px-3 py-2 text-xs font-semibold text-ink hover:bg-line'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink2">Rotation {Math.round(value)}°</span>
      <button className={btn} onClick={() => onChange(norm(value - 90))} aria-label="Rotate left 90 degrees">
        ⟲ 90°
      </button>
      <button className={btn} onClick={() => onChange(norm(value + 90))} aria-label="Rotate right 90 degrees">
        ⟳ 90°
      </button>
      <button className={btn} disabled={value === 0} onClick={() => onChange(0)}>
        Reset
      </button>
    </div>
  )
}
