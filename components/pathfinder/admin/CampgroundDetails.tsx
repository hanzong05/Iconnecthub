'use client'

import { useState } from 'react'
import { updateCampgroundAction } from '@/app/actions/pathfinder'
import type { CampgroundRecord } from '@/lib/pathfinder/model'
import { prepareMapImage, uploadPrepared, type Prepared } from '../images'
import AdminSection, { adminBtnGhost, adminBtnPrimary, adminField } from './AdminSection'
import OrientationControl from './OrientationControl'

interface Props {
  hubId: string
  record: CampgroundRecord
  /** Default rotation of the map image in degrees (a view setting, kept in this browser). */
  orientation: number
  onOrientation: (degrees: number) => void
  /** Called with the new record after a save, so the map shows the change at once. */
  onSaved: (next: CampgroundRecord) => void
}

/** Campground settings in the admin column: name, centre coordinates, visibility and the map picture. */
export default function CampgroundDetails({ hubId, record, orientation, onOrientation, onSaved }: Props) {
  const [name, setName] = useState(record.name)
  const [lat, setLat] = useState(String(record.centerLat))
  const [lon, setLon] = useState(String(record.centerLon))
  const [isPublic, setIsPublic] = useState(record.public)
  const [busy, setBusy] = useState(false)
  const [image, setImage] = useState<{ prepared: Prepared; preview: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function useCurrentLocation() {
    if (!navigator.geolocation) return setMessage('Location is not available in this browser.')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLon(pos.coords.longitude.toFixed(6))
      },
      () => setMessage('Location is not available.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function pickImage(file: File | undefined) {
    if (!file) return
    setMessage('Preparing image…')
    try {
      const prepared = await prepareMapImage(file)
      if (image) URL.revokeObjectURL(image.preview)
      setImage({ prepared, preview: URL.createObjectURL(prepared.blob) })
      setMessage('New map image ready. Press Save changes to apply it. Locations and roads keep their positions, so keep the same proportions.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not read that image.')
    }
  }

  async function save() {
    setMessage(null)
    const la = Number(lat)
    const lo = Number(lon)
    if (!name.trim()) return setMessage('Enter a name.')
    if (!lat.trim() || !lon.trim() || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return setMessage('Enter valid coordinates.')
    setBusy(true)
    try {
      const uploaded = image ? await uploadPrepared(image.prepared) : undefined
      const res = await updateCampgroundAction(hubId, record.id, { name, public: isPublic, centerLat: la, centerLon: lo, image: uploaded })
      if (!res.ok) return setMessage(res.error)
      onSaved({
        ...record,
        name: name.trim(),
        public: isPublic,
        centerLat: la,
        centerLon: lo,
        updatedAt: res.updatedAt,
        ...(uploaded ? { mapImage: uploaded.url, mapWidth: uploaded.width, mapHeight: uploaded.height } : {}),
      })
      if (image) URL.revokeObjectURL(image.preview)
      setImage(null)
      setMessage('Saved.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminSection title="Campground details">
      <label className="block text-xs font-medium text-ink2">
        Name
        <input className={`mt-1 ${adminField}`} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-ink2">
          Latitude
          <input className={`mt-1 ${adminField}`} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
        </label>
        <label className="block text-xs font-medium text-ink2">
          Longitude
          <input className={`mt-1 ${adminField}`} value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" />
        </label>
      </div>
      <button type="button" onClick={useCurrentLocation} className={`${adminBtnGhost} w-full`}>
        Use current location
      </button>
      <div>
        <div className="mb-1.5 text-xs font-medium text-ink2">Visibility</div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface2 p-1 text-xs font-semibold">
          <button type="button" onClick={() => setIsPublic(true)} className={`rounded-md py-1.5 ${isPublic ? 'bg-brand text-white' : 'text-ink3'}`}>
            Public
          </button>
          <button type="button" onClick={() => setIsPublic(false)} className={`rounded-md py-1.5 ${!isPublic ? 'bg-brand text-white' : 'text-ink3'}`}>
            Private
          </button>
        </div>
      </div>
      <label className={`${adminBtnGhost} flex w-full cursor-pointer items-center justify-center`}>
        Change map image
        <input type="file" accept="image/*" onChange={(e) => void pickImage(e.target.files?.[0])} className="hidden" />
      </label>
      <OrientationControl value={orientation} onChange={onOrientation} />
      {image && <img src={image.preview} alt="New map preview" className="max-h-32 rounded-lg object-contain" />}
      <button type="button" onClick={() => void save()} disabled={busy} className={`${adminBtnPrimary} w-full`}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>
      {message && (
        <div role="status" className="text-xs text-ink2">
          {message}
        </div>
      )}
    </AdminSection>
  )
}
