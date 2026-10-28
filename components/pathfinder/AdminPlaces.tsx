'use client'

import { useState } from 'react'
import type { Category, Destination, Point } from '@/lib/pathfinder/types'
import AdminSection, { adminBtnGhost, adminBtnPrimary, adminField, adminLinkAction, adminLinkDanger } from './admin/AdminSection'

interface Props {
  destinations: Destination[]
  pending: Point | null
  onStartPick: () => void
  onAdd: (d: { name: string; category: Category; description: string }) => void
  onCancelAdd: () => void
  onRemove: (id: string) => void
  /** Starts moving a saved location: the next tap on the map becomes its new spot. */
  onStartMove: (id: string) => void
  moving: string | null
  onCancelMove: () => void
  /** Group filter shared with the map. */
  group: 'all' | Category
  onGroupChange: (g: 'all' | Category) => void
}

const GROUP_FILTERS: Array<{ id: 'all' | Category; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'campsite', label: 'Campsite' },
  { id: 'building', label: 'Building' },
  { id: 'amenity', label: 'Amenity' },
]

/** Admin: add a location by tapping the map, move it, or remove it. Changes are saved to the project. */
export default function AdminPlaces({ destinations, pending, onStartPick, onAdd, onCancelAdd, onRemove, onStartMove, moving, onCancelMove, group, onGroupChange }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('amenity')
  const [description, setDescription] = useState('')
  const countOf = (id: 'all' | Category) => (id === 'all' ? destinations.length : destinations.filter((d) => d.category === id).length)
  const shown = group === 'all' ? destinations : destinations.filter((d) => d.category === group)

  return (
    <AdminSection title="Locations" count={destinations.length} description="Tap the map to place a location. Move or remove existing ones below.">
      {pending ? (
        <div className="space-y-2 rounded-lg bg-brand/10 p-3">
          <div className="text-xs font-semibold text-brand">
            New location at ({Math.round(pending.x)}, {Math.round(pending.y)})
          </div>
          <input className={adminField} placeholder="Name, e.g. Garden Gate" value={name} onChange={(e) => setName(e.target.value)} />
          <select className={adminField} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            <option value="amenity">Amenity</option>
            <option value="campsite">Campsite</option>
            <option value="building">Building</option>
          </select>
          <input className={adminField} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex gap-2 pt-1">
            <button
              disabled={!name.trim()}
              onClick={() => {
                onAdd({ name: name.trim(), category, description: description.trim() })
                setName('')
                setDescription('')
              }}
              className={adminBtnPrimary}
            >
              Save location
            </button>
            <button onClick={onCancelAdd} className={adminBtnGhost}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={onStartPick} className={`${adminBtnPrimary} w-full`}>
          + Add location by tapping map
        </button>
      )}

      {moving && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-600">
          Tap the new spot on the map
          <button onClick={onCancelMove} className="text-ink2 underline">
            Cancel
          </button>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {GROUP_FILTERS.map((g) => (
          <button
            key={g.id}
            onClick={() => onGroupChange(g.id)}
            aria-pressed={group === g.id}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${group === g.id ? 'bg-brand text-white' : 'bg-surface2 text-ink2 hover:bg-line'}`}
          >
            {g.label} <span className="opacity-70">{countOf(g.id)}</span>
          </button>
        ))}
      </div>
      {destinations.length === 0 ? (
        <p className="text-xs text-ink3">No locations yet.</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-ink3">No locations in this group.</p>
      ) : (
        <ul className="max-h-56 divide-y divide-line overflow-y-auto">
          {shown.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{d.name}</div>
                <div className="text-[11px] text-ink3">
                  {d.kind ? `${d.kind} · ` : ''}({Math.round(d.x)}, {Math.round(d.y)})
                </div>
              </div>
              {moving !== d.id && (
                <button onClick={() => onStartMove(d.id)} className={adminLinkAction}>
                  Move
                </button>
              )}
              <button
                onClick={() => {
                  if (window.confirm(`Remove ${d.name}?`)) onRemove(d.id)
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
