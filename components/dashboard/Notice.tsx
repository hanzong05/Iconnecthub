/** A plain, readable message box (for errors and empty states). */
export default function Notice({ children, tone = 'error' }: { children: React.ReactNode; tone?: 'error' | 'info' }) {
  const style = tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-line bg-surface text-ink2'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-2xl border px-4 py-3 text-[13px] font-medium ${style}`}>
      {children}
    </div>
  )
}
