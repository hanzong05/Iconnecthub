import type { ReactNode, Ref } from 'react'

/** The scrolling page area under the header. It is the only thing on the screen that scrolls. */
export default function MainContent({ children, ref }: { children: ReactNode; ref?: Ref<HTMLElement> }) {
  return (
    <main ref={ref} id="content" className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto overflow-x-hidden overscroll-contain p-3 sm:p-6">
      {children}
    </main>
  )
}
