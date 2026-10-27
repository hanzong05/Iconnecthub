import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import Notice from '@/components/dashboard/Notice'
import HubsView from '@/components/hubs/HubsView'
import { getSession } from '@/lib/auth/session'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { getHubCards, type HubCard } from '@/lib/data/hubs'

export const metadata = { title: 'Hubs – iConnectHub Admin' }

export default async function HubsPage() {
  const session = await getSession()
  if (!session) redirect('/')
  if (session.role !== 'super') redirect('/dashboard')

  let hubs: HubCard[] = []
  let error: string | null = null
  try {
    hubs = await getHubCards(session)
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[hubs]', e instanceof Error ? e.message : e)
    error = 'Could not load the hubs. Try again.'
  }

  return (
    <DashboardShell title="Hubs" user={{ email: session.email, name: session.name, role: session.role, hub: session.hub }} counts={{ hubs: hubs.length }}>
      {error && <Notice>{error}</Notice>}
      {!error && <HubsView hubs={hubs} />}
    </DashboardShell>
  )
}
