'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { discardDraftAction, publishSettingsAction, restoreReleaseAction, type DraftState } from '@/app/actions/settings'
import Modal from '@/components/ui/Modal'
import type { AuditEntry, DraftInfo } from '@/lib/settings-catalog'

const ACTION_LABEL: Record<string, string> = {
  publish: 'Published',
  restore: 'Restored',
  baseline: 'Saved original',
  discard: 'Draft discarded',
  'hub.name': 'Hub name',
  'hub.status': 'Hub status',
  pwnotify: 'Password reset email',
  guestnotify: 'Guest notifications on/off',
  notify: 'Notification sent to guests',
}
const RESTORABLE = new Set(['publish', 'restore', 'baseline'])

const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const btn = 'h-10 whitespace-nowrap rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:opacity-60'
const ghost = 'h-10 whitespace-nowrap rounded-xl border border-line2 bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60'

/**
 * The draft state of a hub's settings: what is waiting to be published, the review step, the publish and
 * discard buttons, the history with restore, and the warning when someone else saved first.
 */
export default function PublishBar({
  hubId,
  draft,
  history,
  conflict,
  getVersion,
  onResult,
}: {
  hubId: string
  draft: DraftInfo
  history: { entries: AuditEntry[]; currentReleaseId: string | null }
  conflict: boolean
  getVersion: () => number
  onResult: (r: DraftState) => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [reviewing, setReviewing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const n = draft.changes.length

  const act = (fn: () => Promise<DraftState>, after?: () => void) =>
    start(async () => {
      const r = await fn()
      onResult(r)
      if (!r.error) {
        after?.()
        router.refresh()
      }
    })

  return (
    <section aria-label="Draft and publishing" className="rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
      {conflict && (
        <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <span>Someone else saved changes after you opened this page. Reload to see their changes before you continue, so nothing is overwritten.</span>
          <button type="button" className="h-9 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700" onClick={() => window.location.reload()}>
            Reload latest
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${n ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{n ? 'Draft' : 'Published'}</span>
            <span className="text-[13px] font-semibold text-ink">{n ? `${n} change${n === 1 ? '' : 's'} not live yet` : 'Everything is live'}</span>
          </div>
          <p className="mt-1 text-xs text-ink3">
            {n
              ? `Guests still see the published version. Last saved${draft.updatedBy ? ` by ${draft.updatedBy}` : ''}. Review, then publish.`
              : 'Edits below are saved as a draft first. Nothing reaches guests until you publish.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ghost} onClick={() => setShowHistory(true)}>
            History
          </button>
          <button
            type="button"
            className={ghost}
            disabled={pending || n === 0}
            onClick={() => {
              if (window.confirm('Discard the draft? The unpublished changes are lost. What guests see does not change.')) act(() => discardDraftAction(hubId, getVersion()))
            }}
          >
            Discard draft
          </button>
          <button type="button" className={btn} disabled={pending || n === 0} onClick={() => setReviewing(true)}>
            Review changes
          </button>
        </div>
      </div>

      <Modal open={reviewing} title="Review changes" subtitle="This is what changes for guests when you publish." onClose={() => setReviewing(false)}>
        <ul className="mb-4 space-y-3">
          {draft.changes.map((c) => (
            <li key={c.path} className="rounded-xl border border-line p-3 text-[13px]">
              <div className="font-bold text-ink">{c.label}</div>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                <div className="rounded-lg bg-surface2 px-2.5 py-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-ink3">Live now</div>
                  <div className="break-words text-ink2">{c.before || '—'}</div>
                </div>
                <div className="rounded-lg bg-emerald-50 px-2.5 py-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-emerald-700">After publishing</div>
                  <div className="break-words text-ink">{c.after || '—'}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="mb-4 text-xs text-ink3">Publishing replaces these settings together, in one step. You can restore the previous version from History.</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={ghost} onClick={() => setReviewing(false)}>
            Keep editing
          </button>
          <button type="button" className={btn} disabled={pending} onClick={() => act(() => publishSettingsAction(hubId, getVersion()), () => setReviewing(false))}>
            {pending ? 'Publishing…' : `Publish ${n} change${n === 1 ? '' : 's'}`}
          </button>
        </div>
      </Modal>

      <Modal open={showHistory} title="History" subtitle="Who changed what, and when. Restoring puts an earlier published version back live." onClose={() => setShowHistory(false)}>
        {history.entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line2 px-4 py-8 text-center text-[13px] text-ink3">Nothing here yet. Publishes, restores and direct changes will be listed.</p>
        ) : (
          <ul className="space-y-2.5">
            {history.entries.map((e) => {
              const isCurrent = !!e.releaseId && e.releaseId === history.currentReleaseId
              return (
                <li key={e.id} className="rounded-xl border border-line p-3 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-ink">
                      {ACTION_LABEL[e.action] ?? e.action}
                      {isCurrent && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Live now</span>}
                    </span>
                    <span className="text-xs text-ink3">{when(e.at)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-ink3">{e.by || 'Unknown'}</div>
                  {e.summary && <p className="mt-1.5 break-words text-ink2">{e.summary}</p>}
                  {e.releaseId && RESTORABLE.has(e.action) && !isCurrent && (
                    <button
                      type="button"
                      disabled={pending}
                      className="mt-2 h-8 rounded-lg border border-line2 px-3 text-xs font-semibold text-ink hover:border-brand hover:text-brand disabled:opacity-60"
                      onClick={() => {
                        if (window.confirm(`Restore the version from ${when(e.at)}? It becomes live now, and the current draft is cleared. Sent notifications and guest sign-ups are not undone.`)) act(() => restoreReleaseAction(hubId, e.releaseId!), () => setShowHistory(false))
                      }}
                    >
                      Restore this version
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Modal>
    </section>
  )
}
