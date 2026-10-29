'use client'

import { useState } from 'react'
import { inputClass } from '@/components/ui/fields'
import { MENU_ICONS, MENU_KINDS, MENU_LIMITS, newMenuId, menuIcon, parseMenuItems, type MenuItem, type MenuKind, type MenuRow } from '@/lib/menu'
import { SettingsInvalid } from '@/lib/settings-validate'
import TemplateEditor from './TemplateEditor'
import type { VisGroup } from '@/lib/settings-catalog'

const btn = 'h-9 whitespace-nowrap rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:opacity-60'
const ghost = 'h-9 rounded-xl border border-line2 bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60'
const lab = 'flex flex-col gap-1 text-[11px] font-semibold text-ink2'

/** The drawing of one of the menu icons (static, trusted shapes from lib/menu). */
export function MenuGlyph({ id, size = 18 }: { id: string; size?: number }) {
  const icon = menuIcon(id)
  return <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: icon.svg }} />
}

const blank = (): MenuItem => ({ id: newMenuId(), label: '', icon: 'info', kind: 'page', url: '', rows: [], shown: true })

/**
 * The Super Admin builds the guest More menu here: add an item, name it, pick its icon and group, and choose what happens on tap.
 * Managers never see this; they fill in the content (Pages). Saving sends the whole list and the groups to the server, which checks it again.
 */
export default function MenuBuilder({ items, groups, onSave, disabled }: { items: MenuItem[]; groups: VisGroup[]; onSave: (items: MenuItem[], groups: VisGroup[]) => Promise<boolean>; disabled?: boolean }) {
  const [editing, setEditing] = useState<{ item: MenuItem; group: string; isNew: boolean } | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const groupOf = (id: string) => groups.find((g) => g.items.includes(id))?.id ?? ''

  const placeIn = (id: string, to: string): VisGroup[] => groups.map((g) => ({ ...g, items: g.id === to ? [...g.items.filter((x) => x !== id), id] : g.items.filter((x) => x !== id) }))

  async function save() {
    if (!editing) return
    const next = editing.isNew ? [...items, editing.item] : items.map((m) => (m.id === editing.item.id ? editing.item : m))
    try {
      parseMenuItems(next)
    } catch (e) {
      setError(e instanceof SettingsInvalid ? e.message : 'Check the details and try again.')
      return
    }
    setError('')
    setSaving(true)
    const ok = await onSave(next, placeIn(editing.item.id, editing.group))
    setSaving(false)
    if (ok) setEditing(null)
  }
  async function remove(m: MenuItem) {
    if (!window.confirm(`Delete "${m.label}" from the menu? Managers' content for it stays saved but guests no longer see it.`)) return
    setSaving(true)
    await onSave(items.filter((x) => x.id !== m.id), groups.map((g) => ({ ...g, items: g.items.filter((x) => x !== m.id) })))
    setSaving(false)
  }

  const set = (patch: Partial<MenuItem>) => setEditing((e) => (e ? { ...e, item: { ...e.item, ...patch } } : e))
  const busy = disabled || saving
  /** The details pages a sheet row can open (any details-page item of this hub). */
  const pages = items.filter((m) => m.kind === 'page' && m.id !== editing?.item.id)

  return (
    <div>
      {items.length === 0 && !editing && <p className="rounded-xl border border-dashed border-line2 px-3 py-6 text-center text-xs text-ink3">No custom menu items yet. Add one for something this hub has that the standard list does not (RV Sites, Cabins, a partner link…).</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((m) => {
          const ic = menuIcon(m.icon)
          const g = groups.find((x) => x.id === groupOf(m.id))
          return (
            <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: ic.bg, color: ic.color }}><MenuGlyph id={m.icon} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">{m.label}{!m.shown && <span className="ml-1.5 text-[11px] font-medium text-ink3">(hidden)</span>}</span>
                <span className="block truncate text-[11px] text-ink3">{MENU_KINDS.find((k) => k.id === m.kind)?.label}{m.kind === 'sheet' ? `, ${m.rows.length} row${m.rows.length === 1 ? '' : 's'}` : ''} · {g ? g.label : 'Not in a group'}</span>
              </span>
              {m.kind === 'link' && /^https:\/\//i.test(m.url) && (
                <a href={m.url} target="_blank" rel="noopener noreferrer" title={m.url} aria-label={`Open the link for ${m.label} in a new tab`} className="inline-flex h-8 items-center rounded-lg border border-line2 bg-surface px-2.5 text-xs font-semibold text-ink hover:border-brand">Open ↗</a>
              )}
              <button className="h-8 rounded-lg border border-line2 bg-surface px-2.5 text-xs font-semibold text-ink hover:border-brand disabled:opacity-50" disabled={busy || !!editing} onClick={() => { setError(''); setEditing({ item: { ...m, rows: m.rows.map((r) => ({ ...r })) }, group: groupOf(m.id), isNew: false }) }}>Edit</button>
              <button aria-label={`Delete ${m.label}`} className="h-8 rounded-lg border border-line2 bg-surface px-2.5 text-xs font-semibold text-red-600 hover:border-red-300 disabled:opacity-50" disabled={busy || !!editing} onClick={() => remove(m)}>×</button>
            </li>
          )
        })}
      </ul>

      {!editing && (
        <button className={`${ghost} mt-3`} disabled={busy || items.length >= MENU_LIMITS.items} onClick={() => { setError(''); setEditing({ item: blank(), group: groups[0]?.id ?? '', isNew: true }) }}>+ Add menu item</button>
      )}

      {editing && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-brand/40 bg-surface2 p-3.5" role="group" aria-label={editing.isNew ? 'New menu item' : `Edit ${editing.item.label}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={lab}>Name guests see<input className={inputClass} value={editing.item.label} maxLength={MENU_LIMITS.label} placeholder="For example RV Sites" onChange={(e) => set({ label: e.target.value })} /></label>
            <label className={lab}>Show in group
              <select className={inputClass} value={editing.group} onChange={(e) => setEditing({ ...editing, group: e.target.value })}>
                <option value="">Not in a group (hidden for now)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="mb-1 text-[11px] font-semibold text-ink2">Icon</legend>
            <div className="flex flex-wrap gap-1.5">
              {MENU_ICONS.map((i) => (
                <button key={i.id} type="button" aria-label={i.label} aria-pressed={editing.item.icon === i.id} title={i.label} onClick={() => set({ icon: i.id })} className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${editing.item.icon === i.id ? 'border-brand ring-2 ring-brand/30' : 'border-line2 hover:border-brand'}`} style={{ background: i.bg, color: i.color }}>
                  <MenuGlyph id={i.id} />
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-[11px] font-semibold text-ink2">What happens when a guest taps it</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {MENU_KINDS.map((k) => (
                <label key={k.id} className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border p-2.5 text-xs transition-colors ${editing.item.kind === k.id ? 'border-brand bg-white' : 'border-line2 bg-surface hover:border-brand'}`}>
                  <span className="flex items-center gap-2 font-semibold text-ink"><input type="radio" name="menu-kind" checked={editing.item.kind === k.id} onChange={() => set({ kind: k.id as MenuKind })} />{k.label}</span>
                  <span className="text-ink3">{k.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {editing.item.kind === 'link' && (
            <label className={lab}>Address (https://)<input className={inputClass} value={editing.item.url} maxLength={500} placeholder="https://" onChange={(e) => set({ url: e.target.value })} /></label>
          )}
          {editing.item.kind === 'page' && (
            <div className="flex flex-col gap-2">
              <p className="rounded-lg bg-white px-3 py-2 text-xs text-ink2">After you publish this, a page with this name appears in <strong>Pages</strong>. Managers fill in the content there.</p>
              <TemplateEditor template={editing.item.template ?? null} onChange={(template) => set({ template })} />
            </div>
          )}
          {editing.item.kind === 'sheet' && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-ink2">Rows in the list (each opens an address or a details page)</span>
              {editing.item.rows.map((r, i) => {
                const setRow = (patch: Partial<MenuRow>) => set({ rows: editing.item.rows.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
                const opensPage = r.page !== undefined
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input aria-label={`Row ${i + 1} name`} className={`${inputClass} min-w-0 flex-1 basis-40`} value={r.label} maxLength={MENU_LIMITS.rowLabel} placeholder="Name" onChange={(e) => setRow({ label: e.target.value })} />
                    <select aria-label={`Row ${i + 1} opens`} className={`${inputClass} w-36`} value={opensPage ? 'page' : 'link'} onChange={(e) => (e.target.value === 'page' ? setRow({ url: '', page: pages[0]?.id ?? '' }) : set({ rows: editing.item.rows.map((x, j) => (j === i ? { label: x.label, url: '' } : x)) }))}>
                      <option value="link">An address</option>
                      <option value="page" disabled={pages.length === 0}>A details page</option>
                    </select>
                    {opensPage ? (
                      <select aria-label={`Row ${i + 1} page`} className={`${inputClass} min-w-0 flex-[2] basis-56`} value={r.page} onChange={(e) => setRow({ page: e.target.value })}>
                        {pages.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                      </select>
                    ) : (
                      <input aria-label={`Row ${i + 1} address`} className={`${inputClass} min-w-0 flex-[2] basis-56`} value={r.url} maxLength={500} placeholder="https://" onChange={(e) => setRow({ url: e.target.value })} />
                    )}
                    <button type="button" aria-label={`Remove row ${i + 1}`} className="h-9 w-9 rounded-lg border border-line2 bg-surface text-red-600 hover:border-red-300" onClick={() => set({ rows: editing.item.rows.filter((_, j) => j !== i) })}>×</button>
                  </div>
                )
              })}
              <button type="button" className={`${ghost} self-start`} disabled={editing.item.rows.length >= MENU_LIMITS.rows} onClick={() => set({ rows: [...editing.item.rows, { label: '', url: '' }] })}>+ Add row</button>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs font-semibold text-ink2"><input type="checkbox" checked={editing.item.shown} onChange={(e) => set({ shown: e.target.checked })} />Show to guests</label>

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button className={btn} disabled={busy} onClick={save}>{saving ? 'Saving…' : editing.isNew ? 'Add to menu' : 'Save item'}</button>
            <button className={ghost} disabled={saving} onClick={() => { setEditing(null); setError('') }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
