'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { AccessError, assertHubAccess, requireWriter, rtdb } from '@/lib/data/write'
import type { SaveResult } from '@/lib/pathfinder/model'
import { LIMITS, ValidationError, parseCalibration, parseCampgroundInput, parseDetail, parseExtended, parseId, parseNetwork, toStoredJson } from '@/lib/pathfinder/validate'

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof AccessError || e instanceof ValidationError) return { ok: false, error: e.message }
  console.error('[pathfinder]', e instanceof Error ? e.message : e)
  return { ok: false, error: 'Something went wrong. Please try again.' }
}

const base = (hubId: string) => `hubs/${hubId}/pathfinder`
const refresh = () => {
  revalidatePath('/dashboard/campgrounds')
  revalidatePath('/dashboard/map-locations')
  revalidatePath('/dashboard/calibration')
}

/** Every save starts here: signed in, allowed in this hub, and (for existing maps) the map really belongs to it. */
async function open(hubIdRaw: unknown, idRaw?: unknown) {
  const w = await requireWriter(await getSession())
  if (w.session.role !== 'super') throw new AccessError('Only a Super Admin can use Path Finder.')
  const hubId = await assertHubAccess(w, String(hubIdRaw ?? ''))
  if (idRaw === undefined) return { w, hubId }
  const id = parseId(idRaw)
  const exists = await rtdb('GET', `${base(hubId)}/campgrounds/${id}/name`, w.token)
  if (typeof exists !== 'string') throw new ValidationError('That campground could not be found.')
  return { w, hubId, id }
}

export async function createCampgroundAction(hubId: string, input: unknown): Promise<SaveResult> {
  try {
    const { w, hubId: hub } = await open(hubId)
    const data = parseCampgroundInput(input, true)
    const existing = (await rtdb('GET', `${base(hub)}/campgrounds`, w.token)) as Record<string, unknown> | null
    if (existing && Object.keys(existing).length >= LIMITS.campgroundsPerHub) throw new ValidationError('This hub already has a map. Edit or delete it to use a different one.')
    const now = new Date().toISOString()
    const img = data.image!
    const created = (await rtdb('POST', `${base(hub)}/campgrounds`, w.token, {
      name: data.name,
      public: data.public,
      mapImage: img.url,
      mapWidth: img.width,
      mapHeight: img.height,
      centerLat: data.centerLat,
      centerLon: data.centerLon,
      createdBy: w.session.email,
      createdAt: now,
      updatedAt: now,
    })) as { name?: string }
    if (!created.name) throw new Error('No id returned')
    refresh()
    return { ok: true, id: created.name, updatedAt: now }
  } catch (e) {
    return fail(e)
  }
}

export async function updateCampgroundAction(hubId: string, id: string, input: unknown): Promise<SaveResult> {
  try {
    const { w, hubId: hub, id: cid } = await open(hubId, id)
    const data = parseCampgroundInput(input, false)
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { name: data.name, public: data.public, centerLat: data.centerLat, centerLon: data.centerLon, updatedAt: now }
    if (data.image) {
      patch.mapImage = data.image.url
      patch.mapWidth = data.image.width
      patch.mapHeight = data.image.height
    }
    await rtdb('PATCH', `${base(hub)}/campgrounds/${cid}`, w.token, patch)
    refresh()
    return { ok: true, id: cid, updatedAt: now }
  } catch (e) {
    return fail(e)
  }
}

/** Saves the detail and second images (null removes one). Both are optional extras on the campground. */
export async function saveLayersAction(hubId: string, id: string, input: { detail: unknown; extended: unknown }): Promise<SaveResult> {
  try {
    const { w, hubId: hub, id: cid } = await open(hubId, id)
    const detail = parseDetail(input?.detail)
    const extended = parseExtended(input?.extended)
    const now = new Date().toISOString()
    await rtdb('PATCH', `${base(hub)}/campgrounds/${cid}`, w.token, { detail, extended, updatedAt: now })
    refresh()
    return { ok: true, id: cid, updatedAt: now }
  } catch (e) {
    return fail(e)
  }
}

export async function saveNetworkAction(hubId: string, id: string, network: unknown): Promise<SaveResult> {
  try {
    const { w, hubId: hub, id: cid } = await open(hubId, id)
    const json = toStoredJson(parseNetwork(network))
    const now = new Date().toISOString()
    await rtdb('PUT', `${base(hub)}/network/${cid}`, w.token, { json, updatedAt: now, updatedBy: w.session.email })
    return { ok: true, id: cid, updatedAt: now }
  } catch (e) {
    return fail(e)
  }
}

export async function saveCalibrationAction(hubId: string, id: string, calibration: unknown): Promise<SaveResult> {
  try {
    const { w, hubId: hub, id: cid } = await open(hubId, id)
    const json = toStoredJson(parseCalibration(calibration))
    const now = new Date().toISOString()
    await rtdb('PUT', `${base(hub)}/calibration/${cid}`, w.token, { json, updatedAt: now, updatedBy: w.session.email })
    return { ok: true, id: cid, updatedAt: now }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteCampgroundAction(hubId: string, id: string): Promise<SaveResult> {
  try {
    const { w, hubId: hub, id: cid } = await open(hubId, id)
    await Promise.all([
      rtdb('DELETE', `${base(hub)}/campgrounds/${cid}`, w.token),
      rtdb('DELETE', `${base(hub)}/network/${cid}`, w.token),
      rtdb('DELETE', `${base(hub)}/calibration/${cid}`, w.token),
    ])
    refresh()
    return { ok: true, id: cid }
  } catch (e) {
    return fail(e)
  }
}
