'use client'

import { useState } from 'react'
import { inputClass } from '@/components/ui/fields'
import { ROW_KINDS, SLOT_TYPES, STARTER_TEMPLATES, TEMPLATE_LIMITS, newSlotId, type RowKind, type Slot, type SlotType, type Template } from '@/lib/template'

const ghost = 'h-9 rounded-xl border border-line2 bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60'
const small = 'h-8 w-8 rounded-lg border border-line2 bg-surface text-sm font-semibold text-ink hover:border-brand disabled:opacity-40'
const lab = 'flex flex-col gap-1 text-[11px] font-semibold text-ink2'
const typeLabel = (t: SlotType) => SLOT_TYPES.find((s) => s.id === t)?.label ?? t
const MANY: SlotType[] = ['list', 'gallery']

/** Where a new component starts: a sensible name for its type. */
const fresh = (type: SlotType): Slot => ({ id: newSlotId(), type, label: type === 'section' ? 'Heading' : typeLabel(type), required: false, maxRows: 10, rowKind: 'rule' })

/**
 * The Super Admin lays out a details page here: pick a starter, then add, move (drag or the arrow buttons), rename
 * and mark components as required. Managers never see this; they fill in the components in Pages.
 */
export default function TemplateEditor({ template, onChange }: { template: Template | null; onChange: (t: Template | null) => void }) {
  const [drag, setDrag] = useState<number | null>(null)

  if (!template) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-line2 bg-white p-3">
        <p className="text-xs text-ink2">Choose a layout for this page. Managers fill it in on <strong>Pages</strong>; they cannot change the layout.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {STARTER_TEMPLATES.map((s) => (
            <button key={s.id} type="button" onClick={() => onChange({ slots: s.template.slots.map((x) => ({ ...x, id: newSlotId() })) })} className="flex flex-col gap-0.5 rounded-xl border border-line2 bg-surface p-2.5 text-left text-xs transition-colors hover:border-brand">
              <span className="font-semibold text-ink">{s.label}</span>
              <span className="text-ink3">{s.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-ink3">Or skip this: with no layout, managers add their own blocks freely.</p>
      </div>
    )
  }

  const slots = template.slots
  const put = (next: Slot[]) => onChange({ slots: next })
  const patch = (i: number, p: Partial<Slot>) => put(slots.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= slots.length || from === to) return
    const next = [...slots]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    put(next)
  }
  const has = (t: SlotType) => slots.some((s) => s.type === t)
  const addable = SLOT_TYPES.filter((t) => !((t.id === 'header' || t.id === 'hero') && has(t.id)))

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line2 bg-white p-3" role="group" aria-label="Page layout">
      <ol className="flex flex-col gap-2">
        {slots.map((s, i) => (
          <li
            key={s.id}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (drag !== null) move(drag, i); setDrag(null) }}
            onDragEnd={() => setDrag(null)}
            className={`flex flex-col gap-2 rounded-xl border bg-surface p-2.5 ${drag === i ? 'border-brand opacity-60' : 'border-line'}`}
          >
            <div className="flex items-center gap-2">
              <span aria-hidden className="cursor-grab select-none text-ink3" title="Drag to move">⋮⋮</span>
              <span className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] font-semibold text-ink2">{typeLabel(s.type)}</span>
              <span className="flex-1" />
              <button type="button" aria-label={`Move ${s.label} up`} className={small} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
              <button type="button" aria-label={`Move ${s.label} down`} className={small} disabled={i === slots.length - 1} onClick={() => move(i, i + 1)}>↓</button>
              <button type="button" aria-label={`Remove ${s.label}`} className={`${small} text-red-600`} onClick={() => put(slots.filter((_, j) => j !== i))}>×</button>
            </div>
            <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
              <label className={lab}>{s.type === 'section' ? 'Heading guests see' : 'Field name managers see'}
                <input className={inputClass} value={s.label} maxLength={TEMPLATE_LIMITS.label} onChange={(e) => patch(i, { label: e.target.value })} />
              </label>
              {s.type === 'list' && (
                <label className={lab}>Rows are
                  <select className={inputClass} value={s.rowKind} onChange={(e) => patch(i, { rowKind: e.target.value as RowKind })}>
                    {ROW_KINDS.map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}
                  </select>
                </label>
              )}
              {MANY.includes(s.type) && (
                <label className={lab}>Up to
                  <input type="number" min={1} max={TEMPLATE_LIMITS.maxRows} className={`${inputClass} w-20`} value={s.maxRows} onChange={(e) => patch(i, { maxRows: Number(e.target.value) })} />
                </label>
              )}
              {s.type !== 'section' && (
                <label className="flex h-10 items-center gap-2 text-xs font-semibold text-ink2"><input type="checkbox" checked={s.required} onChange={(e) => patch(i, { required: e.target.checked })} />Required</label>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${lab} min-w-48`}>
          <span className="sr-only">Add a component</span>
          <select className={inputClass} value="" disabled={slots.length >= TEMPLATE_LIMITS.slots} onChange={(e) => { if (e.target.value) put([...slots, fresh(e.target.value as SlotType)]) }}>
            <option value="">+ Add a component…</option>
            {addable.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
          </select>
        </label>
        <button type="button" className={ghost} onClick={() => { if (window.confirm('Remove this layout? Managers will go back to adding blocks freely.')) onChange(null) }}>Change layout</button>
      </div>
      {slots.length === 0 && <p className="text-xs text-ink3">Add at least one component.</p>}
    </div>
  )
}
