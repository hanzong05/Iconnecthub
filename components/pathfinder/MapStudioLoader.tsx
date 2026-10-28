'use client'

import dynamic from 'next/dynamic'

const Skeleton = () => <div className="flex h-[60dvh] items-center justify-center rounded-2xl bg-bg text-sm text-ink2">Loading the map…</div>

// The map screens use browser-only features (drawing, Leaflet), so they load in the browser after the page arrives.
export const MapStudioLoader = dynamic(() => import('./MapStudio'), { ssr: false, loading: Skeleton })
export const CalibrationLoader = dynamic(() => import('./calibration/CalibrationPage'), { ssr: false, loading: Skeleton })
