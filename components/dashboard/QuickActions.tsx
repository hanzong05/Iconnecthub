'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { DashboardData } from '@/lib/data/dashboard'
import Modal from '@/components/ui/Modal'
import EventForm from './forms/EventForm'
import NewsletterForm from './forms/NewsletterForm'
import QuickPostForm from './forms/QuickPostForm'
import ListCard from './ListCard'
import NavIcon from './NavIcon'

const CATEGORY: Record<string, string> = {
  info: 'bg-blue-50 text-brand',
  warning: 'bg-cyan-50 text-cyan-600',
  alert: 'bg-red-50 text-red-600',
  success: 'bg-green-50 text-emerald-600',
}
const ITEM = 'flex min-w-0 items-center gap-2.5 rounded-[10px] bg-surface2 px-3 py-2.5 transition-colors hover:bg-[#e8f0fe]'

type Open = 'post' | 'event' | 'newsletter' | null

interface Props {
  data: Pick<DashboardData, 'announcements' | 'events' | 'hubs' | 'hubOptions'>
  canNotify: boolean
  canUpload: boolean
}

/** The three quick-action cards and the forms their buttons open. */
export default function QuickActions({ data, canNotify, canUpload }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState<Open>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const close = () => setOpen(null)
  const done = (message: string) => () => {
    setToast(message)
    close()
    router.refresh()
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-3 min-[900px]:gap-4">
        <ListCard title="Announcements" icon="announcements" tone="blue" count={data.announcements.length} empty="No announcements yet" action="Quick Post" onAction={() => setOpen('post')}>
          {data.announcements.map((a) => (
            <div key={a.id} className={ITEM}>
              <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CATEGORY[a.type] ?? CATEGORY.info}`}>
                <NavIcon name="announcements" className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-ink">{a.title}</div>
                <div className="truncate text-[10px] font-medium text-brand">{a.hubName}</div>
              </div>
            </div>
          ))}
        </ListCard>

        <ListCard title="Events" icon="events" tone="green" count={data.events.length} empty="No events yet" action="Add Event" onAction={() => setOpen('event')}>
          {data.events.map((e) => (
            <div key={e.id} className={ITEM}>
              {e.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.imageUrl} alt="" className="h-[38px] w-[38px] shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-ink">{e.title}</div>
                <div className="truncate text-[11px] font-medium text-ink3">{e.detail}</div>
                <div className="truncate text-[10px] text-brand">{e.hubName}</div>
              </div>
            </div>
          ))}
        </ListCard>

        <ListCard title="Newsletter" icon="newsletter" tone="purple" count={data.hubs.length} empty="No hubs yet" action="Manage Newsletter" onAction={() => setOpen('newsletter')}>
          {data.hubs.slice(0, 3).map((h) => (
            <div key={h.id} className={`${ITEM} flex-col items-stretch gap-0`}>
              <div className="truncate text-xs font-semibold text-ink">{h.name}</div>
              <div className="truncate text-[11px] font-medium text-ink3">{h.location ?? h.id}</div>
            </div>
          ))}
        </ListCard>
      </div>

      <Modal open={open === 'post'} onClose={close} title="Quick Post" subtitle="Publish an announcement to a hub right away.">
        <QuickPostForm hubs={data.hubOptions} canNotify={canNotify} onDone={done('Announcement published.')} />
      </Modal>
      <Modal open={open === 'event'} onClose={close} title="Add Event" subtitle="Create an event guests will see on the hub.">
        <EventForm hubs={data.hubOptions} canNotify={canNotify} canUpload={canUpload} onDone={done('Event added.')} />
      </Modal>
      <Modal open={open === 'newsletter'} onClose={close} title="Newsletter Image" subtitle="Upload or replace the newsletter image.">
        <NewsletterForm hubs={data.hubOptions} canUpload={canUpload} onChanged={() => router.refresh()} />
      </Modal>

      {toast && (
        <div role="status" className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-[13px] font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </>
  )
}
