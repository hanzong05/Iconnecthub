'use client'

import { useState } from 'react'
import type { CalibrationFile, ControlPoint, Point } from '@/lib/pathfinder/types'
import type { CalibrationReport } from '@/lib/pathfinder/calibration'
import { adminBtnPrimary, adminField, adminLinkDanger } from '../admin/AdminSection'

interface Props {
  calibration: CalibrationFile
  report: CalibrationReport
  pending: Point | null
  onAdd: (lat: number, lon: number, checkpoint: boolean) => void
  onRemove: (kind: 'controlPoints' | 'checkpoints', id: string) => void
  onClearPick: () => void
  pickMode: boolean
  onTogglePick: () => void
  /** Receives the element where the Geofence panel is shown. */
  geofenceRef: (el: HTMLDivElement | null) => void
}

function errorTone(m: number) {
  if (m < 5) return 'bg-emerald-100 text-emerald-800'
  if (m < 15) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-700'
}

const STATUS_TONE: Record<string, string> = {
  verified: 'bg-emerald-100 text-emerald-800',
  unverified: 'bg-amber-100 text-amber-800',
  provisional: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-700',
  uncalibrated: 'bg-surface2 text-ink2',
}

/** Left panel of the calibration page: accuracy, the add-point steps, and the lists of control points and checkpoints. */
export default function CalibrationSidebar({ calibration, report, pending, onAdd, onRemove, onClearPick, pickMode, onTogglePick, geofenceRef }: Props) {
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [asCheckpoint, setAsCheckpoint] = useState(false)
  const [tab, setTab] = useState<'points' | 'geofence'>('points')
  const la = Number(lat)
  const lo = Number(lon)
  const valid = pending !== null && lat.trim() !== '' && lon.trim() !== '' && Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180

  function add() {
    if (!valid) return
    onAdd(la, lo, asCheckpoint)
    setLat('')
    setLon('')
  }

  const mpp = report.model?.metersPerPixel

  return (
    <aside className="flex w-full min-h-0 flex-col gap-4 md:h-full md:overflow-y-auto md:pr-1">
      <div role="tablist" className="flex gap-1 rounded-[10px] bg-surface p-1">
        {(['points', 'geofence'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex h-8 flex-1 items-center justify-center rounded-[8px] text-xs font-semibold transition-colors duration-150 ${
              tab === t ? 'bg-brand text-white' : 'text-ink2 hover:bg-line'
            }`}
          >
            {t === 'points' ? 'Reference points' : 'Geofence'}
          </button>
        ))}
      </div>
      {tab === 'geofence' ? (
        <div ref={geofenceRef} className="flex flex-col gap-4" />
      ) : (
        <>
      <section className="rounded-xl bg-surface p-4 ring-1 ring-line">
        <div className="flex items-center justify-between">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${STATUS_TONE[report.status] ?? STATUS_TONE.uncalibrated}`}>
            {report.status}
          </span>
          <span className="text-xs text-ink3">{calibration.controlPoints.length} points · {calibration.checkpoints.length} checks</span>
        </div>
        <div className="mt-4 flex items-end gap-2">
          <span className="text-3xl font-extrabold text-ink">{mpp ? mpp.toFixed(2) : '—'}</span>
          <span className="pb-1 text-sm text-ink3">m per map pixel</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink2">{report.message}</p>
        {report.error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{report.error}</p>}
      </section>

      <section className="rounded-xl bg-surface p-4 ring-1 ring-line">
        <h3 className="text-sm font-bold text-ink">Add a reference point</h3>
        <ol className="mt-4 space-y-4">
          <li className="flex gap-3">
            <Step n={1} done={pending !== null} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">Pick a spot on the satellite map</div>
              <div className="text-xs text-ink3">A corner of a building or the end of a dock works best.</div>
              <button onClick={onTogglePick} className={`mt-2 w-full rounded-lg px-3 py-2 text-xs font-semibold ${pickMode ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-surface text-white hover:bg-line'}`}>
                {pickMode ? 'Picking… tap the map (click to stop)' : 'Pick point on map'}
              </button>
              {pending && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  <span>
                    Picked ({pending.x.toFixed(0)}, {pending.y.toFixed(0)})
                  </span>
                  <button onClick={onClearPick} className="font-semibold underline">
                    Clear
                  </button>
                </div>
              )}
            </div>
          </li>
          <li className="flex gap-3">
            <Step n={2} done={valid} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="text-sm font-semibold text-ink">Enter the GPS reading</div>
              <div className="grid grid-cols-2 gap-2">
                <input className={adminField} placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" disabled={!pending} />
                <input className={adminField} placeholder="Longitude" value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" disabled={!pending} />
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <Step n={3} done={false} />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="text-sm font-semibold text-ink">Type</div>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface2 p-1 text-xs font-semibold">
                <button onClick={() => setAsCheckpoint(false)} className={`rounded-md py-1.5 ${!asCheckpoint ? 'bg-brand text-white' : 'text-ink3'}`}>
                  Control point
                </button>
                <button onClick={() => setAsCheckpoint(true)} className={`rounded-md py-1.5 ${asCheckpoint ? 'bg-brand text-white' : 'text-ink3'}`}>
                  Checkpoint
                </button>
              </div>
              <p className="text-[11px] text-ink3">Checkpoints test accuracy and are not used to fit the map.</p>
              <button disabled={!valid} onClick={add} className={`${adminBtnPrimary} w-full py-2.5`}>
                Add point
              </button>
            </div>
          </li>
        </ol>
      </section>

      <PointList title="Control points" points={calibration.controlPoints} kind="controlPoints" onRemove={onRemove} />
      <PointList title="Checkpoints" points={calibration.checkpoints} kind="checkpoints" onRemove={onRemove} report={report} />
        </>
      )}
    </aside>
  )
}

function Step({ n, done }: { n: number; done: boolean }) {
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-line text-ink2'}`}>
      {n}
    </span>
  )
}

function PointList({
  title,
  points,
  kind,
  onRemove,
  report,
}: {
  title: string
  points: ControlPoint[]
  kind: 'controlPoints' | 'checkpoints'
  onRemove: (kind: 'controlPoints' | 'checkpoints', id: string) => void
  report?: CalibrationReport
}) {
  return (
    <section className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-semibold text-ink2">{points.length}</span>
      </div>
      {points.length === 0 ? (
        <p className="mt-3 text-xs text-ink3">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {points.map((p, i) => {
            const err = report?.checkpointErrorsM.find((c) => c.id === p.id)
            return (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface2 text-[11px] font-bold text-ink2">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-ink">
                    px ({p.x.toFixed(0)}, {p.y.toFixed(0)})
                  </div>
                  <div className="truncate text-[11px] text-ink3">
                    {p.lat.toFixed(6)}, {p.lon.toFixed(6)}
                  </div>
                </div>
                {err && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${errorTone(err.m)}`}>{err.m.toFixed(1)} m</span>}
                <button onClick={() => onRemove(kind, p.id)} className={adminLinkDanger}>
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

