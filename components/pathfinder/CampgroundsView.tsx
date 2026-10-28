'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { createCampgroundAction, deleteCampgroundAction, updateCampgroundAction } from '@/app/actions/pathfinder'
import Modal from '@/components/ui/Modal'
import RemoteImg from '@/components/ui/RemoteImg'
import { Field, FormMessage, inputClass } from '@/components/ui/fields'
import type { HubMap } from '@/lib/data/pathfinder'
import type { CampgroundRecord } from '@/lib/pathfinder/model'
import { prepareMapImage, uploadPrepared, type Prepared } from './images'

const when = (iso?: string) => (iso && Date.parse(iso) ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

function CampgroundForm({ hubId, hubName, hubOptions, item, onDone }: { hubId: string; hubName: string; hubOptions: { id: string; name: string }[]; item: CampgroundRecord | null; onDone: (r: { id?: string; hubId: string; message: string }) => void }) {
  const [pickedHub, setPickedHub] = useState('')
  const [touched, setTouched] = useState(false)
  const targetHub = item ? hubId : pickedHub
  const [name, setName] = useState(item?.name ?? '')
  const [lat, setLat] = useState(item ? String(item.centerLat) : '')
  const [lon, setLon] = useState(item ? String(item.centerLon) : '')
  const [isPublic, setIsPublic] = useState(item?.public ?? true)
  const [image, setImage] = useState<{ prepared: Prepared; preview: string } | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.preview) }, [image])

  async function pick(file: File | undefined) {
    if (!file) return
    setError('')
    setNote('Preparing image…')
    try {
      const prepared = await prepareMapImage(file)
      setImage({ prepared, preview: URL.createObjectURL(prepared.blob) })
      setNote(`Ready: ${prepared.width} × ${prepared.height}, ${(prepared.blob.size / 1024).toFixed(0)} KB.`)
    } catch (e) {
      setNote('')
      setError(e instanceof Error ? e.message : 'Could not read that image.')
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const la = Number(lat)
    const lo = Number(lon)
    if (!targetHub) return setError('Choose the hub this map belongs to.')
    if (!name.trim()) return setError('Enter a name.')
    if (!lat.trim() || !lon.trim() || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return setError('Enter a valid latitude (−90 to 90) and longitude (−180 to 180).')
    if (!item && !image) return setError('Choose a map image.')
    setBusy(true)
    try {
      const uploaded = image ? await uploadPrepared(image.prepared) : undefined
      const body = { name, public: isPublic, centerLat: la, centerLon: lo, image: uploaded }
      const res = item ? await updateCampgroundAction(hubId, item.id, body) : await createCampgroundAction(targetHub, body)
      if (!res.ok) return setError(res.error)
      onDone({ id: res.id, hubId: targetHub, message: item ? 'Map updated.' : 'Map added.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <FormMessage error={error} />
      <Field label="Hub" htmlFor="cg-hub" hint={item ? 'The hub this map belongs to cannot be changed.' : 'Only hubs that do not have a map yet are listed.'}>
        {item ? (
          <input id="cg-hub" className={inputClass} value={hubName} readOnly disabled />
        ) : (
          <select
            id="cg-hub"
            className={inputClass}
            value={pickedHub}
            onChange={(e) => {
              setPickedHub(e.target.value)
              if (!touched) setName(hubOptions.find((h) => h.id === e.target.value)?.name ?? '')
            }}
          >
            <option value="">— Choose a hub —</option>
            {hubOptions.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Map name" htmlFor="cg-name">
        <input id="cg-name" className={inputClass} value={name} maxLength={100} onChange={(e) => { setTouched(true); setName(e.target.value) }} placeholder="e.g. Main campground" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" htmlFor="cg-lat">
          <input id="cg-lat" className={inputClass} value={lat} inputMode="decimal" onChange={(e) => setLat(e.target.value)} placeholder="44.1234" />
        </Field>
        <Field label="Longitude" htmlFor="cg-lon">
          <input id="cg-lon" className={inputClass} value={lon} inputMode="decimal" onChange={(e) => setLon(e.target.value)} placeholder="-73.5678" />
        </Field>
      </div>
      <Field label={item ? 'Replace map image (optional)' : 'Map image'} htmlFor="cg-image" hint="PNG, JPG or WebP. It is resized for fast loading. Keep the same proportions if you replace one that already has locations.">
        <input id="cg-image" type="file" accept="image/*" onChange={(e) => void pick(e.target.files?.[0])} className="block w-full text-sm text-ink2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3.5 file:py-2.5 file:text-sm file:font-semibold file:text-white" />
        {note && <p className="text-[11px] text-ink3">{note}</p>}
      </Field>
      {(image || item) && (
        <div className="mb-3.5 overflow-hidden rounded-xl border border-line bg-surface2">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.preview} alt="New map preview" className="max-h-44 w-full object-contain" />
          ) : (
            item && <RemoteImg src={item.mapImage} w={480} alt={`${item.name} map`} className="max-h-44 w-full object-contain" />
          )}
        </div>
      )}
      <label className="mb-4 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
        <span>
          Public
          <span className="block text-[11px] text-ink3">Private campgrounds are for admins only.</span>
        </span>
      </label>
      <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:cursor-not-allowed disabled:opacity-70">
        {busy ? 'Saving…' : item ? 'Save changes' : 'Add map'}
      </button>
    </form>
  )
}

/** Every hub's map (one per hub). Add one for a hub that has none, change it, open its map or calibration, or delete it. */
export default function CampgroundsView({ maps, hubsWithoutMap }: { maps: HubMap[]; hubsWithoutMap: { id: string; name: string }[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<HubMap | 'new' | null>(null)
  const [deleting, setDeleting] = useState<HubMap | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const none = hubsWithoutMap.length === 0
  const total = maps.length + hubsWithoutMap.length

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    setDeleteError('')
    try {
      const res = await deleteCampgroundAction(deleting.hubId, deleting.map.id)
      if (!res.ok) return setDeleteError(res.error)
      setDeleting(null)
      setToast('Map deleted.')
      router.refresh()
    } catch {
      setDeleteError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const q = (m: HubMap) => `map=${encodeURIComponent(m.map.id)}&hub=${encodeURIComponent(m.hubId)}`

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Maps</h2>
          <p className="text-[13px] text-ink3">{maps.length} of {total} hubs have a map. Each hub has one.</p>
        </div>
        <button
          type="button"
          disabled={none}
          title={none ? 'Every hub already has a map.' : undefined}
          onClick={() => {
            setToast('')
            setEditing('new')
          }}
          className="h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          + Add map
        </button>
      </div>
      {toast && (
        <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] font-medium text-emerald-700">
          {toast}
        </div>
      )}

      {maps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line2 bg-surface px-6 py-12 text-center">
          <p className="text-sm font-semibold text-ink">No maps saved yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink3">Click Add map, choose the hub it belongs to, and upload its map image. Then place locations and roads on it, and calibrate it to real GPS positions.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {maps.map((m) => (
            <li key={`${m.hubId}/${m.map.id}`} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              <Link href={`/dashboard/map-locations?${q(m)}`} className="block aspect-[16/10] bg-surface2" aria-label={`Open the map of ${m.hubName}`}>
                <RemoteImg src={m.map.mapImage} w={480} alt="" className="h-full w-full object-cover" />
              </Link>
              <div className="flex flex-1 flex-col p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink3">{m.hubName}</div>
                <div className="mt-0.5 flex items-start justify-between gap-2">
                  <h3 className="min-w-0 truncate text-[15px] font-bold text-ink">{m.map.name}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.map.public ? 'bg-emerald-600/10 text-emerald-700' : 'bg-slate-500/10 text-ink2'}`}>{m.map.public ? 'Public' : 'Private'}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink3">
                  {m.map.centerLat.toFixed(5)}, {m.map.centerLon.toFixed(5)} · Updated {when(m.map.updatedAt)}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                  <Link href={`/dashboard/map-locations?${q(m)}`} className="rounded-lg bg-brand px-3 py-2 text-white hover:bg-brand-dim">
                    Open map
                  </Link>
                  <Link href={`/dashboard/calibration?${q(m)}`} className="rounded-lg border border-line2 px-3 py-2 text-ink hover:bg-surface2">
                    Calibrate
                  </Link>
                  <button type="button" onClick={() => { setToast(''); setEditing(m) }} className="rounded-lg px-2 py-2 text-brand hover:underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => { setDeleteError(''); setDeleting(m) }} className="rounded-lg px-2 py-2 text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={editing !== null} title={editing === 'new' ? 'Add map' : 'Edit map'} subtitle={editing && editing !== 'new' ? editing.hubName : 'Choose a hub that has no map yet'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <CampgroundForm
            hubId={editing === 'new' ? '' : editing.hubId}
            hubName={editing === 'new' ? '' : editing.hubName}
            hubOptions={hubsWithoutMap}
            item={editing === 'new' ? null : editing.map}
            onDone={({ id, hubId: doneHub, message }) => {
              const wasNew = editing === 'new'
              setEditing(null)
              setToast(message)
              router.refresh()
              if (wasNew && id) router.push(`/dashboard/map-locations?map=${encodeURIComponent(id)}&hub=${encodeURIComponent(doneHub)}`)
            }}
          />
        )}
      </Modal>

      <Modal open={deleting !== null} title="Delete map?" subtitle={deleting ? `${deleting.hubName}: ${deleting.map.name}` : undefined} onClose={() => setDeleting(null)}>
        <p className="mb-4 text-sm text-ink2">This removes the map and all its locations, roads, obstacles and calibration for this hub. It cannot be undone. The hub can then be given a new map.</p>
        <FormMessage error={deleteError} />
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setDeleting(null)} className="h-11 rounded-xl border border-line2 text-sm font-semibold text-ink hover:bg-surface2">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void confirmDelete()} className="h-11 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-70">
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
