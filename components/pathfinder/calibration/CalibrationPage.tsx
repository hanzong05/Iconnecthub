'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { saveCalibrationAction, saveLayersAction } from '@/app/actions/pathfinder'
import type { DetailLayer } from '@/lib/pathfinder/detailLayer'
import { calibrationReport, imageMismatch } from '@/lib/pathfinder/calibration'
import { useHistory } from '@/lib/pathfinder/history'
import { campgroundMapSet, type MapBundle } from '@/lib/pathfinder/model'
import type { CalibrationFile, ControlPoint, Point } from '@/lib/pathfinder/types'
import GeorefEditor from '../GeorefEditor'
import CalibrationSidebar from './CalibrationSidebar'

const EMPTY: CalibrationFile = { version: 1, notes: '', controlPoints: [], checkpoints: [] }

/** Everything this page edits: the calibration (points and geofence) and the detail image. One undo history covers both. */
interface Doc {
  calibration: CalibrationFile
  detail: DetailLayer | null
}

/**
 * Calibration and georeference on one admin page, opened with ?view=calibration&map=cg-<id>.
 * Left: reference points and accuracy. Centre: satellite map with the illustrated map laid over it.
 * Right (inside the map): width, height, opacity and location controls. Both side panels can be hidden.
 *
 * Edits stay on the page until Save. Undo and redo step back through them (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z).
 * Ctrl+S saves. The page warns before you leave with unsaved changes.
 */
export default function CalibrationPage({ hubId, bundle, backHref }: { hubId: string; bundle: MapBundle; backHref: string }) {
  const { record } = bundle
  const mapSet = useMemo(() => campgroundMapSet(record), [record])
  // Saved campground latitude and longitude, used by "Move to campground location".
  const center = useMemo(() => ({ lat: record.centerLat, lng: record.centerLon }), [record.centerLat, record.centerLon])
  const startDoc = useMemo<Doc>(() => ({ calibration: bundle.calibration ?? mapSet.calibration, detail: record.detail ?? null }), [bundle.calibration, mapSet, record.detail])
  const history = useHistory<Doc>(startDoc)
  const doc = history.present
  const { calibration, detail } = doc
  // The last saved state. Equal to the present state means nothing is unsaved.
  const [saved, setSaved] = useState<Doc>(startDoc)
  const [saving, setSaving] = useState(false)
  const dirty = doc !== saved
  const [pending, setPending] = useState<Point | null>(null)
  const [pickMode, setPickMode] = useState(false)
  const [showLeft, setShowLeft] = useState(true)
  const [showRight, setShowRight] = useState(true)
  const [panelNode, setPanelNode] = useState<HTMLElement | null>(null)
  const [status, setStatus] = useState(bundle.calibration ? 'Loaded the saved calibration.' : 'Not calibrated yet.')

  const report = useMemo(() => calibrationReport(calibration), [calibration])
  const mismatch = mapSet ? imageMismatch(calibration, mapSet.width, mapSet.height) : null

  // One path for every calibration change, from either panel or the map. Stored in the undo history.
  function edit(fn: (prev: CalibrationFile) => CalibrationFile) {
    history.set((d) => {
      const next = fn(d.calibration)
      return { ...d, calibration: mapSet ? { ...next, image: { width: mapSet.width, height: mapSet.height } } : next }
    }, 'calibration')
  }

  function setDetail(next: DetailLayer | null) {
    history.set((d) => ({ ...d, detail: next }), 'detail')
  }

  // Saves the calibration and the detail image together.
  async function save() {
    const current = docRef.current
    if (saving) return
    setSaving(true)
    try {
      const a = await saveCalibrationAction(hubId, record.id, current.calibration)
      if (!a.ok) return setStatus(`Save failed: ${a.error}`)
      const b = await saveLayersAction(hubId, record.id, { detail: current.detail, extended: record.extended ?? null })
      if (!b.ok) return setStatus(`Save failed: ${b.error}`)
      setSaved(current)
      setStatus(`Saved ${new Date().toLocaleTimeString()}`)
    } catch (e) {
      setStatus(`Save failed: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  // Refs so the keyboard and page handlers always see the latest values.
  const docRef = useRef(doc)
  docRef.current = doc
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        void saveRef.current()
        return
      }
      // While typing in a field, Ctrl+Z and Ctrl+Y keep their normal text behaviour.
      if (typing) return
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        history.undo()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        history.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history.undo, history.redo])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function addPoint(lat: number, lon: number, checkpoint: boolean) {
    if (!pending) return
    const list = checkpoint ? calibration.checkpoints : calibration.controlPoints
    const prefix = checkpoint ? 'cp' : 'ctl'
    const point: ControlPoint = { id: `${prefix}-${list.length + 1}`, x: pending.x, y: pending.y, lat, lon }
    edit((c) => (checkpoint ? { ...c, checkpoints: [...c.checkpoints, point] } : { ...c, controlPoints: [...c.controlPoints, point] }))
    setPending(null)
    setPickMode(false)
  }

  function removePoint(kind: 'controlPoints' | 'checkpoints', id: string) {
    edit((c) => ({ ...c, [kind]: c[kind].filter((p) => p.id !== id) }))
  }

  const shownStatus = dirty ? 'Unsaved changes' : status
  const button = 'rounded-lg bg-surface2 px-3 py-2 text-xs font-semibold text-ink2 hover:bg-line disabled:opacity-40'

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface2">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-surface px-3 py-2 shadow-sm sm:gap-3 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={backHref} className={button}>
            ← View on map
          </Link>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-600">Map calibration</div>
            <div className="truncate text-base font-bold text-ink">{mapSet.title}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${dirty ? 'font-semibold text-amber-600' : 'text-ink3'}`}>{shownStatus}</span>
          <button onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)" className={button}>
            Undo
          </button>
          <button onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Y)" className={button}>
            Redo
          </button>
          <button onClick={() => setShowLeft((v) => !v)} className={button}>
            {showLeft ? 'Hide calibration' : 'Show calibration'}
          </button>
          <button
            onClick={() => void save()}
            disabled={!dirty || saving}
            title="Save (Ctrl+S)"
            className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dim disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {mismatch && <div className="bg-red-50 px-5 py-2 text-xs font-semibold text-red-600">{mismatch}</div>}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:flex-row md:overflow-hidden">
        {showLeft && <div className="order-last flex w-full shrink-0 md:min-h-0 md:w-[300px] md:overflow-hidden">
          <CalibrationSidebar
            calibration={calibration}
            report={report}
            pending={pending}
            onAdd={addPoint}
            onRemove={removePoint}
            onClearPick={() => setPending(null)}
            pickMode={pickMode}
            onTogglePick={() => setPickMode((v) => !v)}
            geofenceRef={setPanelNode}
          />
        </div>}

        <div className="relative h-[55dvh] min-h-[280px] min-w-0 shrink-0 overflow-hidden rounded-xl bg-surface shadow-inner md:h-auto md:min-h-[420px] md:flex-1 md:shrink">
          <GeorefEditor
            key={mapSet.id}
            set={mapSet}
            calibration={calibration}
            onChange={edit}
            pickMode={pickMode}
            pending={pending}
            onPick={(p) => {
              setPending(p)
              setPickMode(false)
            }}
            panelOpen={showRight}
            inlinePanel
            panelTarget={panelNode}
            center={center}
            onTogglePanel={() => setShowRight((v) => !v)}
            detail={detail}
            onDetail={setDetail}
            onSaveDetail={() => void save()}
            detailStatus={dirty ? 'Unsaved changes' : null}
          />
          <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] flex flex-wrap gap-3 rounded-xl bg-surface/90 px-3 py-2 text-[11px] font-semibold text-ink2 shadow">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-600" /> Control point
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-blue-600" /> Checkpoint
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-red-600" /> Picked
            </span>
            {pickMode && <span className="text-red-700">Tap the map to pick a point</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
