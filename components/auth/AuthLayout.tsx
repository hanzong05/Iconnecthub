import type { ReactNode } from 'react'

/** The dark-blue gradient screen with the white card in the middle. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center bg-[linear-gradient(135deg,#0f2040_0%,#1a3a6b_60%,#2a52a0_100%)] p-3 min-[401px]:p-5">
      <div className="w-full max-w-[520px] rounded-card border border-line bg-surface px-[18px] py-[22px] shadow-[0_24px_80px_rgba(0,0,0,0.5)] min-[401px]:p-7">{children}</div>
    </main>
  )
}
