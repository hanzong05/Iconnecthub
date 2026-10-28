import Link from 'next/link'

export const metadata = { title: 'Page not found', robots: { index: false, follow: false } }

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm rounded-[24px] border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-bold text-ink">Page not found</h1>
        <p className="mb-5 text-sm text-ink2">That page does not exist or has moved.</p>
        <Link href="/dashboard" className="inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dim">
          Go to the dashboard
        </Link>
      </div>
    </main>
  )
}
