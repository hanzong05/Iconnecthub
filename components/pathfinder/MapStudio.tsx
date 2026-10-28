'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { saveCalibrationAction, saveNetworkAction } from '@/app/actions/pathfinder'
import { calibrationReport, imageMismatch, unproject } from '@/lib/pathfinder/calibration'
import { campgroundMapSet, type CampgroundRecord, type MapBundle, type Network, type Pin } from '@/lib/pathfinder/model'
import { ROAD_TAP_PX, addRoad, nearestRoadName, removeRoad, removeRoadPoint, removeStretch } from '@/lib/pathfinder/roadEditing'
import { planRoute, roadGeometry, type PlanResult } from '@/lib/pathfinder/routing'
import { simplifyPolyline, smoothPolyline } from '@/lib/pathfinder/smoothPath'
import type { CalibrationFile, Category, Destination, Point, RoadNetwork } from '@/lib/pathfinder/types'
import AdminObstacles from './AdminObstacles'
import AdminPlaces from './AdminPlaces'
import AdminRoads from './AdminRoads'
import AdminPanel from './admin/AdminPanel'
import CampgroundDetails from './admin/CampgroundDetails'
import PlaceEditor from './admin/PlaceEditor'
import RoadEditPanel from './admin/RoadEditPanel'
import MapControls from './MapControls'
import MapViewer, { type MapViewerHandle } from './MapViewer'
import { DestinationMarkers, RouteOverlay } from './Overlays'

const STATUS_LABEL: Record<string, string> = {
  uncalibrated: 'Not calibrated',
  provisional: 'Provisional',
  unverified: 'Unverified',
  failed: 'Calibration failed',
  verified: 'Verified',
}

type Picking = 'start' | 'place' | 'move' | 'obstacle' | 'road' | null

interface NetState {
  pins: Pin[]
  walkways: Network['walkways']
  obstacles: Point[][]
  roads: RoadNetwork
}

const fmt = (px: number, mpp: number | null) => (mpp === null ? `${Math.round(px)} map px` : px * mpp >= 1000 ? `${((px * mpp) / 1000).toFixed(2)} km` : `${Math.round(px * mpp)} m`)

/**
 * Map & Locations: the campground map with its locations, roads and obstacles. Everything is saved to this hub's
 * own data as it changes (one save at a time, in order, so the stored copy always ends up equal to the screen).
 */
export default function MapStudio({ hubId, bundle, calibrationHref }: { hubId: string; bundle: MapBundle; calibrationHref: string }) {
  const [record, setRecord] = useState<CampgroundRecord>(bundle.record)
  const mapSet = useMemo(() => campgroundMapSet(record), [record])
  const [calibration, setCalibration] = useState<CalibrationFile>(bundle.calibration ?? mapSet.calibration)
  const [net, setNet] = useState<NetState>({
    pins: bundle.network.pins,
    walkways: bundle.network.walkways,
    obstacles: bundle.network.obstacles,
    roads: bundle.network.roads ?? { nodes: [], edges: [] },
  })
  const [group, setGroup] = useState<'all' | Category>('all')
  const [selected, setSelected] = useState<Destination | null>(null)
  const [picking, setPicking] = useState<Picking>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [pendingPlace, setPendingPlace] = useState<Point | null>(null)
  const [manualStart, setManualStart] = useState<Point | null>(null)
  const [roadDrawing, setRoadDrawing] = useState<Point[]>([])
  const [drawing, setDrawing] = useState<Point[]>([])
  const [roadUndo, setRoadUndo] = useState<RoadNetwork[]>([])
  const [selectedRoad, setSelectedRoad] = useState<string | null>(null)
  const [selectedPoints, setSelectedPoints] = useState<Point[]>([])
  const [status, setStatus] = useState<{ tone: 'ok' | 'busy' | 'error'; text: string } | null>(null)
  const viewer = useRef<MapViewerHandle>(null)
  const headingRef = useRef<number | null>(null)
  const arrowRef = useRef<SVGGElement>(null)

  const { pins: destinations, obstacles, roads } = net
  const report = useMemo(() => {
    const r = calibrationReport(calibration)
    const warn = imageMismatch(calibration, mapSet.width, mapSet.height)
    return warn ? { ...r, status: 'unverified' as const, message: `${warn} ${r.message}` } : r
  }, [calibration, mapSet.width, mapSet.height])
  const metersPerPixel = report.model ? report.model.metersPerPixel : null

  // ---- saving: strictly one at a time, each carrying the latest full state -------------------------------------
  const latest = useRef(net)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const pendingSaves = useRef(0)
  function persist(next: NetState) {
    latest.current = next
    setNet(next)
    pendingSaves.current += 1
    setStatus({ tone: 'busy', text: 'Saving…' })
    chain.current = chain.current.then(async () => {
      try {
        const res = await saveNetworkAction(hubId, record.id, { pins: latest.current.pins, walkways: latest.current.walkways, obstacles: latest.current.obstacles, roads: latest.current.roads })
        pendingSaves.current -= 1
        if (pendingSaves.current === 0 || !res.ok) setStatus(res.ok ? { tone: 'ok', text: `Saved ${new Date().toLocaleTimeString()}` } : { tone: 'error', text: `Not saved: ${res.error}` })
      } catch {
        pendingSaves.current -= 1
        setStatus({ tone: 'error', text: 'Not saved: could not reach the server.' })
      }
    })
  }

  // Warn before leaving while a save is still going.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pendingSaves.current > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  async function saveOrientation(degrees: number) {
    const next = { ...calibration, orientation: degrees }
    setCalibration(next)
    const res = await saveCalibrationAction(hubId, record.id, next)
    setStatus(res.ok ? { tone: 'ok', text: 'Saved the default rotation.' } : { tone: 'error', text: `Not saved: ${res.error}` })
  }

  // ---- derived overlays ----------------------------------------------------------------------------------------
  const matching = useMemo(() => destinations.filter((d) => group === 'all' || d.category === group), [destinations, group])
  const labelSites = selected && !matching.some((d) => d.id === selected.id) ? [...matching, selected] : matching
  const roadPaths = useMemo(() => {
    const byId = new Map<string, Point>(roads.nodes.map((n) => [n.id, n]))
    return roads.edges.flatMap((e) => {
      const g = roadGeometry(e, byId)
      return g ? [{ id: e.id, name: e.name, pts: smoothPolyline(simplifyPolyline(g)).map((p) => `${p.x},${p.y}`).join(' ') }] : []
    })
  }, [roads])
  const roadVertices = useMemo(() => {
    if (!selectedRoad) return []
    const byId = new Map<string, Point>(roads.nodes.map((n) => [n.id, n]))
    return roads.edges.filter((e) => e.name === selectedRoad).flatMap((e) => roadGeometry(e, byId) ?? [])
  }, [roads, selectedRoad])

  // Route preview from a start point set on the map to the chosen location, over the drawn roads.
  const preview = useMemo<PlanResult | null>(() => {
    if (!selected || !manualStart || roads.edges.length === 0) return null
    return planRoute(manualStart, selected, roads, 'drive', obstacles, Infinity)
  }, [selected, manualStart, roads, obstacles])
  const previewRoute = preview && 'route' in preview ? preview.route : null
  const previewError = preview && 'error' in preview ? preview.error : null

  // ---- editing -------------------------------------------------------------------------------------------------
  const withNet = (patch: Partial<NetState>) => persist({ ...latest.current, ...patch })

  function addPlace(d: { name: string; category: Category; description: string }) {
    if (!pendingPlace) return
    const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'place'
    const gps = report.model ? unproject(report.model, pendingPlace) : null
    const item: Pin = {
      id: `${slug}-${Date.now().toString(36)}`,
      name: d.name,
      category: d.category,
      description: d.description || undefined,
      x: pendingPlace.x,
      y: pendingPlace.y,
      ...(gps ? { lat: gps.lat, lng: gps.lng } : {}),
      placement: 'estimated',
    }
    withNet({ pins: [...latest.current.pins, item] })
    setPendingPlace(null)
  }

  function movePlace(p: Point) {
    if (!movingId) return
    const gps = report.model ? unproject(report.model, p) : null
    withNet({ pins: latest.current.pins.map((d) => (d.id === movingId ? { ...d, x: p.x, y: p.y, ...(gps ? { lat: gps.lat, lng: gps.lng } : {}) } : d)) })
    setMovingId(null)
    setPicking(null)
  }

  function updatePlace(patch: { name: string; description?: string; category: Category }) {
    if (!selected) return
    withNet({ pins: latest.current.pins.map((d) => (d.id === selected.id ? { ...d, ...patch, description: patch.description } : d)) })
    setSelected({ ...selected, ...patch, description: patch.description })
  }

  function removePlace(id: string) {
    withNet({ pins: latest.current.pins.filter((d) => d.id !== id) })
    if (selected?.id === id) setSelected(null)
  }

  function changeRoads(next: RoadNetwork) {
    setRoadUndo((u) => [...u, latest.current.roads])
    withNet({ roads: next })
  }

  function undoRoad() {
    const prev = roadUndo[roadUndo.length - 1]
    if (!prev) return
    setRoadUndo((u) => u.slice(0, -1))
    withNet({ roads: prev })
  }

  function finishRoad(name: string) {
    const next = addRoad(
      roads,
      roadDrawing,
      name,
      (edge, at) =>
        window.confirm(
          `Your new road crosses "${edge.name}" near (${Math.round(at.x)}, ${Math.round(at.y)}).\n\nOK = they meet here (you can turn between them).\nCancel = one passes over the other (no junction).`,
        ),
      Date.now(),
    )
    changeRoads(next)
    setRoadDrawing([])
    setPicking(null)
  }

  function deleteSelectedPoints() {
    if (!selectedRoad || selectedPoints.length === 0) return
    if (selectedPoints.length === 2) {
      const next = removeStretch(roads, selectedRoad, selectedPoints[0], selectedPoints[1])
      if (!next) return void window.alert('Those two points are not on the same stretch of this road.')
      changeRoads(next)
      setSelectedPoints([])
      if (!next.edges.some((e) => e.name === selectedRoad)) setSelectedRoad(null)
      return
    }
    let working = roads
    let blocked = 0
    for (const p of selectedPoints) {
      const next = removeRoadPoint(working, selectedRoad, p)
      if (!next) blocked++
      else working = next
    }
    if (working !== roads) changeRoads(working)
    setSelectedPoints([])
    if (!working.edges.some((e) => e.name === selectedRoad)) setSelectedRoad(null)
    if (blocked > 0) window.alert(`${blocked} point${blocked === 1 ? '' : 's'} join another road, so ${blocked === 1 ? 'it was' : 'they were'} not removed.`)
  }

  function deleteSelectedRoad() {
    if (!selectedRoad) return
    if (!window.confirm(`Remove "${selectedRoad}" from the road network?`)) return
    changeRoads(removeRoad(roads, selectedRoad))
    setSelectedRoad(null)
    setSelectedPoints([])
  }

  function onTap(p: Point) {
    if (picking === 'road') return void setRoadDrawing((d) => [...d, p])
    if (picking === 'obstacle') return void setDrawing((d) => [...d, p])
    if (picking === 'start') {
      setManualStart(p)
      return void setPicking(null)
    }
    if (picking === 'place') {
      setPendingPlace(p)
      return void setPicking(null)
    }
    if (picking === 'move') return movePlace(p)

    // Nothing is being drawn: a white point selects it; a road under the tap opens its panel; a pin opens its editor.
    if (selectedRoad) {
      let near: Point | null = null
      let nearD = ROAD_TAP_PX
      for (const q of roadVertices) {
        const d = Math.hypot(p.x - q.x, p.y - q.y)
        if (d <= nearD) {
          nearD = d
          near = q
        }
      }
      if (near) {
        const hit = near
        return void setSelectedPoints((prev) =>
          prev.some((q) => Math.hypot(q.x - hit.x, q.y - hit.y) < 0.5) ? prev.filter((q) => Math.hypot(q.x - hit.x, q.y - hit.y) >= 0.5) : [...prev, hit],
        )
      }
    }
    const pinNear = matching.some((d) => Math.hypot(p.x - d.x, p.y - d.y) <= ROAD_TAP_PX)
    const roadHit = pinNear ? null : nearestRoadName(roads, p, ROAD_TAP_PX)
    if (roadHit) {
      setSelectedRoad(roadHit)
      setSelectedPoints([])
      return
    }
    setSelectedRoad(null)
    setSelectedPoints([])
    let best: Destination | null = null
    let bestD = 60
    for (const d of matching) {
      const dd = Math.hypot(p.x - d.x, p.y - d.y)
      if (dd < bestD) {
        bestD = dd
        best = d
      }
    }
    if (best) setSelected(best)
  }

  const bannerText =
    picking === 'start'
      ? 'Tap the map where the route should start'
      : picking === 'place'
        ? 'Tap the spot for the new location'
        : picking === 'move'
          ? 'Tap the new spot for this location'
          : picking === 'road'
            ? 'Tap points along the road centre, then press Finish road'
            : picking === 'obstacle'
              ? 'Tap each corner of the obstacle, then press Finish'
              : ''

  const places = (
    <AdminPlaces
      destinations={destinations}
      group={group}
      onGroupChange={setGroup}
      pending={pendingPlace}
      onStartPick={() => setPicking('place')}
      onAdd={addPlace}
      onCancelAdd={() => setPendingPlace(null)}
      onRemove={removePlace}
      onStartMove={(id) => {
        setMovingId(id)
        setPicking('move')
      }}
      moving={movingId}
      onCancelMove={() => {
        setMovingId(null)
        setPicking(null)
      }}
    />
  )

  const roadsBlock = (
    <AdminRoads
      roads={roads}
      drawing={roadDrawing}
      active={picking === 'road'}
      undoCount={roadUndo.length}
      onUndoRoad={undoRoad}
      onUndoPoint={() => setRoadDrawing((d) => d.slice(0, -1))}
      onStart={() => {
        setRoadDrawing([])
        setPicking('road')
      }}
      onFinish={finishRoad}
      onCancel={() => {
        setRoadDrawing([])
        setPicking(null)
      }}
      onRemove={(name) => changeRoads(removeRoad(roads, name))}
    />
  )

  const obstaclesBlock = (
    <AdminObstacles
      obstacles={obstacles}
      drawing={drawing}
      active={picking === 'obstacle'}
      onStart={() => {
        setDrawing([])
        setPicking('obstacle')
      }}
      onFinish={() => {
        if (drawing.length >= 3) withNet({ obstacles: [...obstacles, drawing] })
        setDrawing([])
        setPicking(null)
      }}
      onCancel={() => {
        setDrawing([])
        setPicking(null)
      }}
      onRemove={(i) => withNet({ obstacles: obstacles.filter((_, k) => k !== i) })}
    />
  )

  const statusTab = (
    <div className="space-y-3 rounded-[12px] bg-surface p-4">
      <div className="text-base font-semibold text-ink">{record.name}</div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${report.status === 'verified' ? 'bg-emerald-50 text-emerald-600' : 'bg-surface2 text-ink2'}`}>Map: {STATUS_LABEL[report.status]}</span>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-600">{roads.edges.length === 0 ? 'No roads drawn yet' : `${roadPaths.length} road section${roadPaths.length === 1 ? '' : 's'}`}</span>
        <span className="rounded-full bg-surface2 px-2 py-0.5 font-semibold text-ink2">{record.public ? 'Public' : 'Private'}</span>
      </div>
      <p className="text-xs leading-relaxed text-ink3">{report.message}</p>
      <Link href={calibrationHref} className="flex h-[38px] w-full items-center justify-center rounded-[9px] bg-brand text-[13px] font-semibold text-white hover:bg-brand-dim">
        Open calibration
      </Link>
      <div className="space-y-1.5 border-t border-line pt-3 text-xs text-ink2">
        <div className="font-semibold text-ink">Try a route</div>
        <div>{manualStart ? 'Start point is set. Pick a location on the map to see its route.' : 'Set a start point, then pick a location on the map.'}</div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setPicking('start')} className="font-semibold text-brand">
            {manualStart ? 'Move start' : 'Set start on map'}
          </button>
          {manualStart && (
            <button type="button" onClick={() => setManualStart(null)} className="text-ink3">
              Clear
            </button>
          )}
        </div>
        {previewRoute && <div className="text-emerald-600">Route length: {fmt(previewRoute.lengthPx ?? 0, metersPerPixel)}</div>}
        {previewError && <div className="text-red-600">{previewError}</div>}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-bg p-3 md:h-[calc(100dvh-8.5rem)] md:min-h-[560px] md:flex-row">
      <div className="relative h-[62dvh] min-h-[320px] min-w-0 shrink-0 overflow-hidden rounded-[14px] border border-line bg-bg md:h-auto md:flex-1 md:shrink">
        <MapViewer
          ref={viewer}
          imageUrl={mapSet.imageUrl}
          imageWidth={mapSet.width}
          imageHeight={mapSet.height}
          headingRef={headingRef}
          rotatingMode={false}
          orientation={calibration.orientation ?? 0}
          arrowRef={arrowRef}
          anchor={{ x: 0.5, y: 0.5 }}
          followPoint={null}
          extended={mapSet.detail ? { imageUrl: mapSet.detail.imageUrl, width: mapSet.detail.width, height: mapSet.detail.height, corners: mapSet.detail.corners } : undefined}
          onUserInteract={() => undefined}
          onTap={onTap}
        >
          {(scale) => (
            <>
              {previewRoute && <RouteOverlay points={previewRoute.points} from={null} scale={scale} />}
              <DestinationMarkers destinations={labelSites} selectedId={selected?.id ?? null} scale={scale} />
              {manualStart && (
                <g transform={`translate(${manualStart.x} ${manualStart.y})`}>
                  <circle r={9 / scale} fill="#1a56db" stroke="#ffffff" strokeWidth={2 / scale} />
                </g>
              )}
              {pendingPlace && (
                <g transform={`translate(${pendingPlace.x} ${pendingPlace.y})`}>
                  <circle r={10 / scale} fill="#1a56db" stroke="#ffffff" strokeWidth={2 / scale} />
                </g>
              )}
              {roadPaths.map((r) => (
                <polyline key={r.id} points={r.pts} fill="none" stroke={r.name === selectedRoad ? '#2563eb' : '#f59e0b'} strokeWidth={4 / scale} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
              ))}
              {selectedRoad &&
                roadVertices.map((v, i) => {
                  const chosen = selectedPoints.some((q) => Math.hypot(v.x - q.x, v.y - q.y) < 0.5)
                  return <circle key={i} cx={v.x} cy={v.y} r={(chosen ? 8 : 6) / scale} fill={chosen ? '#f97316' : '#ffffff'} stroke="#1e3a8a" strokeWidth={2 / scale} />
                })}
              {obstacles.map((poly, i) => (
                <polygon key={`obs-${i}`} points={poly.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(220,38,38,0.25)" stroke="#dc2626" strokeWidth={2 / scale} />
              ))}
              {roadDrawing.length > 0 && <polyline points={roadDrawing.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={3 / scale} strokeDasharray={`${6 / scale} ${4 / scale}`} />}
              {drawing.length > 0 && <polyline points={drawing.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#dc2626" strokeWidth={2 / scale} strokeDasharray={`${6 / scale} ${4 / scale}`} />}
            </>
          )}
        </MapViewer>

        <MapControls onZoomIn={() => viewer.current?.zoomBy(1.4)} onZoomOut={() => viewer.current?.zoomBy(1 / 1.4)} onFit={() => viewer.current?.fitAll()} />

        {selectedRoad && !picking && (
          <RoadEditPanel
            name={selectedRoad}
            pointCount={selectedPoints.length}
            onDeletePoints={deleteSelectedPoints}
            onDeleteRoad={deleteSelectedRoad}
            onClose={() => {
              setSelectedRoad(null)
              setSelectedPoints([])
            }}
          />
        )}
        {picking && (
          <div className="absolute inset-x-3 top-3 z-20 rounded-xl bg-brand p-3 text-center text-sm font-semibold text-white shadow-lg">
            {bannerText}
            <button type="button" className="ml-3 underline" onClick={() => setPicking(null)}>
              Cancel
            </button>
          </div>
        )}
        {selected && !picking && (
          <div className="absolute inset-x-3 bottom-3 z-20 md:inset-x-auto md:left-3 md:w-[340px]">
            <PlaceEditor key={selected.id} site={selected} onSave={updatePlace} onClose={() => setSelected(null)} />
          </div>
        )}
        {status && (
          <div
            role="status"
            className={`pointer-events-none absolute bottom-3 right-3 z-10 rounded-full px-3 py-1 text-[11px] font-semibold ${
              status.tone === 'error' ? 'bg-red-50 text-red-600' : status.tone === 'busy' ? 'bg-surface2 text-ink2' : 'bg-emerald-50 text-emerald-600'
            } ${selected ? 'md:right-3' : ''}`}
          >
            {status.text}
          </div>
        )}
      </div>

      <AdminPanel
        title="Map editor"
        subtitle={record.name}
        tabs={[
          {
            id: 'details',
            label: 'Details',
            icon: 'info',
            content: (
              <>
                <CampgroundDetails hubId={hubId} record={record} orientation={calibration.orientation ?? 0} onOrientation={(d) => void saveOrientation(d)} onSaved={setRecord} />
                {places}
              </>
            ),
          },
          { id: 'status', label: 'Status', icon: 'locate', content: statusTab },
          { id: 'roads', label: 'Roads', icon: 'map', content: roadsBlock },
          { id: 'obstacles', label: 'Obstacles', icon: 'emergency', content: obstaclesBlock },
        ]}
      />
    </div>
  )
}
