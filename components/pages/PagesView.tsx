'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { discardPageDraftAction, publishPageAction, restorePageVersionAction, savePageDraftAction, savePageValuesAction, type PageActionState } from '@/app/actions/pages'
import Modal from '@/components/ui/Modal'
import RemoteImg from '@/components/ui/RemoteImg'
import { inputClass } from '@/components/ui/fields'
import { prepareMapImage, uploadPrepared } from '@/components/pathfinder/images'
import type { PageState } from '@/lib/data/pages'
import type { HubSettings } from '@/lib/settings-catalog'
import { BLOCK_LABELS, BLOCK_LIMITS as L, MAX_BLOCKS, describeChange, emptyPage, type Block, type BlockType, type Page } from '@/lib/pages'
import BlockEditor from './BlockEditor'
import TemplateForm from './TemplateForm'
import { cleanValues, fillToPage, missingRequired, type SlotValues } from '@/lib/template'
import EmbedPreview from '@/components/preview/EmbedPreview'

const btn = 'h-10 whitespace-nowrap rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:opacity-60'
const ghost = 'h-10 whitespace-nowrap rounded-xl border border-line2 bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60'
const lab = 'flex flex-col gap-1 text-[11px] font-semibold text-ink2'
const card = 'rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_8px_rgba(15,31,74,0.04)]'

const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
function blank(type: BlockType): Block {
  const id = newId()
  switch (type) {
    case 'section': return { id, type, title: '', tone: 'normal' }
    case 'rule': return { id, type, title: '', body: '' }
    case 'contact': return { id, type, label: '', kind: 'phone', value: '' }
    case 'image': return { id, type, url: '', caption: '' }
    case 'card': return { id, type, title: '', text: '', meta: '' }
  }
}
const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const ADD: BlockType[] = ['section', 'rule', 'contact', 'card', 'image']

function status(p: PageState): { text: string; tone: string } {
  if (p.draft) return { text: p.draft.stale ? 'Draft, out of date' : 'Draft', tone: 'bg-amber-50 text-amber-700' }
  if (p.live) return { text: 'Live', tone: 'bg-emerald-50 text-emerald-700' }
  return { text: 'Not set up', tone: 'bg-surface2 text-ink3' }
}

export default function PagesView({ hubId, hubName, pages, settings, css, dbUrl }: { hubId: string; hubName: string; pages: PageState[]; settings: HubSettings; css: string; dbUrl: string }) {
  const [selected, setSelected] = useState(pages[0]?.id ?? 'reservations')
  const page = pages.find((p) => p.id === selected) ?? pages[0]
  const livePages = Object.fromEntries(pages.filter((p) => p.live && p.live.blocks.length > 0).map((p) => [p.id, p.live as Page]))
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Pages" className={`${card} lg:sticky lg:top-4`}>
        <h2 className="mb-2 text-sm font-bold text-ink">Pages for {hubName}</h2>
        <ul className="flex flex-col gap-1.5">
          {pages.map((p) => {
            const s = status(p)
            return (
              <li key={p.id}>
                <button type="button" aria-current={p.id === selected ? 'page' : undefined} onClick={() => setSelected(p.id)} className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${p.id === selected ? 'border-brand bg-[#eef3ff] text-brand' : 'border-line bg-surface text-ink hover:border-brand'}`}>
                  <span className="min-w-0 truncate">{p.label}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.tone}`}>{s.text}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-[11px] text-ink3">Guests see a page only after you publish it. Until a page is published, guests keep seeing what the hub already shows.</p>
      </nav>
      {page && <PageEditor key={`${hubId}:${page.id}`} hubId={hubId} state={page} settings={settings} css={css} dbUrl={dbUrl} livePages={livePages} />}
    </div>
  )
}

function PageEditor({ hubId, state, settings, css, dbUrl, livePages }: { hubId: string; state: PageState; settings: HubSettings; css: string; dbUrl: string; livePages: Record<string, Page> }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const fromServer = state.draft?.page ?? state.live ?? emptyPage()
  const [work, setWork] = useState<Page>(fromServer)
  const tpl = state.template
  const valuesFromServer = (): SlotValues => state.draft?.values ?? state.liveValues ?? {}
  const [values, setValues] = useState<SlotValues>(valuesFromServer)
  const [dirty, setDirty] = useState(false)
  const ver = useRef(state.draft?.version ?? 0)
  const [conflict, setConflict] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [history, setHistory] = useState(false)
  const [bannerBusy, setBannerBusy] = useState(false)
  const bannerFile = useRef<HTMLInputElement>(null)

  // Take in what the server now says (after a publish, discard or restore), but never over unsaved typing.
  const sig = useMemo(() => JSON.stringify([state.draft?.version ?? 0, state.liveAt, state.draft?.updatedAt ?? '']), [state.draft?.version, state.liveAt, state.draft?.updatedAt])
  useEffect(() => {
    if (dirty) return
    setWork(state.draft?.page ?? state.live ?? emptyPage())
    setValues(valuesFromServer())
    ver.current = state.draft?.version ?? 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  // Leaving with unsaved edits would lose them.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // For a page with a layout the preview is built from the typed values; while something typed is not valid yet, the last good page stays.
  const built = useMemo(() => {
    if (!tpl) return work
    try {
      return fillToPage(tpl, values)
    } catch {
      return null
    }
  }, [tpl, values, work])
  const lastGood = useRef<Page>(work)
  if (built) lastGood.current = built
  const shown: Page = built ?? lastGood.current
  const missing = tpl ? missingRequired(tpl, cleanValues(tpl, values)) : []

  const say = (r: PageActionState) => {
    if (r.version !== undefined) ver.current = r.version
    if (r.conflict) setConflict(true)
    setMsg(r.error ? { text: r.error, error: true } : { text: r.success ?? 'Saved.' })
  }
  const edit = (next: Page) => {
    setWork(next)
    setDirty(true)
    setMsg(null)
  }
  const editValues = (next: SlotValues) => {
    setValues(next)
    setDirty(true)
    setMsg(null)
  }
  const setBlock = (i: number, b: Block) => edit({ ...work, blocks: work.blocks.map((x, j) => (j === i ? b : x)) })
  const move = (i: number, dir: -1 | 1) => {
    const blocks = [...work.blocks]
    ;[blocks[i], blocks[i + dir]] = [blocks[i + dir], blocks[i]]
    edit({ ...work, blocks })
  }
  const remove = (i: number) => {
    const b = work.blocks[i]
    const named = ('title' in b && b.title) || ('label' in b && b.label) || BLOCK_LABELS[b.type]
    if (window.confirm(`Delete this block (${named})?`)) edit({ ...work, blocks: work.blocks.filter((_, j) => j !== i) })
  }
  const add = (t: BlockType) => work.blocks.length < MAX_BLOCKS && edit({ ...work, blocks: [...work.blocks, blank(t)] })

  const act = (fn: () => Promise<PageActionState>, ok?: () => void) =>
    start(async () => {
      const r = await fn()
      say(r)
      if (!r.error) {
        ok?.()
        router.refresh()
      }
    })

  const save = () => act(() => (tpl ? savePageValuesAction(hubId, state.id, values, ver.current) : savePageDraftAction(hubId, state.id, work, ver.current)), () => setDirty(false))
  const publish = () => act(() => publishPageAction(hubId, state.id, ver.current), () => setReviewing(false))
  const discard = () => {
    if (window.confirm('Discard the draft? The unpublished changes are lost. What guests see does not change.')) act(() => discardPageDraftAction(hubId, state.id, ver.current), () => setDirty(false))
  }
  const restore = (id: string, at: string) => {
    if (window.confirm(`Load the version from ${when(at)} into your draft? Your current draft is replaced. Guests see nothing new until you publish.`)) act(() => restorePageVersionAction(hubId, state.id, id, ver.current), () => { setHistory(false); setDirty(false) })
  }

  async function uploadBanner(files: FileList | null) {
    const picked = files?.[0]
    if (!picked) return
    setBannerBusy(true)
    try {
      const up = await uploadPrepared(await prepareMapImage(picked))
      edit({ ...work, banner: up.url })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'The picture could not be uploaded.', error: true })
    } finally {
      setBannerBusy(false)
      if (bannerFile.current) bannerFile.current.value = ''
    }
  }

  /** The hub as guests get it, with the given version of this page open in the More menu sheet. */
  const embed = (shown: Page | null, opts?: { framed?: boolean; caption?: boolean; scale?: number }) => (
    <EmbedPreview key={`${state.id}:${shown && shown.blocks.length > 0 ? 1 : 0}`} hubId={hubId} dbUrl={dbUrl} css={css} {...opts} preview={{ settings, pages: shown && shown.blocks.length > 0 ? { ...livePages, [state.id]: shown } : Object.fromEntries(Object.entries(livePages).filter(([k]) => k !== state.id)), openPage: shown && shown.blocks.length > 0 ? state.id : undefined, tab: 'more' }} />
  )
  const hasDraft = state.draft !== null
  const canReview = hasDraft && !dirty && !conflict
  const s = status(state)

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex min-w-0 flex-col gap-4">
        {conflict && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            <span>Someone else saved this page after you opened it. Reload to see their changes before you continue, so nothing is overwritten.</span>
            <button type="button" className="h-9 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700" onClick={() => window.location.reload()}>Reload latest</button>
          </div>
        )}

        <section aria-label="Draft and publishing" className={`${card} flex flex-wrap items-center gap-3`}>
          <div className="min-w-0 flex-1 basis-60">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-ink">{state.label}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.tone}`}>{s.text}</span>
              {dirty && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">Unsaved edits</span>}
            </div>
            <p className="mt-1 text-xs text-ink3">
              {dirty ? 'Save the draft to keep your edits. Guests do not see anything until you publish.' : hasDraft ? `Draft saved${state.draft?.updatedBy ? ` by ${state.draft.updatedBy}` : ''}. Review, then publish.${state.draft?.stale ? ' The live page changed since this draft was started, so publishing is blocked: discard the draft or load a version from History.' : ''}` : state.live ? `Live${state.liveBy ? `, last published by ${state.liveBy}` : ''}. ${state.hint}` : state.hint}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={ghost} onClick={() => setHistory(true)}>History</button>
            <button type="button" className={ghost} disabled={pending || !hasDraft} onClick={discard}>Discard draft</button>
            <button type="button" className={ghost} disabled={pending || !dirty || conflict} onClick={save}>{pending && dirty ? 'Saving…' : 'Save draft'}</button>
            <button type="button" className={btn} disabled={pending || !canReview || Boolean(state.draft?.stale) || missing.length > 0} title={missing.length ? `Fill in ${missing.join(', ')} first` : undefined} onClick={() => setReviewing(true)}>Review and publish</button>
          </div>
        </section>

        <div role="status" aria-live="polite" className="empty:hidden">
          {msg && <p className={`rounded-xl border px-4 py-2.5 text-[13px] ${msg.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{msg.text}</p>}
        </div>

        {tpl && missing.length > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">Still to fill in before you can publish: {missing.join(', ')}.</p>}
        <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          {tpl && <TemplateForm template={tpl} values={values} onChange={editValues} onError={(m) => setMsg({ text: m, error: true })} />}
          {!tpl && (<>
          <section className={card} aria-label="Page header">
            <h3 className="mb-3 text-sm font-bold text-ink">Page header</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={lab} htmlFor="pg-title">Title<input id="pg-title" className={inputClass} maxLength={L.pageTitle} value={work.title} onChange={(e) => edit({ ...work, title: e.target.value })} placeholder={state.label} /></label>
              <label className={lab} htmlFor="pg-sub">Subtitle<input id="pg-sub" className={inputClass} maxLength={L.subtitle} value={work.subtitle} onChange={(e) => edit({ ...work, subtitle: e.target.value })} placeholder="One short line under the title" /></label>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className={`${lab} min-w-0 flex-1 basis-60`} htmlFor="pg-banner">Banner picture link (optional, https://)<input id="pg-banner" className={inputClass} maxLength={L.url} value={work.banner} onChange={(e) => edit({ ...work, banner: e.target.value })} placeholder="https://…" /></label>
              <input ref={bannerFile} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload a banner picture" tabIndex={-1} onChange={(e) => uploadBanner(e.target.files)} />
              <button type="button" className="h-11 rounded-xl border border-line2 bg-surface px-4 text-sm font-semibold text-ink hover:border-brand hover:text-brand disabled:opacity-60" disabled={bannerBusy} onClick={() => bannerFile.current?.click()}>{bannerBusy ? 'Uploading…' : 'Upload'}</button>
              {work.banner && <button type="button" className="h-11 rounded-xl px-3 text-sm font-semibold text-red-600 hover:underline" onClick={() => edit({ ...work, banner: '' })}>Remove</button>}
            </div>
            {/^https:\/\//i.test(work.banner) && <RemoteImg src={work.banner} w={400} alt="" className="mt-2 h-20 w-40 rounded-lg border border-line object-cover" />}
          </section>

          <section className={card} aria-label="Blocks">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-ink">Content ({work.blocks.length}/{MAX_BLOCKS})</h3>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Add a block">
                {ADD.map((t) => (
                  <button key={t} type="button" className="h-8 rounded-lg border border-line2 bg-surface px-2.5 text-xs font-semibold text-ink hover:border-brand hover:text-brand disabled:opacity-40" disabled={work.blocks.length >= MAX_BLOCKS} onClick={() => add(t)}>+ {BLOCK_LABELS[t]}</button>
                ))}
              </div>
            </div>
            {work.blocks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line2 px-4 py-8 text-center text-[13px] text-ink3">No content yet. Add a section heading, then rules, phone numbers or info cards under it.</p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {work.blocks.map((b, i) => (
                  <BlockEditor key={b.id} block={b} index={i} count={work.blocks.length} onChange={(nb) => setBlock(i, nb)} onMove={(d) => move(i, d)} onRemove={() => remove(i)} />
                ))}
              </ol>
            )}
          </section>
          </>)}
        </fieldset>

        <details className={`${card} xl:hidden`}>
          <summary className="cursor-pointer text-sm font-semibold text-ink">Preview</summary>
          <div className="mt-3 flex justify-center">{embed(shown)}</div>
        </details>
      </div>

      <aside aria-label="Preview" className="sticky top-4 hidden xl:block">{embed(shown)}</aside>

      <Modal open={reviewing} title={`Publish ${state.label}`} subtitle="This is what changes for guests when you publish." onClose={() => setReviewing(false)}>
        <p className="mb-3 rounded-lg bg-surface2 px-3 py-2 text-[13px] text-ink2">{state.draft ? describeChange(state.live, state.draft.page) : ''}</p>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div><div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-ink3">Live now</div>{state.live ? embed(state.live, { framed: false }) : <p className="rounded-xl border border-dashed border-line2 px-3 py-10 text-center text-xs text-ink3">Not published yet. Guests see the hub&apos;s built-in page.</p>}</div>
          <div><div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-emerald-700">After publishing</div>{state.draft && embed(state.draft.page, { framed: false })}</div>
        </div>
        <p className="mb-4 text-xs text-ink3">You can load the previous version back from History at any time.</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={ghost} onClick={() => setReviewing(false)}>Keep editing</button>
          <button type="button" className={btn} disabled={pending} onClick={publish}>{pending ? 'Publishing…' : 'Publish'}</button>
        </div>
      </Modal>

      <Modal open={history} title={`${state.label} history`} subtitle="Earlier published versions. Loading one puts it in your draft; nothing changes for guests until you publish." onClose={() => setHistory(false)}>
        {state.history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line2 px-4 py-8 text-center text-[13px] text-ink3">Nothing here yet. Each publish is listed.</p>
        ) : (
          <ul className="space-y-2.5">
            {state.history.map((h) => (
              <li key={h.id} className="rounded-xl border border-line p-3 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-ink">{h.action === 'baseline' ? 'Saved original' : 'Published'}</span>
                  <span className="text-xs text-ink3">{when(h.at)}</span>
                </div>
                <div className="mt-0.5 text-xs text-ink3">{h.by || 'Unknown'}</div>
                <p className="mt-1.5 text-ink2">{h.page.title || state.label}: {h.page.blocks.length} block{h.page.blocks.length === 1 ? '' : 's'}</p>
                <button type="button" disabled={pending} className="mt-2 h-8 rounded-lg border border-line2 px-3 text-xs font-semibold text-ink hover:border-brand hover:text-brand disabled:opacity-60" onClick={() => restore(h.id, h.at)}>Load into draft</button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  )
}
