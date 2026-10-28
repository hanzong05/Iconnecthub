'use client'

import { useRouter } from 'next/navigation'
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { changeUserPasswordAction, createUserAction, deleteUserAction, setUserActiveAction, updateUserAccessAction } from '@/app/actions/users'
import { FormMessage, inputClass, Field } from '@/components/ui/fields'
import Icon, { type IconName } from '@/components/ui/Icon'
import Modal from '@/components/ui/Modal'
import StatTile from '@/components/ui/StatTile'
import type { UserRow } from '@/lib/data/dashboard'

const PAGE_SIZE = 10
type Sort = 'name' | 'email' | 'role' | 'hub'

const initials = (u: UserRow) => {
  const src = (u.name || u.email || '?').trim()
  const parts = src.split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase() || '?'
}

const ROLE_TONE: Record<string, string> = {
  'Super Admin': 'bg-purple-600/10 text-purple-700',
  'Super Manager': 'bg-blue-600/10 text-blue-700',
  'Hub Manager': 'bg-emerald-600/10 text-emerald-700',
}
const roleTone = (r: string) => ROLE_TONE[r] ?? 'bg-slate-500/10 text-ink2'

function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total]
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', current - 1, current, current + 1, '…', total]
}

function Avatar({ u, size = 'h-10 w-10 text-xs' }: { u: UserRow; size?: string }) {
  return (
    <div aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-emerald-700 font-bold text-white ${size}`}>
      {initials(u)}
    </div>
  )
}

function Detail({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-line bg-surface2 p-3.5 ${wide ? 'col-span-2' : ''}`}>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-ink3">{label}</div>
      <div className="break-words text-sm font-semibold text-ink">{children}</div>
    </div>
  )
}

const control = 'h-11 rounded-xl border border-line2 bg-surface text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_3px_rgba(26,86,219,0.10)]'

function SelectBox({ icon, label, value, onChange, children, className = '' }: { icon: IconName; label: string; value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Icon name={icon} className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${control} w-full cursor-pointer appearance-none pl-10 pr-9 font-medium`}>
        {children}
      </select>
      <Icon name="chevron" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
    </div>
  )
}

const Dots = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
)

const ROLE_OPTIONS = [
  { id: 'manager', label: 'Hub Manager (restricted to one hub)' },
  { id: 'super_manager', label: 'Super Manager (full access, one hub)' },
  { id: 'super', label: 'Super Admin (access to all hubs)' },
]

function AddUserForm({ hubs, isSuper, ownHub, onDone }: { hubs: { id: string; name: string }[]; isSuper: boolean; ownHub: string; onDone: (msg: string) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [role, setRole] = useState('manager')
  const [hubId, setHubId] = useState(isSuper ? (hubs[0]?.id ?? '') : ownHub)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await createUserAction({ name, email, password, role, hubId })
    setBusy(false)
    if (r.success) onDone(r.success)
    else setError(r.error ?? 'Could not create the account.')
  }

  const options = isSuper ? ROLE_OPTIONS : ROLE_OPTIONS.filter((o) => o.id !== 'super')

  return (
    <form onSubmit={submit} noValidate>
      <FormMessage error={error} />
      <Field label="Full name" htmlFor="nu-name">
        <input id="nu-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah Johnson" className={inputClass} autoComplete="off" />
      </Field>
      <Field label="Email" htmlFor="nu-email">
        <input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@campground.com" className={inputClass} autoComplete="off" />
      </Field>
      <Field label="Temporary password" htmlFor="nu-pass" hint="At least 6 characters. They can change it after signing in.">
        <div className="relative">
          <input id="nu-pass" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} pr-16`} autoComplete="new-password" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-ink2 hover:bg-surface">
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </Field>
      <Field label="Role" htmlFor="nu-role">
        <select id="nu-role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </Field>
      {role !== 'super' && isSuper && (
        <Field label="Assign to hub" htmlFor="nu-hub" hint="This person will only see and post to this hub.">
          <select id="nu-hub" value={hubId} onChange={(e) => setHubId(e.target.value)} className={inputClass}>
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </Field>
      )}
      <button type="submit" disabled={busy} className="mt-1 h-11 w-full rounded-xl bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:cursor-not-allowed disabled:opacity-70">
        {busy ? 'Creating…' : 'Create account'}
      </button>
    </form>
  )
}

function EditAccessForm({ u, hubs, isSuper, ownHub, onDone }: { u: UserRow; hubs: { id: string; name: string }[]; isSuper: boolean; ownHub: string; onDone: (msg: string) => void }) {
  const [role, setRole] = useState(u.role || 'manager')
  const [hubId, setHubId] = useState(u.hubId && u.hubId !== '_global' ? u.hubId : isSuper ? (hubs[0]?.id ?? '') : ownHub)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const options = isSuper ? ROLE_OPTIONS : ROLE_OPTIONS.filter((o) => o.id !== 'super')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await updateUserAccessAction(u.id, { role, hubId })
    setBusy(false)
    if (r.success) onDone(r.success)
    else setError(r.error ?? 'Could not save.')
  }

  return (
    <form onSubmit={submit} noValidate>
      <FormMessage error={error} />
      <p className="mb-3.5 text-[13px] text-ink2">Change what <strong className="text-ink">{u.name || u.email}</strong> can see and do.</p>
      <Field label="Role" htmlFor="ea-role">
        <select id="ea-role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </Field>
      {role !== 'super' && isSuper && (
        <Field label="Assign to hub" htmlFor="ea-hub">
          <select id="ea-hub" value={hubId} onChange={(e) => setHubId(e.target.value)} className={inputClass}>
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </Field>
      )}
      <button type="submit" disabled={busy} className="mt-1 h-11 w-full rounded-xl bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:opacity-70">
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}

function PasswordForm({ u, onDone }: { u: UserRow; onDone: (msg: string) => void }) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await changeUserPasswordAction(u.id, pw)
    setBusy(false)
    if (r.success) onDone(r.success)
    else setError(r.error ?? 'Could not update the password.')
  }

  return (
    <form onSubmit={submit} noValidate>
      <FormMessage error={error} />
      <p className="mb-3.5 text-[13px] text-ink2">Set a new password for <strong className="text-ink">{u.name || u.email}</strong>. They will use it the next time they sign in.</p>
      <Field label="New password" htmlFor="pw-new" hint="At least 6 characters.">
        <div className="relative">
          <input id="pw-new" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} className={`${inputClass} pr-16`} autoComplete="new-password" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-ink2 hover:bg-surface">
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </Field>
      <button type="submit" disabled={busy} className="mt-1 h-11 w-full rounded-xl bg-brand text-sm font-semibold text-white transition-colors hover:bg-brand-dim disabled:opacity-70">
        {busy ? 'Updating…' : 'Update password'}
      </button>
    </form>
  )
}

function DeleteConfirm({ u, onDone, onCancel }: { u: UserRow; onDone: (msg: string) => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    setBusy(true)
    setError('')
    const r = await deleteUserAction(u.id)
    setBusy(false)
    if (r.success) onDone(r.success)
    else setError(r.error ?? 'Could not delete the user.')
  }

  return (
    <div>
      <FormMessage error={error} />
      <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
        <p className="mb-3 text-[13px] font-medium text-red-700">
          Delete {u.name || u.email}? This removes their account and login completely. Their email can be used again right away. This cannot be undone.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="h-10 flex-1 rounded-xl border border-line2 bg-surface text-sm font-semibold text-ink2">Cancel</button>
          <button type="button" onClick={() => void remove()} disabled={busy} className="h-10 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
            {busy ? 'Deleting…' : 'Yes, delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UsersView({ users, hubs, isSuper, ownHub, selfEmail }: { users: UserRow[]; hubs: { id: string; name: string }[]; isSuper: boolean; ownHub: string; selfEmail: string }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [dlg, setDlg] = useState<{ kind: 'access' | 'password' | 'delete'; u: UserRow } | null>(null)
  const isSelf = (u: UserRow) => u.email.toLowerCase() === selfEmail.toLowerCase()
  const canManage = (u: UserRow) => !isSelf(u) && (isSuper || u.role !== 'super')

  async function toggleActive(u: UserRow) {
    setMenu(null)
    const r = await setUserActiveAction(u.id, !u.active)
    setFlash(r.success ?? r.error ?? '')
    if (r.success) router.refresh()
  }

  function done(msg: string) {
    setDlg(null)
    setFlash(msg)
    router.refresh()
  }
  const [role, setRole] = useState('__all__')
  const [sort, setSort] = useState<Sort>('name')
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<UserRow | null>(null)
  const [menu, setMenu] = useState<{ u: UserRow; style: React.CSSProperties } | null>(null)
  const [flash, setFlash] = useState('')

  const roles = useMemo(() => [...new Set(users.map((u) => u.roleLabel))].sort(), [users])

  const rows = useMemo(() => {
    const q = deferred.trim().toLowerCase()
    const list = users.filter((u) => (role === '__all__' || u.roleLabel === role) && (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.hubName.toLowerCase().includes(q)))
    const by: Record<Sort, (a: UserRow, b: UserRow) => number> = {
      name: (a, b) => (a.name || a.email).localeCompare(b.name || b.email),
      email: (a, b) => a.email.localeCompare(b.email),
      role: (a, b) => a.roleLabel.localeCompare(b.roleLabel) || (a.name || a.email).localeCompare(b.name || b.email),
      hub: (a, b) => a.hubName.localeCompare(b.hubName) || (a.name || a.email).localeCompare(b.name || b.email),
    }
    return [...list].sort(by[sort])
  }, [users, deferred, role, sort])

  const count = (label: string) => users.filter((u) => u.roleLabel === label).length
  const hubsCovered = new Set(users.filter((u) => u.hubName !== 'All Hubs').map((u) => u.hubName)).size

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const start = (current - 1) * PAGE_SIZE
  const visible = rows.slice(start, start + PAGE_SIZE)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const opened = Date.now()
    const onScroll = () => Date.now() - opened > 200 && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 2500)
    return () => clearTimeout(t)
  }, [flash])

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, u: UserRow) {
    e.stopPropagation()
    if (menu?.u.id === u.id) return setMenu(null)
    const r = e.currentTarget.getBoundingClientRect()
    const flip = r.bottom + 260 > window.innerHeight
    setMenu({ u, style: { right: Math.max(8, window.innerWidth - r.right), ...(flip ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) } })
  }

  async function copyEmail(u: UserRow) {
    setMenu(null)
    try {
      await navigator.clipboard.writeText(u.email)
      setFlash('Email copied')
    } catch {
      setFlash('Could not copy the email')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="users" tone="green" label="Total Users" value={users.length.toLocaleString('en-US')} />
        <StatTile icon="settings" tone="purple" label="Admins & Super Managers" value={(count('Super Admin') + count('Super Manager')).toLocaleString('en-US')} />
        <StatTile icon="users" tone="blue" label="Hub Managers" value={count('Hub Manager').toLocaleString('en-US')} />
        <StatTile icon="pin" tone="orange" label="Hubs Covered" value={hubsCovered.toLocaleString('en-US')} />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
        <div className="flex flex-wrap items-center gap-2.5">
          <SelectBox icon="users" label="Role" value={role} onChange={(v) => { setRole(v); setPage(1) }} className="w-full sm:w-52">
            <option value="__all__">All Roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </SelectBox>
          <div className="relative min-w-[200px] flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
            <input type="search" aria-label="Search users" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search name, email, hub…" className={`${control} w-full pl-10 pr-3 placeholder:text-ink3`} />
          </div>
          <SelectBox icon="sort" label="Sort" value={sort} onChange={(v) => { setSort(v as Sort); setPage(1) }} className="w-full sm:w-56">
            <option value="name">Sort: Name (A–Z)</option>
            <option value="email">Sort: Email (A–Z)</option>
            <option value="role">Sort: Role</option>
            <option value="hub">Sort: Hub (A–Z)</option>
          </SelectBox>
          <button type="button" onClick={() => setAdding(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-dim">
            <span aria-hidden="true" className="text-lg leading-none">+</span> Add User
          </button>
        </div>
      </div>

      {flash && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[13px] font-medium text-emerald-700">{flash}</div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center text-[13px] text-ink3">{users.length ? 'No users match your search' : 'No users yet'}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-surface2 text-[11px] uppercase tracking-wide text-ink3">
                  <th scope="col" className="py-3 pl-5 pr-3 font-semibold">User</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Email</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Hub</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                  <th scope="col" className="py-3 pl-3 pr-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id} onClick={() => setSelected(u)} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface2">
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <Avatar u={u} />
                        <div className="min-w-0 font-semibold text-ink">{u.name || '—'}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-ink2">
                      <div className="flex items-center gap-2">
                        <Icon name="mail" className="h-3.5 w-3.5 shrink-0 text-ink3" />
                        <span className="max-w-[260px] truncate">{u.email || '—'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded-md px-2.5 py-1 text-xs font-semibold ${roleTone(u.roleLabel)}`}>{u.roleLabel}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-block max-w-[220px] truncate rounded-md bg-slate-500/10 px-2.5 py-1 align-middle text-xs font-semibold text-ink2">{u.hubName}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${u.active ? 'bg-emerald-600/10 text-emerald-700' : 'bg-slate-500/10 text-ink3'}`}>
                        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${u.active ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                        {u.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 pl-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSelected(u) }} className="h-9 whitespace-nowrap rounded-lg border border-line2 bg-surface px-3.5 text-xs font-semibold text-ink2 hover:border-emerald-600 hover:text-emerald-700">
                          View details
                        </button>
                        <button type="button" aria-label={`More actions for ${u.name || u.email}`} aria-haspopup="menu" aria-expanded={menu?.u.id === u.id} onClick={(e) => openMenu(e, u)} className="flex h-9 w-8 items-center justify-center rounded-lg text-ink2 hover:bg-surface2">
                          <Dots />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-line md:hidden">
            {visible.map((u) => (
              <li key={u.id} className="flex items-center gap-1 pr-2">
                <button type="button" onClick={() => setSelected(u)} className="flex min-w-0 flex-1 items-center gap-3 p-3.5 text-left">
                  <Avatar u={u} size="h-11 w-11 text-sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{u.name || '—'}</div>
                    <div className="truncate text-xs text-ink2">{u.email || '—'}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${roleTone(u.roleLabel)}`}>{u.roleLabel}</span>
                      <span className="truncate text-[10px] text-ink3">{u.hubName}</span>
                      {!u.active && <span className="shrink-0 rounded-md bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-ink3">Inactive</span>}
                    </div>
                  </div>
                </button>
                <button type="button" aria-label={`More actions for ${u.name || u.email}`} aria-haspopup="menu" onClick={(e) => openMenu(e, u)} className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg text-ink2 hover:bg-surface2">
                  <Dots />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
            <p className="text-[13px] text-ink2" aria-live="polite">
              Showing {(start + 1).toLocaleString('en-US')} – {Math.min(start + PAGE_SIZE, rows.length).toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} user{rows.length === 1 ? '' : 's'}
            </p>
            {pageCount > 1 && (
              <nav aria-label="Pagination" className="flex items-center gap-1.5">
                <button type="button" aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line2 text-ink2 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
                  <Icon name="left" />
                </button>
                {pageList(current, pageCount).map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-ink3">…</span>
                  ) : (
                    <button key={p} type="button" aria-label={`Page ${p}`} aria-current={p === current ? 'page' : undefined} onClick={() => setPage(p)} className={`hidden h-9 min-w-9 rounded-lg px-2 text-[13px] font-semibold sm:block ${p === current ? 'bg-emerald-700 text-white' : 'text-ink2 hover:bg-surface2'}`}>
                      {p}
                    </button>
                  ),
                )}
                <span className="px-2 text-[13px] font-semibold text-ink2 sm:hidden">{current} / {pageCount}</span>
                <button type="button" aria-label="Next page" disabled={current === pageCount} onClick={() => setPage(current + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line2 text-ink2 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
                  <Icon name="right" />
                </button>
              </nav>
            )}
          </div>
        </div>
      )}

      {menu && (
        <>
          <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setMenu(null)} className="fixed inset-0 z-40 cursor-default" />
          <div role="menu" style={menu.style} className="fixed z-50 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-[0_10px_30px_rgba(15,31,74,0.15)]">
            <button role="menuitem" type="button" onClick={() => { setSelected(menu.u); setMenu(null) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-surface2">
              <Icon name="eye" /> View details
            </button>
            <button role="menuitem" type="button" disabled={!menu.u.email} onClick={() => void copyEmail(menu.u)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-surface2 disabled:opacity-40">
              <Icon name="copy" /> Copy email
            </button>
            {canManage(menu.u) && (
              <>
                <div className="my-1 border-t border-line" />
                <button role="menuitem" type="button" onClick={() => { setDlg({ kind: 'access', u: menu.u }); setMenu(null) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-surface2">
                  <Icon name="settings" /> Edit role / hub
                </button>
                <button role="menuitem" type="button" onClick={() => { setDlg({ kind: 'password', u: menu.u }); setMenu(null) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-surface2">
                  <Icon name="eye" /> Change password
                </button>
                <button role="menuitem" type="button" onClick={() => void toggleActive(menu.u)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-ink hover:bg-surface2">
                  <Icon name="dot" /> {menu.u.active ? 'Deactivate' : 'Activate'}
                </button>
                <button role="menuitem" type="button" onClick={() => { setDlg({ kind: 'delete', u: menu.u }); setMenu(null) }} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-red-700 hover:bg-red-50">
                  <Icon name="trash" /> Delete user
                </button>
              </>
            )}
          </div>
        </>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add User">
        {adding && (
          <AddUserForm
            hubs={hubs}
            isSuper={isSuper}
            ownHub={ownHub}
            onDone={(msg) => {
              setAdding(false)
              setFlash(msg)
              router.refresh()
            }}
          />
        )}
      </Modal>

      <Modal open={dlg !== null} onClose={() => setDlg(null)} title={dlg?.kind === 'access' ? 'Edit role / hub' : dlg?.kind === 'password' ? 'Change password' : 'Delete user'}>
        {dlg?.kind === 'access' && <EditAccessForm u={dlg.u} hubs={hubs} isSuper={isSuper} ownHub={ownHub} onDone={done} />}
        {dlg?.kind === 'password' && <PasswordForm u={dlg.u} onDone={done} />}
        {dlg?.kind === 'delete' && <DeleteConfirm u={dlg.u} onDone={done} onCancel={() => setDlg(null)} />}
      </Modal>

      <Modal open={selected !== null} onClose={() => setSelected(null)} title="User Profile">
        {selected && (
          <div>
            <div className="mb-5 flex items-center gap-4 border-b border-line pb-5">
              <Avatar u={selected} size="h-[54px] w-[54px] text-base" />
              <div className="min-w-0">
                <div className="truncate text-lg font-bold text-ink">{selected.name || '—'}</div>
                <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${roleTone(selected.roleLabel)}`}>{selected.roleLabel}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Detail label="Email" wide>{selected.email || '—'}</Detail>
              <Detail label="Role">{selected.roleLabel}</Detail>
              <Detail label="Hub">{selected.hubName}</Detail>
              <Detail label="Status" wide>{selected.active ? 'Active' : 'Inactive'}</Detail>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
