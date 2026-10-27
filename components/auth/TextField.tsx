import type { InputHTMLAttributes, ReactNode } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
  error?: string
  /** Something shown inside the right edge of the input, such as a show/hide button. */
  trailing?: ReactNode
}

/** A labelled input with the small uppercase label and an optional error message. */
export default function TextField({ label, id, error, trailing, className = '', ...input }: Props) {
  return (
    <div className="mb-2.5 flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`min-h-11 w-full appearance-none rounded-xl border bg-surface2 px-3.5 py-3 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink3 focus:shadow-[0_0_0_3px_rgba(26,86,219,0.10)] ${
            error ? 'border-red-600 focus:border-red-600' : 'border-line2 focus:border-brand'
          } ${trailing ? 'pr-16' : ''} ${className}`}
          {...input}
        />
        {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
