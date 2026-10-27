'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import NavIcon from '@/components/dashboard/NavIcon'

interface Props {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}

/** A dialog built on the native <dialog>: focus stays inside it, Escape closes it, and the page behind is inert. */
export default function Modal({ open, title, subtitle, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="modal-title"
      className="m-auto max-h-[92dvh] w-[calc(100%-24px)] max-w-lg overflow-hidden rounded-[20px] border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/50"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id="modal-title" className="text-base font-bold">
                {title}
              </h2>
              {subtitle && <p className="mt-0.5 text-xs text-ink3">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink2 hover:bg-surface2">
              <NavIcon name="close" />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  )
}
