import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import Notice from '@/components/dashboard/Notice'
import SubscribersView from '@/components/subscribers/SubscribersView'
import { getSession } from '@/lib/auth/session'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { getSubscribers } from '@/lib/data/subscribers'

export const metadata = { title: 'Subscribers – iConnectHub Admin' }

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

  return (
    <DashboardShell
      title="Subscribers"
      user={{ email: session.email, name: session.name, role: session.role, hub: session.hub }}
      counts={data ? { subscribers: data.guests.length } : undefined}
    >
      {error && <Notice>{error}</Notice>}
      {data && <SubscribersView hubs={data.hubs} guests={data.guests} isSuper={session.role === 'super'} initialHub={typeof hub === 'string' ? hub : undefined} />}
    </DashboardShell>
  )
}
