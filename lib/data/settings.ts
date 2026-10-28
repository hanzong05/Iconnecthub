import 'server-only'
import { getFirebaseToken } from '@/lib/auth/session'
import type { AuditEntry, HubSettings } from '@/lib/settings-catalog'
import { readDraftState } from '@/lib/settings-draft'
import { SessionExpiredError } from './dashboard'
import { readPath } from './scope'

/** Everything on the Settings page for one hub, read as the signed-in user: the draft laid over the live settings. */
export async function getHubSettings(hubId: string, hubName: string): Promise<HubSettings> {
  const t = await getFirebaseToken()
  if (!t) throw new SessionExpiredError('Your session has expired.')
  const [rawLive, rawDraft, meta] = await Promise.all([
    readPath(`hubs/${hubId}/settings`, t),
    readPath(`hubs/${hubId}/settingsDraft`, t).catch(() => null),
    readPath(`hubs_meta/${hubId}`, t).catch(() => null),
  ])
  const { effective, draft } = readDraftState(rawLive, rawDraft, meta, hubId, hubName)
  return { ...effective, draft }
}

const monthKey = (d: Date) => d.toISOString().slice(0, 7)

/** The newest changes to this hub's settings (publishes, restores and direct changes), plus which published version is current. */
export async function getSettingsHistory(hubId: string): Promise<{ entries: AuditEntry[]; currentReleaseId: string | null }> {
  const t = await getFirebaseToken()
  if (!t) throw new SessionExpiredError('Your session has expired.')
  const now = new Date()
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const [a, b, cur] = await Promise.all([
    readPath(`hubs/${hubId}/audit/${monthKey(now)}`, t).catch(() => null),
    readPath(`hubs/${hubId}/audit/${monthKey(prev)}`, t).catch(() => null),
    readPath(`hubs/${hubId}/releaseCurrent`, t).catch(() => null),
  ])
  const entries: AuditEntry[] = []
  for (const group of [a, b]) {
    if (!group || typeof group !== 'object') continue
    for (const [id, v] of Object.entries(group as Record<string, unknown>)) {
      const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
      if (typeof o.at !== 'string') continue
      entries.push({
        id,
        at: o.at,
        by: typeof o.by === 'string' ? o.by : '',
        action: typeof o.action === 'string' ? o.action : '',
        summary: typeof o.summary === 'string' ? o.summary.slice(0, 600) : '',
        releaseId: typeof o.releaseId === 'string' ? o.releaseId : undefined,
      })
    }
  }
  entries.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))
  return { entries: entries.slice(0, 30), currentReleaseId: typeof cur === 'string' ? cur : null }
}
