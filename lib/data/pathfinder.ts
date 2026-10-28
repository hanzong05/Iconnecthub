import 'server-only'
import { getFirebaseToken } from '@/lib/auth/session'
import { SessionExpiredError } from './dashboard'
import { getAuthEnv } from '@/lib/env'
import { EMPTY_NETWORK, type CampgroundRecord, type MapBundle, type Network } from '@/lib/pathfinder/model'
import { ID_RE, fromStoredJson, parseCalibration, parseNetwork, recordFromStored } from '@/lib/pathfinder/validate'

/** The database rules refuse this account on Path Finder data (not the same as an expired sign-in). */
export class PathFinderAccessError extends Error {}

/** Reads one value. A 401 saying "permission denied" is a rules problem, so it must not sign the person out. */
async function readPath(path: string, t: string): Promise<unknown> {
  const { firebaseDatabaseUrl } = getAuthEnv()
  const res = await fetch(`${firebaseDatabaseUrl}/${path}.json?auth=${encodeURIComponent(t)}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  if (res.status === 401 || res.status === 403) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    if (/permission denied/i.test(body?.error ?? '')) throw new PathFinderAccessError('The database rules do not allow Path Finder data yet.')
    throw new SessionExpiredError('Firebase rejected the session token.')
  }
  if (!res.ok) throw new Error(`Database read failed (HTTP ${res.status})`)
  return res.json()
}

async function token(): Promise<string> {
  const t = await getFirebaseToken()
  if (!t) throw new SessionExpiredError('Your session has expired.')
  return t
}

const base = (hubId: string) => `hubs/${hubId}/pathfinder`

/** A hub's campground maps, newest save first. Damaged records are skipped, not shown. */
export async function getCampgrounds(hubId: string): Promise<CampgroundRecord[]> {
  const raw = await readPath(`${base(hubId)}/campgrounds`, await token())
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw as Record<string, unknown>)
    .map(([id, r]) => recordFromStored(id, r))
    .filter((r): r is CampgroundRecord => r !== null)
    .sort((a, b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0))
}

/** One campground with its saved network and calibration. Null when it does not exist in this hub. */
export async function getCampgroundBundle(hubId: string, id: string): Promise<MapBundle | null> {
  if (!ID_RE.test(id)) return null
  const t = await token()
  const [rec, net, cal] = await Promise.all([
    readPath(`${base(hubId)}/campgrounds/${id}`, t),
    readPath(`${base(hubId)}/network/${id}/json`, t),
    readPath(`${base(hubId)}/calibration/${id}/json`, t),
  ])
  const record = recordFromStored(id, rec)
  if (!record) return null
  let network: Network = EMPTY_NETWORK
  try {
    const j = fromStoredJson(net)
    if (j) network = parseNetwork(j)
  } catch {
    network = EMPTY_NETWORK
  }
  let calibration = null
  try {
    const j = fromStoredJson(cal)
    if (j) calibration = parseCalibration(j)
  } catch {
    calibration = null
  }
  return { record, network, calibration }
}

/** Hubs a Super Admin can open in Path Finder (id and name only). */
export async function getHubChoices(): Promise<{ id: string; name: string }[]> {
  const raw = await readPath('hubs_meta', await token())
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw as Record<string, unknown>)
    .flatMap(([id, v]) => (ID_RE.test(id) && v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' ? [{ id, name: (v as { name: string }).name }] : []))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface HubMap { hubId: string; hubName: string; map: CampgroundRecord }

/** Every hub's map (a hub has at most one), and the hubs that have none yet. Super Admin only; the caller checks the role. */
export async function getAllMaps(): Promise<{ maps: HubMap[]; hubsWithoutMap: { id: string; name: string }[] }> {
  const hubs = await getHubChoices()
  const per = await Promise.all(hubs.map(async (h) => ({ h, list: await getCampgrounds(h.id) })))
  const maps: HubMap[] = []
  const hubsWithoutMap: { id: string; name: string }[] = []
  for (const { h, list } of per) {
    if (list.length === 0) hubsWithoutMap.push(h)
    // A hub should have one map; if older data has more, show them all so none is hidden.
    for (const map of list) maps.push({ hubId: h.id, hubName: h.name, map })
  }
  return { maps, hubsWithoutMap }
}
