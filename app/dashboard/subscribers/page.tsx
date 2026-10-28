import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import Notice from '@/components/dashboard/Notice'
import SubscribersView from '@/components/subscribers/SubscribersView'
import { getSession } from '@/lib/auth/session'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { getSubscribers } from '@/lib/data/subscribers'

export const metadata = { title: 'Subscribers' }

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<{ hub?: string | string[] }> }) {
  const { hub } = await searchParams
  const session = await getSession()
  if (!session) redirect('/')

  let data: Awaited<ReturnType<typeof getSubscribers>> | null = null
  let error: string | null = null
  try {
    data = await getSubscribers(session)
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[subscribers]', e instanceof Error ? e.message : e)
    error = 'Could not load the subscribers. Try again.'
  }

  // A super admin who arrived from a hub is looking at that hub, so the sidebar stays the hub manager's.
  const managed = session.role === 'super' && typeof hub === 'string' ? data?.hubs.find((h) => h.id === hub) : undefined

  return (
    <DashboardShell
      title="Subscribers"
      counts={data ? { subscribers: managed ? data.guests.filter((g) => g.hubId === managed.id).length : data.guests.length } : undefined}
      viewAs={managed ? { hubId: managed.id, hubName: managed.name } : undefined}
      backToHubs={Boolean(managed)}
    >
      {error && <Notice>{error}</Notice>}
      {data && <SubscribersView hubs={data.hubs} guests={data.guests} isSuper={session.role === 'super'} initialHub={typeof hub === 'string' ? hub : undefined} />}
    </DashboardShell>
  )
}
