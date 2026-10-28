'use client'

import { useEffect, useState } from 'react'
import type { Category, Destination } from '@/lib/pathfinder/types'
import { adminBtnGhost, adminBtnPrimary, adminField } from './AdminSection'

const GROUPS: Array<{ id: Category; label: string }> = [
  { id: 'campsite', label: 'Campsite' },
  { id: 'building', label: 'Building' },
  { id: 'amenity', label: 'Amenity' },
]

/** Admin editor for a pin: name, description and group. Saved with the map's other locations. */
export default function PlaceEditor({
  site,
  onSave,
  onClose,
}: {
  site: Destination
  onSave: (patch: { name: string; description?: string; category: Category }) => void
  onClose: () => void
}) {
  const [name, setName] = useState(site.name)
  const [description, setDescription] = useState(site.description ?? '')
  const [category, setCategory] = useState<Category>(site.category)

  useEffect(() => {
    setName(site.name)
    setDescription(site.description ?? '')
    setCategory(site.category)
  }, [site.id, site.name, site.description, site.category])

  const valid = name.trim().length > 0 && name.trim().length <= 100

  return (
    <div className="space-y-3 rounded-[14px] border border-line bg-surface p-3 text-ink shadow-lg">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Edit location</div>
        <button onClick={onClose} aria-label="Close editor" className="px-1 text-lg leading-none text-ink2 hover:text-ink">
          ×
        </button>
      </div>
      <label className="block text-xs text-ink2">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={`${adminField} mt-1 w-full`} />
      </label>
      <label className="block text-xs text-ink2">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={300}
          className="mt-1 w-full rounded-[9px] border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
      </label>
      <div className="text-xs text-ink2">
        Group
        <div className="mt-1 grid grid-cols-3 gap-1 rounded-[10px] bg-surface p-1">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              onClick={() => setCategory(g.id)}
              className={`h-8 rounded-[8px] text-xs font-semibold ${category === g.id ? 'bg-brand text-white' : 'text-ink2 hover:bg-line'}`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onClose} className={adminBtnGhost}>
          Cancel
        </button>
        <button
          disabled={!valid}
          onClick={() => onSave({ name: name.trim(), description: description.trim() || undefined, category })}
          className={`${adminBtnPrimary} disabled:opacity-50`}
        >
          Save
        </button>
      </div>
    </div>
  )
}
