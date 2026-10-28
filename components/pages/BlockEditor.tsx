'use client'

import { useId, useRef, useState } from 'react'
import RemoteImg from '@/components/ui/RemoteImg'
import { inputClass } from '@/components/ui/fields'
import { prepareMapImage, uploadPrepared } from '@/components/pathfinder/images'
import { BLOCK_LABELS, BLOCK_LIMITS as L, type Block, type ContactKind } from '@/lib/pages'

const small = 'h-8 rounded-lg border border-line2 bg-surface px-2.5 text-xs font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-40'
const lab = 'flex flex-col gap-1 text-[11px] font-semibold text-ink2'

const PLACEHOLDER: Record<ContactKind, string> = { phone: '770-498-5710', link: 'https://…', email: 'name@example.com' }

/** One block of a page, as a small form. Changes go up through onChange; the page decides when to save. */
export default function BlockEditor({ block, index, count, onChange, onMove, onRemove, disabled }: { block: Block; index: number; count: number; onChange: (b: Block) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void; disabled?: boolean }) {
  const uid = useId()
  const f = (n: string) => `${uid}-${n}`
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [upErr, setUpErr] = useState('')

  async function upload(files: FileList | null) {
    const picked = files?.[0]
    if (!picked || block.type !== 'image') return
    setBusy(true)
    setUpErr('')
    try {
      const up = await uploadPrepared(await prepareMapImage(picked))
      onChange({ ...block, url: up.url })
    } catch (e) {
      setUpErr(e instanceof Error ? e.message : 'The picture could not be uploaded.')
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface2 p-3" aria-label={`Block ${index + 1}: ${BLOCK_LABELS[block.type]}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink3">{BLOCK_LABELS[block.type]}</span>
        <div className="flex items-center gap-1.5">
          <button type="button" className={small} disabled={disabled || index === 0} onClick={() => onMove(-1)} aria-label={`Move block ${index + 1} up`}>↑</button>
          <button type="button" className={small} disabled={disabled || index === count - 1} onClick={() => onMove(1)} aria-label={`Move block ${index + 1} down`}>↓</button>
          <button type="button" className={`${small} hover:!border-red-300 hover:!text-red-600`} disabled={disabled} onClick={onRemove} aria-label={`Delete block ${index + 1}`}>Delete</button>
        </div>
      </div>

      {block.type === 'section' && (
        <div className="grid gap-2 sm:grid-cols-[1fr_170px]">
          <label className={lab} htmlFor={f('t')}>Section title<input id={f('t')} className={inputClass} maxLength={L.blockTitle} value={block.title} disabled={disabled} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="e.g. Check-In & Check-Out" /></label>
          <label className={lab} htmlFor={f('tone')}>Style
            <select id={f('tone')} className={inputClass} value={block.tone} disabled={disabled} onChange={(e) => onChange({ ...block, tone: e.target.value === 'alert' ? 'alert' : 'normal' })}>
              <option value="normal">Normal</option>
              <option value="alert">Alert (red, for emergencies)</option>
            </select>
          </label>
        </div>
      )}

      {block.type === 'rule' && (
        <div className="grid gap-2">
          <label className={lab} htmlFor={f('t')}>Title<input id={f('t')} className={inputClass} maxLength={L.blockTitle} value={block.title} disabled={disabled} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="e.g. Check-In Time" /></label>
          <label className={lab} htmlFor={f('b')}>Text
            <textarea id={f('b')} rows={3} className={`${inputClass} resize-y`} maxLength={L.rule} value={block.body} disabled={disabled} onChange={(e) => onChange({ ...block, body: e.target.value })} placeholder="e.g. **2:00 PM**. A valid ID is required." />
            <span className="font-normal text-ink3">Put **two stars** around words to make them bold. Line breaks are kept.</span>
          </label>
        </div>
      )}

      {block.type === 'contact' && (
        <div className="grid gap-2 sm:grid-cols-[1fr_130px_1.3fr]">
          <label className={lab} htmlFor={f('l')}>Label<input id={f('l')} className={inputClass} maxLength={L.label} value={block.label} disabled={disabled} onChange={(e) => onChange({ ...block, label: e.target.value })} placeholder="e.g. Call to reserve" /></label>
          <label className={lab} htmlFor={f('k')}>Type
            <select id={f('k')} className={inputClass} value={block.kind} disabled={disabled} onChange={(e) => onChange({ ...block, kind: e.target.value === 'link' ? 'link' : e.target.value === 'email' ? 'email' : 'phone' })}>
              <option value="phone">Phone</option>
              <option value="link">Link</option>
              <option value="email">Email</option>
            </select>
          </label>
          <label className={lab} htmlFor={f('v')}>{block.kind === 'phone' ? 'Phone number' : block.kind === 'email' ? 'Email address' : 'Link (https://)'}<input id={f('v')} className={inputClass} maxLength={L.url} inputMode={block.kind === 'phone' ? 'tel' : block.kind === 'email' ? 'email' : 'url'} value={block.value} disabled={disabled} onChange={(e) => onChange({ ...block, value: e.target.value })} placeholder={PLACEHOLDER[block.kind]} /></label>
        </div>
      )}

      {block.type === 'image' && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className={`${lab} min-w-0 flex-1 basis-56`} htmlFor={f('u')}>Picture link (https://)<input id={f('u')} className={inputClass} maxLength={L.url} value={block.url} disabled={disabled} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="https://…" /></label>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload a picture" tabIndex={-1} onChange={(e) => upload(e.target.files)} />
            <button type="button" className="h-11 rounded-xl border border-line2 bg-surface px-4 text-sm font-semibold text-ink hover:border-brand hover:text-brand disabled:opacity-60" disabled={disabled || busy} onClick={() => file.current?.click()}>{busy ? 'Uploading…' : 'Upload'}</button>
          </div>
          {upErr && <p role="alert" className="text-xs text-red-600">{upErr}</p>}
          {/^https:\/\//i.test(block.url) && <RemoteImg src={block.url} w={320} alt="" className="h-24 w-40 rounded-lg border border-line object-cover" />}
          <label className={lab} htmlFor={f('c')}>Caption (optional)<input id={f('c')} className={inputClass} maxLength={L.caption} value={block.caption} disabled={disabled} onChange={(e) => onChange({ ...block, caption: e.target.value })} /></label>
        </div>
      )}

      {block.type === 'card' && (
        <div className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_170px]">
            <label className={lab} htmlFor={f('t')}>Title<input id={f('t')} className={inputClass} maxLength={L.blockTitle} value={block.title} disabled={disabled} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="e.g. Full-hookup RV site" /></label>
            <label className={lab} htmlFor={f('m')}>Price or hours<input id={f('m')} className={inputClass} maxLength={L.meta} value={block.meta} disabled={disabled} onChange={(e) => onChange({ ...block, meta: e.target.value })} placeholder="e.g. $45 / night" /></label>
          </div>
          <label className={lab} htmlFor={f('x')}>Text<textarea id={f('x')} rows={2} className={`${inputClass} resize-y`} maxLength={L.card} value={block.text} disabled={disabled} onChange={(e) => onChange({ ...block, text: e.target.value })} /></label>
        </div>
      )}
    </li>
  )
}
