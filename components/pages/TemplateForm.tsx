'use client'

import { useRef, useState } from 'react'
import RemoteImg from '@/components/ui/RemoteImg'
import { inputClass } from '@/components/ui/fields'
import { prepareMapImage, uploadPrepared } from '@/components/pathfinder/images'
import type { Slot, SlotValues, Template } from '@/lib/template'

const ghost = 'h-9 rounded-xl border border-line2 bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60'
const lab = 'flex flex-col gap-1 text-[11px] font-semibold text-ink2'
const card = 'rounded-2xl border border-line bg-surface p-4 shadow-[0_2px_8px_rgba(15,31,74,0.04)]'
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const s = (v: unknown) => (typeof v === 'string' ? v : '')
const rowsOf = (v: unknown): Record<string, unknown>[] => (Array.isArray(rec(v).rows) ? (rec(v).rows as unknown[]).map(rec) : [])

/** A picture field: paste an https link or upload a file. */
function Picture({ label, url, onChange, onError }: { label: string; url: string; onChange: (u: string) => void; onError: (m: string) => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function pick(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setBusy(true)
    try {
      onChange((await uploadPrepared(await prepareMapImage(f))).url)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'The picture could not be uploaded.')
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className={`${lab} min-w-0 flex-1 basis-56`}>{label} (https:// link)<input className={inputClass} maxLength={500} value={url} placeholder="https://…" onChange={(e) => onChange(e.target.value)} /></label>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={`Upload ${label}`} tabIndex={-1} onChange={(e) => pick(e.target.files)} />
        <button type="button" className="h-11 rounded-xl border border-line2 bg-surface px-4 text-sm font-semibold text-ink hover:border-brand hover:text-brand disabled:opacity-60" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'Uploading…' : 'Upload'}</button>
        {url && <button type="button" className="h-11 rounded-xl px-3 text-sm font-semibold text-red-600 hover:underline" onClick={() => onChange('')}>Remove</button>}
      </div>
      {/^https:\/\//i.test(url) && <RemoteImg src={url} w={400} alt="" className="h-20 w-40 rounded-lg border border-line object-cover" />}
    </div>
  )
}

/**
 * The form a manager fills in for a page that has a layout: one field group for each component the Super Admin placed.
 * The manager cannot add, remove or move components; lists and galleries only take as many rows as the layout allows.
 */
export default function TemplateForm({ template, values, onChange, onError }: { template: Template; values: SlotValues; onChange: (v: SlotValues) => void; onError: (m: string) => void }) {
  const set = (id: string, v: Record<string, unknown>) => onChange({ ...values, [id]: v })
  const field = (slot: Slot) => {
    const v = rec(values[slot.id])
    const up = (patch: Record<string, unknown>) => set(slot.id, { ...v, ...patch })
    const req = slot.required ? <span className="ml-1 text-red-600" aria-label="required">*</span> : null
    switch (slot.type) {
      case 'section':
        return <h3 className="text-sm font-bold text-ink">{slot.label}</h3>
      case 'header':
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={lab}><span>{slot.label}{req}</span><input className={inputClass} maxLength={80} value={s(v.title)} onChange={(e) => up({ title: e.target.value })} /></label>
            <label className={lab}>Subtitle<input className={inputClass} maxLength={160} value={s(v.subtitle)} placeholder="One short line under the title" onChange={(e) => up({ subtitle: e.target.value })} /></label>
          </div>
        )
      case 'hero':
        return <Picture label={slot.label + (slot.required ? ' *' : '')} url={s(v.url)} onChange={(url) => up({ url })} onError={onError} />
      case 'description':
        return (
          <div className="flex flex-col gap-3">
            <label className={lab}><span>{slot.label}{req} (heading)</span><input className={inputClass} maxLength={120} value={s(v.title)} onChange={(e) => up({ title: e.target.value })} /></label>
            <label className={lab}>Text<textarea className={`${inputClass} min-h-24 py-2`} maxLength={1500} value={s(v.body)} onChange={(e) => up({ body: e.target.value })} /></label>
          </div>
        )
      case 'call':
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={lab}>Label<input className={inputClass} maxLength={80} value={s(v.label)} placeholder={slot.label} onChange={(e) => up({ label: e.target.value })} /></label>
            <label className={lab}><span>{slot.label}{req} (phone number)</span><input className={inputClass} maxLength={30} inputMode="tel" value={s(v.value)} placeholder="770-498-5710" onChange={(e) => up({ value: e.target.value })} /></label>
          </div>
        )
      case 'button':
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={lab}>Button text<input className={inputClass} maxLength={80} value={s(v.label)} placeholder={slot.label} onChange={(e) => up({ label: e.target.value })} /></label>
            <label className={lab}><span>{slot.label}{req} (https:// link)</span><input className={inputClass} maxLength={500} value={s(v.value)} placeholder="https://…" onChange={(e) => up({ value: e.target.value })} /></label>
          </div>
        )
      case 'gallery':
      case 'list': {
        const rows = rowsOf(v)
        const setRows = (next: Record<string, unknown>[]) => up({ rows: next })
        const patchRow = (i: number, p: Record<string, unknown>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
        const blankRow = (): Record<string, unknown> => (slot.type === 'gallery' ? { url: '', caption: '' } : slot.rowKind === 'contact' ? { label: '', kind: 'phone', value: '' } : slot.rowKind === 'item' ? { title: '', text: '', meta: '' } : { title: '', body: '' })
        return (
          <div className="flex flex-col gap-2.5">
            {rows.length === 0 && <p className="rounded-xl border border-dashed border-line2 px-3 py-4 text-center text-xs text-ink3">Nothing here yet.</p>}
            {rows.map((r, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-2.5">
                {slot.type === 'gallery' ? (
                  <>
                    <Picture label={`Picture ${i + 1}`} url={s(r.url)} onChange={(url) => patchRow(i, { url })} onError={onError} />
                    <label className={lab}>Caption<input className={inputClass} maxLength={160} value={s(r.caption)} onChange={(e) => patchRow(i, { caption: e.target.value })} /></label>
                  </>
                ) : slot.rowKind === 'contact' ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
                    <label className={lab}>Name<input className={inputClass} maxLength={80} value={s(r.label)} onChange={(e) => patchRow(i, { label: e.target.value })} /></label>
                    <label className={lab}>Type
                      <select className={inputClass} value={s(r.kind) || 'phone'} onChange={(e) => patchRow(i, { kind: e.target.value })}>
                        <option value="phone">Phone</option><option value="link">Link</option><option value="email">Email</option>
                      </select>
                    </label>
                    <label className={lab}>{s(r.kind) === 'link' ? 'https:// link' : s(r.kind) === 'email' ? 'Email address' : 'Phone number'}<input className={inputClass} maxLength={500} value={s(r.value)} onChange={(e) => patchRow(i, { value: e.target.value })} /></label>
                  </div>
                ) : slot.rowKind === 'item' ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className={lab}>Title<input className={inputClass} maxLength={120} value={s(r.title)} onChange={(e) => patchRow(i, { title: e.target.value })} /></label>
                    <label className={lab}>Price or hours<input className={inputClass} maxLength={80} value={s(r.meta)} onChange={(e) => patchRow(i, { meta: e.target.value })} /></label>
                    <label className={`${lab} sm:col-span-2`}>Text<textarea className={`${inputClass} min-h-16 py-2`} maxLength={600} value={s(r.text)} onChange={(e) => patchRow(i, { text: e.target.value })} /></label>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <label className={lab}>{slot.rowKind === 'channel' ? 'Channel' : 'Title'}<input className={inputClass} maxLength={120} value={s(r.title)} onChange={(e) => patchRow(i, { title: e.target.value })} /></label>
                    <label className={lab}>{slot.rowKind === 'channel' ? 'Detail' : 'Text'}<textarea className={`${inputClass} min-h-16 py-2`} maxLength={1500} value={s(r.body)} onChange={(e) => patchRow(i, { body: e.target.value })} /></label>
                  </div>
                )}
                <div className="flex justify-end gap-1.5">
                  <button type="button" aria-label={`Move row ${i + 1} up in ${slot.label}`} className="h-8 w-8 rounded-lg border border-line2 bg-surface text-sm hover:border-brand disabled:opacity-40" disabled={i === 0} onClick={() => { const n = [...rows]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setRows(n) }}>↑</button>
                  <button type="button" aria-label={`Move row ${i + 1} down in ${slot.label}`} className="h-8 w-8 rounded-lg border border-line2 bg-surface text-sm hover:border-brand disabled:opacity-40" disabled={i === rows.length - 1} onClick={() => { const n = [...rows]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setRows(n) }}>↓</button>
                  <button type="button" aria-label={`Delete row ${i + 1} in ${slot.label}`} className="h-8 w-8 rounded-lg border border-line2 bg-surface text-sm text-red-600 hover:border-red-300" onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
                </div>
              </div>
            ))}
            <button type="button" className={`${ghost} self-start`} disabled={rows.length >= slot.maxRows} onClick={() => setRows([...rows, blankRow()])}>+ Add {slot.type === 'gallery' ? 'picture' : 'row'} ({rows.length}/{slot.maxRows})</button>
          </div>
        )
      }
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {template.slots.map((slot) => (
        <section key={slot.id} className={card} aria-label={slot.label}>
          {slot.type !== 'section' && slot.type !== 'header' && slot.type !== 'description' && slot.type !== 'call' && slot.type !== 'button' && slot.type !== 'hero' && (
            <h3 className="mb-3 text-sm font-bold text-ink">{slot.label}{slot.required && <span className="ml-1 text-red-600" aria-label="required">*</span>}</h3>
          )}
          {field(slot)}
        </section>
      ))}
    </div>
  )
}
