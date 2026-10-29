'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { AccessError, assertHubAccess, requireWriter, rtdb, type Writer } from '@/lib/data/write'
import { isMenuId, readMenuItems } from '@/lib/menu'
import { cleanValues, fillToPage, missingRequired, readTemplate, type Template } from '@/lib/template'
import { PageInvalid, describeChange, isPageId, readPage, toStored, validatePage, PAGE_DEFS, type Page } from '@/lib/pages'

/** What an action returns. `version` is the draft's new version; `conflict` means someone else changed things first. */
export interface PageActionState { success?: string; error?: string; version?: number; conflict?: boolean }

class Conflict extends Error {}
const HIST_ID = /^[A-Za-z0-9_-]{1,40}$/
const stamp = () => new Date().toISOString()
const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

function fail(e: unknown): PageActionState {
  if (e instanceof Conflict) return { error: e.message, conflict: true }
  if (e instanceof AccessError || e instanceof PageInvalid) return { error: e.message }
  console.error('[pages]', e instanceof Error ? e.message : e)
  return { error: 'Something went wrong. Please try again.' }
}

/**
 * Who may edit a hub's pages: a super admin on any hub, a manager or super manager on their own hub only.
 * The hub and the page id are checked here, on the server, for every call; nothing from the form is trusted.
 */
async function editor(hubId: string, pageId: string): Promise<{ w: Writer; hubId: string; pageId: string; label: string; template: Template | null }> {
  const w = await requireWriter(await getSession())
  if (!['super', 'super_manager', 'manager'].includes(w.session.role)) throw new AccessError('You do not have permission to edit pages.')
  const hub = await assertHubAccess(w, hubId)
  const fixed = PAGE_DEFS.find((p) => p.id === pageId)
  if (fixed) return { w, hubId: hub, pageId, label: fixed.label, template: null }
  // A custom page exists only when the Super Admin has published a "details page" menu item with this id for this hub.
  const item = isMenuId(pageId) ? readMenuItems(await rtdb('GET', `hubs/${hub}/settings/menuItems`, w.token)).find((m) => m.id === pageId && m.kind === 'page') : undefined
  if (!item) throw new PageInvalid('That page does not exist.')
  return { w, hubId: hub, pageId, label: item.label, template: readTemplate(item.template) }
}

interface Nodes { liveRaw: unknown; liveAt: string; draftRaw: Record<string, unknown>; version: number }
async function load(hubId: string, pageId: string, token: string): Promise<Nodes> {
  const [liveRaw, draftRaw] = await Promise.all([rtdb('GET', `hubs/${hubId}/pages/${pageId}`, token), rtdb('GET', `hubs/${hubId}/pagesDraft/${pageId}`, token)])
  const d = rec(draftRaw)
  return { liveRaw, liveAt: typeof rec(liveRaw).updatedAt === 'string' ? (rec(liveRaw).updatedAt as string) : '', draftRaw: d, version: typeof d.version === 'number' ? d.version : 0 }
}
const checkBase = (cur: Nodes, base: number) => {
  if (base !== cur.version) {
    const who = typeof cur.draftRaw.updatedBy === 'string' && cur.draftRaw.updatedBy ? ` (${cur.draftRaw.updatedBy})` : ''
    throw new Conflict(`Someone else saved changes${who} after you opened this page. Reload to see their changes, then try again.`)
  }
}

async function audit(w: Writer, hubId: string, action: string, summary: string) {
  const at = stamp()
  try {
    await rtdb('PUT', `hubs/${hubId}/audit/${at.slice(0, 7)}/${newId('a')}`, w.token, { at, by: w.session.email, action, summary: summary.slice(0, 300) })
  } catch (e) {
    console.error('[pages] audit write failed', e instanceof Error ? e.message : e)
  }
}
const done = (hubId: string) => revalidatePath('/dashboard/pages')

/** Saves the page being edited as a draft. Guests keep seeing the published page until it is published. */
export async function savePageDraftAction(hubId: string, pageId: string, input: unknown, base: number): Promise<PageActionState> {
  try {
    const e = await editor(hubId, pageId)
    // A page with a layout takes values for its layout only; free-form blocks would let a manager get around it.
    if (e.template) throw new PageInvalid('This page has a layout. Fill in its fields instead.')
    const page = validatePage(input)
    const cur = await load(e.hubId, e.pageId, e.w.token)
    checkBase(cur, base)
    const version = cur.version + 1
    await rtdb('PUT', `hubs/${e.hubId}/pagesDraft/${e.pageId}`, e.w.token, { ...toStored(page), version, baseAt: cur.liveAt, updatedAt: stamp(), updatedBy: e.w.session.email })
    done(e.hubId)
    return { success: `${e.label} saved to the draft. Publish to make it live.`, version }
  } catch (err) {
    return fail(err)
  }
}

/**
 * Saves what a manager typed into a page that has a layout. The layout comes from the hub's published settings (never from the
 * request); the values are cleaned, turned into the page guests see, and checked like any other page. Required fields are
 * enforced at publish time, so a half-filled draft can be saved.
 */
export async function savePageValuesAction(hubId: string, pageId: string, input: unknown, base: number): Promise<PageActionState> {
  try {
    const e = await editor(hubId, pageId)
    if (!e.template) throw new PageInvalid('This page has no layout.')
    const values = cleanValues(e.template, input)
    const page = fillToPage(e.template, values)
    const cur = await load(e.hubId, e.pageId, e.w.token)
    checkBase(cur, base)
    const version = cur.version + 1
    await rtdb('PUT', `hubs/${e.hubId}/pagesDraft/${e.pageId}`, e.w.token, { ...toStored(page), values, version, baseAt: cur.liveAt, updatedAt: stamp(), updatedBy: e.w.session.email })
    done(e.hubId)
    return { success: `${e.label} saved to the draft. Publish to make it live.`, version }
  } catch (err) {
    return fail(err)
  }
}

/** Makes the draft live in one step, and keeps the old live page in the history so it can be restored. */
export async function publishPageAction(hubId: string, pageId: string, base: number): Promise<PageActionState> {
  try {
    const e = await editor(hubId, pageId)
    const cur = await load(e.hubId, e.pageId, e.w.token)
    if (cur.version === 0) return { error: 'There is no draft to publish.' }
    checkBase(cur, base)
    if (String(cur.draftRaw.baseAt ?? '') !== cur.liveAt) throw new Conflict('The live page was changed after this draft was started. Discard the draft or restore, then edit again, so nothing is overwritten.')
    let page: Page = readPage(cur.draftRaw) ?? { title: '', subtitle: '', banner: '', blocks: [] }
    // A page with a layout is rebuilt from the saved values and the layout as it is now, so a layout change since the draft was saved is honoured.
    let values: Record<string, unknown> | null = null
    if (e.template && cur.draftRaw.values) {
      values = cleanValues(e.template, cur.draftRaw.values)
      const missing = missingRequired(e.template, values)
      if (missing.length) throw new PageInvalid(`Fill in ${missing.join(', ')} before publishing.`)
      page = fillToPage(e.template, values)
    }
    // Re-check what is about to go live: the stored draft is not trusted just because it is ours.
    const checked = validatePage(page)
    const livePage = readPage(cur.liveRaw)
    const at = stamp()
    const patch: Record<string, unknown> = {
      [`pages/${e.pageId}`]: { ...toStored(checked), ...(values ? { values } : {}), updatedAt: at, updatedBy: e.w.session.email },
      [`pagesDraft/${e.pageId}`]: null,
    }
    const hist = (await rtdb('GET', `hubs/${e.hubId}/pageHistory/${e.pageId}`, e.w.token)) as unknown
    if (livePage && !Object.keys(rec(hist)).length) patch[`pageHistory/${e.pageId}/${newId('h')}`] = { ...toStored(livePage), ...(rec(cur.liveRaw).values ? { values: rec(cur.liveRaw).values } : {}), at: cur.liveAt || at, by: String(rec(cur.liveRaw).updatedBy ?? ''), action: 'baseline' }
    patch[`pageHistory/${e.pageId}/${newId('h')}`] = { ...toStored(checked), ...(values ? { values } : {}), at, by: e.w.session.email, action: 'publish' }
    patch[`audit/${at.slice(0, 7)}/${newId('a')}`] = { at, by: e.w.session.email, action: 'page.publish', summary: `${e.label}: ${describeChange(livePage, checked)}` }
    await rtdb('PATCH', `hubs/${e.hubId}`, e.w.token, patch)
    done(e.hubId)
    return { success: `${e.label} is live.` }
  } catch (err) {
    return fail(err)
  }
}

export async function discardPageDraftAction(hubId: string, pageId: string, base: number): Promise<PageActionState> {
  try {
    const e = await editor(hubId, pageId)
    const cur = await load(e.hubId, e.pageId, e.w.token)
    if (cur.version === 0) return { success: 'There was no draft.' }
    checkBase(cur, base)
    await rtdb('DELETE', `hubs/${e.hubId}/pagesDraft/${e.pageId}`, e.w.token)
    await audit(e.w, e.hubId, 'page.discard', `${e.label}: unpublished draft discarded.`)
    done(e.hubId)
    return { success: 'Draft discarded. What guests see did not change.' }
  } catch (err) {
    return fail(err)
  }
}

/** Puts an earlier version of the page into the draft, to review and publish. Nothing changes for guests until then. */
export async function restorePageVersionAction(hubId: string, pageId: string, historyId: string, base: number): Promise<PageActionState> {
  try {
    const e = await editor(hubId, pageId)
    if (!HIST_ID.test(historyId)) return { error: 'That version does not exist.' }
    const entry = await rtdb('GET', `hubs/${e.hubId}/pageHistory/${e.pageId}/${historyId}`, e.w.token)
    if (entry === null) return { error: 'That version does not exist.' }
    const page = validatePage(readPage(entry) ?? { title: '', subtitle: '', banner: '', blocks: [] })
    const cur = await load(e.hubId, e.pageId, e.w.token)
    checkBase(cur, base)
    const version = cur.version + 1
    const restored = e.template && rec(entry).values ? cleanValues(e.template, rec(entry).values) : null
    await rtdb('PUT', `hubs/${e.hubId}/pagesDraft/${e.pageId}`, e.w.token, { ...toStored(page), ...(restored ? { values: restored } : {}), version, baseAt: cur.liveAt, updatedAt: stamp(), updatedBy: e.w.session.email })
    await audit(e.w, e.hubId, 'page.restore', `${e.label}: an earlier version was loaded into the draft.`)
    done(e.hubId)
    return { success: 'The earlier version is in your draft. Review it, then publish.', version }
  } catch (err) {
    return fail(err)
  }
}
