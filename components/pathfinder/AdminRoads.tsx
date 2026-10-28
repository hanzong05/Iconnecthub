'use client'

import { useState } from 'react'
import type { Point, RoadNetwork } from '@/lib/pathfinder/types'
import AdminSection, { adminBtnAmber, adminBtnGhost, adminLinkDanger } from './admin/AdminSection'

interface Props {
  roads: RoadNetwork
  drawing: Point[]
  active: boolean
  onStart: () => void
  onFinish: (name: string) => void
  onCancel: () => void
  onRemove: (roadName: string) => void
  undoCount: number
  onUndoRoad: () => void
  onUndoPoint: () => void
}

/** Admin: draw road centrelines that campground walking and driving routes follow. Saved automatically. */
export default function AdminRoads({ roads, drawing, active, onStart, onFinish, onCancel, onRemove, undoCount, onUndoRoad, onUndoPoint }: Props) {
  // A road split at junctions has several edges with the same name; list each road once.
  const names = [...new Set(roads.edges.map((e) => e.name))]
  // Name typed inline: browser prompt() boxes can be blocked (e.g. inside an embedded frame), which made Finish do nothing.
  const [roadName, setRoadName] = useState('')
  const defaultName = `Road ${names.length + 1}`
  return (
    <AdminSection
      title="Roads"
      count={names.length}
      description="Tap along the centre of a road, following its bends, then Finish. Ends join nearby roads automatically."
    >
      {active ? (
        <div className="space-y-2">
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-600">Drawing · {drawing.length} points</div>
          <input
            value={roadName}
            onChange={(e) => setRoadName(e.target.value)}
            placeholder={defaultName}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink"
          />
          <div className="flex flex-wrap gap-2">
            <button
              disabled={drawing.length < 2}
              onClick={() => {
                onFinish(roadName.trim() || defaultName)
                setRoadName('')
              }}
              className={adminBtnAmber}
            >
              Finish road
            </button>
            <button disabled={drawing.length === 0} onClick={onUndoPoint} className={adminBtnGhost}>
              Undo point
            </button>
            <button onClick={onCancel} className={adminBtnGhost}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={onStart} className={adminBtnAmber}>
            + Draw road
          </button>
          <button disabled={undoCount === 0} onClick={onUndoRoad} className={adminBtnGhost}>
            Undo last change
          </button>
        </div>
      )}

      {names.length === 0 ? (
        <p className="text-xs text-ink3">No roads yet.</p>
      ) : (
        <ul className="max-h-40 divide-y divide-line overflow-y-auto">
          {names.map((name) => (
            <li key={name} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {name}
              </span>
              <button
                onClick={() => {
                  if (window.confirm(`Remove "${name}" from the road network?`)) onRemove(name)
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
