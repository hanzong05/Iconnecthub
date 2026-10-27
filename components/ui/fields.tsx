import type { ReactNode } from 'react'

export const inputClass =
  'min-h-11 w-full rounded-xl border border-line2 bg-surface2 px-3.5 py-2.5 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink3 focus:border-brand focus:shadow-[0_0_0_3px_rgba(26,86,219,0.10)] sm:text-sm'

/** A label above a control. The control is passed in so it can carry its own id. */
export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink2">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-ink3">{hint}</p>}
    </div>
  )
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null
  return (
    <div role={error ? 'alert' : 'status'} className={`mb-3.5 rounded-xl border px-3.5 py-2.5 text-[13px] font-medium ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
      {error ?? success}
    </div>
  )
}

export function SubmitButton({ pending, children, tone = 'blue' }: { pending: boolean; children: ReactNode; tone?: 'blue' | 'green' | 'purple' }) {
  const color = { blue: 'bg-brand hover:bg-brand-dim', green: 'bg-emerald-600 hover:bg-emerald-700', purple: 'bg-violet-600 hover:bg-violet-700' }[tone]
  return (
    <button type="submit" disabled={pending} className={`h-11 w-full rounded-xl text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${color}`}>
      {pending ? 'Saving…' : children}
    </button>
  )
}

export function HubSelect({ id, options, defaultValue }: { id: string; options: { id: string; name: string }[]; defaultValue?: string }) {
  return (
    <select id={id} name="hubId" required defaultValue={defaultValue ?? options[0]?.id} className={inputClass}>
      {options.length === 0 && <option value="">No hubs available</option>}
      {options.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name}
        </option>
      ))}
    </select>
  )
}

export function Check({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked?: boolean }) {
  return (
    <label className="mb-3.5 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface2 px-3.5 py-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
      <span>
        <span className="block text-[13px] font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-ink3">{hint}</span>}
      </span>
    </label>
  )
}
