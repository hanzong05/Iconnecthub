import type { CalibrationFile, ControlPoint, Point } from './types'
import { CHECKPOINT_TOLERANCE_M } from './mapConfig'
import { toRad } from './geo'

/**
 * Affine model mapping GPS (lat/lon) to image pixels.
 * Internally uses local metres east/north of `origin` for numerical stability.
 * This is a single global transform: it is only accurate if the illustrated map is close to
 * a uniform scale/rotation/shear of the real campground. Check residuals on checkpoints.
 */
export interface AffineModel {
  origin: { lat: number; lon: number }
  cx: [number, number, number] // x = cx0 + cx1*east + cx2*north
  cy: [number, number, number] // y = cy0 + cy1*east + cy2*north
  metersPerPixel: number
}

export type CalibrationStatus = 'uncalibrated' | 'provisional' | 'unverified' | 'failed' | 'verified'

export interface CalibrationReport {
  status: CalibrationStatus
  message: string
  model: AffineModel | null
  error: string | null
  controlErrorsM: Array<{ id: string; m: number }>
  checkpointErrorsM: Array<{ id: string; m: number }>
  maxCheckpointM: number | null
}

const M_PER_DEG_LAT = 110574
const M_PER_DEG_LON_EQ = 111320

function toLocal(lat: number, lon: number, origin: { lat: number; lon: number }) {
  return {
    east: (lon - origin.lon) * M_PER_DEG_LON_EQ * Math.cos(toRad(origin.lat)),
    north: (lat - origin.lat) * M_PER_DEG_LAT,
  }
}

function solve3(A: number[][], b: number[]): number[] | null {
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < 3; c++) {
    let p = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < 3; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]]
}

export type FitResult = { model: AffineModel } | { error: string }

/** Least-squares affine fit using control points only (checkpoints are kept independent). */
export function fitCalibration(points: ControlPoint[]): FitResult {
  if (points.length < 3) return { error: 'At least 3 control points are required.' }
  const origin = {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lon: points.reduce((s, p) => s + p.lon, 0) / points.length,
  }
  const rows = points.map((p) => {
    const { east, north } = toLocal(p.lat, p.lon, origin)
    return [1, east, north]
  })
  const ATA = [0, 1, 2].map((a) => [0, 1, 2].map((b) => rows.reduce((s, r) => s + r[a] * r[b], 0)))
  const ATx = [0, 1, 2].map((a) => rows.reduce((s, r, i) => s + r[a] * points[i].x, 0))
  const ATy = [0, 1, 2].map((a) => rows.reduce((s, r, i) => s + r[a] * points[i].y, 0))
  const cx = solve3(ATA, ATx)
  const cy = solve3(ATA, ATy)
  const bad = 'Control points are collinear or too close together. Spread them across the map.'
  if (!cx || !cy) return { error: bad }
  const det = cx[1] * cy[2] - cx[2] * cy[1]
  if (Math.abs(det) < 1e-12) return { error: bad }
  return { model: { origin, cx: [cx[0], cx[1], cx[2]], cy: [cy[0], cy[1], cy[2]], metersPerPixel: 1 / Math.sqrt(Math.abs(det)) } }
}

/** Warning when the calibration was made for a different image size (or the size was never recorded). */
export function imageMismatch(calib: CalibrationFile, width: number, height: number): string | null {
  if (!calib.controlPoints.length) return null
  if (!calib.image) return 'Calibration has no recorded image size: check it still matches this image.'
  if (calib.image.width !== width || calib.image.height !== height) {
    return `Calibration was made for a ${calib.image.width}×${calib.image.height} image, but this map is ${width}×${height}. Recalibrate.`
  }
  return null
}

export function project(model: AffineModel, lat: number, lon: number): Point {
  const { east, north } = toLocal(lat, lon, model.origin)
  return {
    x: model.cx[0] + model.cx[1] * east + model.cx[2] * north,
    y: model.cy[0] + model.cy[1] * east + model.cy[2] * north,
  }
}

function errorMeters(model: AffineModel, p: ControlPoint): number {
  const q = project(model, p.lat, p.lon)
  return Math.hypot(q.x - p.x, q.y - p.y) * model.metersPerPixel
}

export function calibrationReport(calib: CalibrationFile): CalibrationReport {
  const fit = fitCalibration(calib.controlPoints)
  if ('error' in fit) {
    return {
      status: 'uncalibrated',
      message: 'Map not calibrated. GPS position cannot be placed on the map.',
      model: null,
      error: fit.error,
      controlErrorsM: [],
      checkpointErrorsM: [],
      maxCheckpointM: null,
    }
  }
  const model = fit.model
  const controlErrorsM = calib.controlPoints.map((p) => ({ id: p.id, m: errorMeters(model, p) }))
  const checkpointErrorsM = calib.checkpoints.map((p) => ({ id: p.id, m: errorMeters(model, p) }))
  const maxCheckpointM = checkpointErrorsM.length ? Math.max(...checkpointErrorsM.map((c) => c.m)) : null

  let status: CalibrationStatus
  let message: string
  if (calib.controlPoints.length < 4) {
    status = 'provisional'
    message = 'Provisional calibration: add at least 4 control points (fit is exact, not checked).'
  } else if (checkpointErrorsM.length < 2) {
    status = 'unverified'
    message = 'Calibrated, but not verified: add at least 2 independent checkpoints.'
  } else if (maxCheckpointM !== null && maxCheckpointM > CHECKPOINT_TOLERANCE_M) {
    status = 'failed'
    message = `Checkpoint error is ${maxCheckpointM.toFixed(0)} m (limit ${CHECKPOINT_TOLERANCE_M} m). Recalibrate.`
  } else {
    status = 'verified'
    message = 'Calibration verified against checkpoints.'
  }
  return { status, message, model, error: null, controlErrorsM, checkpointErrorsM, maxCheckpointM }
}

/** Inverse of project(): image pixel -> GPS. */
export function unproject(model: AffineModel, p: Point): { lat: number; lng: number } {
  const [a, b, c] = model.cx
  const [d, e, f] = model.cy
  // Solve [b c; e f] * [east; north] = [x - a; y - d]
  const det = b * f - c * e
  const rx = p.x - a
  const ry = p.y - d
  const east = (rx * f - c * ry) / det
  const north = (b * ry - e * rx) / det
  return {
    lat: model.origin.lat + north / M_PER_DEG_LAT,
    lng: model.origin.lon + east / (M_PER_DEG_LON_EQ * Math.cos(toRad(model.origin.lat))),
  }
}
