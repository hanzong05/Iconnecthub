import type { ButtonHTMLAttributes } from 'react'

/** The full-width blue action button. */
export default function PrimaryButton({ className = '', children, ...button }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`mt-1.5 w-full disabled:cursor-not-allowed disabled:opacity-70 rounded-xl bg-brand p-[13px] text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-brand-dim active:scale-[0.98] ${className}`}
      {...button}
    >
      {children}
    </button>
  )
}
