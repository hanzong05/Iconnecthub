'use client'

import type { Point } from '@/lib/pathfinder/types'
import AdminSection, { adminBtnGhost, adminBtnRed, adminLinkDanger } from './admin/AdminSection'

interface Props {
  obstacles: Point[][]
  drawing: Point[]
  active: boolean
  onStart: () => void
  onFinish: () => void
  onCancel: () => void
  onRemove: (index: number) => void
}

/** Admin: draw buildings, lake and fences that walking routes must avoid. Saved automatically. */
export default function AdminObstacles({ obstacles, drawing, active, onStart, onFinish, onCancel, onRemove }: Props) {
  return (
    <AdminSection
      title="Obstacles"
      count={obstacles.length}
      description="Tap around a building, the lake or a fence. Each tap adds a corner. Finish needs at least 3 corners."
    >
      {active ? (
        <div className="space-y-2">
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">Drawing · {drawing.length} corners</div>
          <div className="flex flex-wrap gap-2">
            <button disabled={drawing.length < 3} onClick={onFinish} className={adminBtnRed}>
              Finish obstacle
            </button>
            <button onClick={onCancel} className={adminBtnGhost}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={onStart} className={`${adminBtnRed} w-full`}>
          + Draw obstacle
        </button>
      )}

      {obstacles.length === 0 ? (
        <p className="text-xs text-ink3">No obstacles yet.</p>
      ) : (
        <ul className="max-h-40 divide-y divide-line overflow-y-auto">
          {obstacles.map((poly, i) => (
            <li key={i} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                Obstacle {i + 1} <span className="text-ink3">· {poly.length} corners</span>
              </span>
              <button
                onClick={() => {
                  if (window.confirm(`Remove obstacle ${i + 1}?`)) onRemove(i)
                }}
                className={adminLinkDanger}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  )
}
