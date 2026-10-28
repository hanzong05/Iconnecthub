'use client'

/** A page failed while rendering: say so plainly and let the person retry without losing their sign-in. */
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm rounded-[24px] border border-line bg-surface p-8 text-center shadow-sm" role="alert">
        <h1 className="mb-2 text-lg font-bold text-ink">Something went wrong</h1>
        <p className="mb-5 text-sm text-ink2">This page could not be loaded. Check your connection and try again.</p>
        <button type="button" onClick={reset} className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dim">
          Try again
        </button>
      </div>
    </div>
  )
}
