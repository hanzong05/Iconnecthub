'use client'

import { remainingRoute } from '@/lib/pathfinder/routeTrim'
import { simplifyPolyline, smoothPolyline } from '@/lib/pathfinder/smoothPath'
import type { RefObject } from 'react'
import type { Destination, Point } from '@/lib/pathfinder/types'

/** stale: the last GPS update is old, so the marker is dimmed rather than shown as current. */
export function GPSLocationMarker({ point, scale, accuracyPx, stale = false }: { point: Point; scale: number; accuracyPx: number; stale?: boolean }) {
  const r = 9 / scale
  return (
    <g transform={`translate(${point.x} ${point.y})`} opacity={stale ? 0.4 : 1}>
      <circle r={Math.max(accuracyPx, 0)} fill="#1a56db" fillOpacity={0.12} stroke="#1a56db" strokeOpacity={0.35} strokeWidth={1.5 / scale} />
      <circle r={r + 3 / scale} fill="#ffffff" />
      <circle r={r} fill="#1a56db" />
    </g>
  )
}

/**
 * Heading arrow in image space: pointing up = the heading. The outer group places it (React);
 * the inner group's rotation is written every frame by MapViewer, so it turns smoothly.
 */
export function HeadingArrow({
  point,
  visible,
  scale,
  arrowRef,
}: {
  point: Point
  /** False until a heading is known. The angle itself is written by MapViewer every frame. */
  visible: boolean
  scale: number
  arrowRef?: RefObject<SVGGElement | null>
}) {
  if (!visible) return null
  const s = 1 / scale
  return (
    <g transform={`translate(${point.x} ${point.y})`}>
      <g ref={arrowRef}>
        <polygon
          points={`0,${-26 * s} ${10 * s},${6 * s} 0,${2 * s} ${-10 * s},${6 * s}`}
          fill="#2563eb"
          stroke="#ffffff"
          strokeWidth={2 * s}
          strokeLinejoin="round"
        />
      </g>
    </g>
  )
}

export function RouteOverlay({ points, from, scale }: { points: Point[]; from?: Point | null; scale: number }) {
  // While walking, only the part of the route ahead of the walker is drawn, so the line shrinks as you move.
  const shown = from ? remainingRoute(points, from) : points
  if (shown.length < 2) return null
  // Straightened where nearly straight and rounded at bends, on every map (embed included).
  const drawn = smoothPolyline(simplifyPolyline(shown), 8)
  const d = drawn.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')
  // Lightsaber look: a soft cyan halo, a brighter cyan body and a pale core.
  const layer = (color: string, width: number, opacity: number) => (
    <path d={d} fill="none" stroke={color} strokeWidth={width / scale} strokeOpacity={opacity} strokeLinecap="round" strokeLinejoin="round" />
  )
  return (
    <g>
      {layer('#22d3ee', 26, 0.18)}
      {layer('#22d3ee', 16, 0.35)}
      {layer('#06b6d4', 9, 0.9)}
      {layer('#a5f3fc', 3.5, 1)}
    </g>
  )
}

/** Turns a marker back by the map's current rotation, so its pin and label stay upright on screen in heading-up mode. */
const UPRIGHT = { transform: 'rotate(calc(var(--map-rot, 0deg) * -1))' }

export function DestinationMarkers({
  destinations,
  selectedId,
  scale,
  showAll = false,
}: {
  destinations: Destination[]
  selectedId: string | null
  scale: number
  /** Calibration: every saved location is shown with its name, so each one can be checked. */
  showAll?: boolean
}) {
  const k = 1 / scale
  if (showAll) {
    return (
      <g>
        {destinations.map((d) => (
          <g key={d.id} transform={`translate(${d.x} ${d.y})`}>
            <g style={UPRIGHT}>
            <circle r={6 * k} fill={d.id === selectedId ? '#dc2626' : '#1a56db'} stroke="#ffffff" strokeWidth={2 * k} />
            <text
              y={-10 * k}
              textAnchor="middle"
              fontSize={11 * k}
              fontWeight={700}
              fill="#111827"
              stroke="#ffffff"
              strokeWidth={3 * k}
              paintOrder="stroke"
            >
              {d.name}
            </text>
            </g>
          </g>
        ))}
      </g>
    )
  }
  // Normal view: every visible site has a labelled pill. The selected site also gets a red pin.
  return (
    <g>
      {destinations.map((d) => {
        const here = d.id === selectedId
        const text = d.name
        const w = (text.length * 6.6 + 22) * k
        const h = 22 * k
        const pillY = (here ? -58 : -14) * k
        return (
          <g key={d.id} transform={`translate(${d.x} ${d.y})`}>
            <g style={UPRIGHT}>
            {here ? (
              <>
                <ellipse cx={0} cy={0} rx={11 * k} ry={4 * k} fill="#0f172a" fillOpacity={0.35} />
                <path
                  d={`M0 ${-2 * k} C${-4 * k} ${-14 * k} ${-14 * k} ${-18 * k} ${-14 * k} ${-30 * k} C${-14 * k} ${-42 * k} ${-7 * k} ${-46 * k} 0 ${-46 * k} C${7 * k} ${-46 * k} ${14 * k} ${-42 * k} ${14 * k} ${-30 * k} C${14 * k} ${-18 * k} ${4 * k} ${-14 * k} 0 ${-2 * k}Z`}
                  fill="#e53935"
                  stroke="#ffffff"
                  strokeWidth={1.5 * k}
                  strokeLinejoin="round"
                />
                <circle cx={0} cy={-30 * k} r={6 * k} fill="#f5f5f5" />
              </>
            ) : (
              <circle r={5 * k} fill="#1a56db" stroke="#ffffff" strokeWidth={2 * k} />
            )}
            <g transform={`translate(0 ${pillY})`}>
              <rect
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                rx={h / 2}
                fill={here ? '#1a56db' : '#ffffff'}
                stroke="#1a56db"
                strokeOpacity={0.3}
                strokeWidth={k}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12 * k}
                fontWeight={600}
                fill={here ? '#ffffff' : '#111827'}
              >
                {text}
              </text>
            </g>
            </g>
          </g>
        )
      })}
    </g>
  )
}
