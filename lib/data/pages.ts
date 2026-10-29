import 'server-only'
import { getFirebaseToken } from '@/lib/auth/session'
import { readMenuItems } from '@/lib/menu'
import { PAGE_DEFS, readPage, type Page } from '@/lib/pages'
import { cleanValues, type SlotValues, type Template } from '@/lib/template'
import { SessionExpiredError } from './dashboard'
import { readPath } from './scope'

export interface HistoryEntry { id: string; at: string; by: string; action: string; page: Page }
export interface DraftInfo { page: Page; version: number; values: SlotValues | null; baseAt: string; updatedAt: string; updatedBy: string; /** The live page was changed after this draft was started. */ stale: boolean }
export interface PageState {
  id: string
  label: string
  hint: string
  /** The layout the Super Admin set, when this page has one. */
  template: Template | null
  live: Page | null
  liveValues: SlotValues | null
  liveAt: string
  liveBy: string
  draft: DraftInfo | null
  history: HistoryEntry[]
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Every content page of one hub with its live version, its draft and its history. The caller has already checked access to the hub. */
export async function getPages(hubId: string): Promise<PageState[]> {
  const token = await getFirebaseToken()
  if (!token) throw new SessionExpiredError('Your session has expired.')
  const [live, drafts, history, menu] = await Promise.all([readPath(`hubs/${hubId}/pages`, token), readPath(`hubs/${hubId}/pagesDraft`, token), readPath(`hubs/${hubId}/pageHistory`, token), readPath(`hubs/${hubId}/settings/menuItems`, token)])
  // The fixed pages first, then one page for each published "details page" menu item.
  const defs: { id: string; label: string; hint: string; template: Template | null }[] = [...PAGE_DEFS.map((p) => ({ ...p, template: null })), ...readMenuItems(menu).filter((m) => m.kind === 'page').map((m) => ({ id: m.id, label: m.label, template: m.template ?? null, hint: `The page that opens from "${m.label}" in the More menu.` }))]
  const L = rec(live)
  const D = rec(drafts)
  const H = rec(history)
  return defs.map((def) => {
    const l = rec(L[def.id])
    const livePage = readPage(L[def.id])
    const d = rec(D[def.id])
    const draftPage = readPage(d)
    const liveAt = str(l.updatedAt)
    const hist: HistoryEntry[] = Object.entries(rec(H[def.id]))
      .flatMap(([id, e]) => {
        const p = readPage(e)
        const r = rec(e)
        return p || r.n === 0 ? [{ id, at: str(r.at), by: str(r.by, 120), action: str(r.action, 20), page: p ?? { title: '', subtitle: '', banner: '', blocks: [] } }] : []
      })
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 15)
    return {
      id: def.id,
      label: def.label,
      hint: def.hint,
      template: def.template,
      live: livePage,
      liveValues: def.template && l.values ? cleanValues(def.template, l.values) : null,
      liveAt,
      liveBy: str(l.updatedBy, 120),
      draft: Object.keys(d).length ? { page: draftPage ?? { title: '', subtitle: '', banner: '', blocks: [] }, values: def.template && d.values ? cleanValues(def.template, d.values) : null, version: typeof d.version === 'number' ? d.version : 0, baseAt: str(d.baseAt), updatedAt: str(d.updatedAt), updatedBy: str(d.updatedBy, 120), stale: str(d.baseAt) !== liveAt } : null,
      history: hist,
    }
  })
}

/** The published pages by id (only ones with content), as guests get them. */
export async function getLivePages(hubId: string): Promise<Record<string, Page>> {
  const out: Record<string, Page> = {}
  try {
    for (const p of await getPages(hubId)) if (p.live && p.live.blocks.length > 0) out[p.id] = p.live
  } catch {
    /* the preview just shows no pages */
  }
  return out
}
