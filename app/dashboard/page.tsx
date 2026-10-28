import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import DashboardView from '@/components/dashboard/DashboardView'
import Notice from '@/components/dashboard/Notice'
import { getAuthEnv } from '@/lib/env'
import { getSession } from '@/lib/auth/session'
import HubManage from '@/components/hubs/HubManage'
import { getDashboardData, SessionExpiredError, type DashboardData } from '@/lib/data/dashboard'
import { getHubManage, type HubManageData } from '@/lib/data/hubs'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/')

  let data: DashboardData | null = null
  let hub: HubManageData | null = null
  let error: string | null = null
  try {
    // A manager's dashboard is their own hub's page; only a super admin gets the all-hubs overview.
    // Both reads are independent, so they run at the same time instead of one after the other.
    ;[data, hub] = await Promise.all([getDashboardData(session), session.role !== 'super' && session.hubId ? getHubManage(session, session.hubId) : Promise.resolve(null)])
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[dashboard]', e instanceof Error ? e.message : e)
    error = 'Could not load the dashboard data. Check your connection and try again, or sign in again.'
  }

  const env = getAuthEnv()
  const features = { notify: Boolean(env.pushWorkerUrl), upload: Boolean(env.imgbbApiKey) }

  return (
    <DashboardShell title="Dashboard" counts={data?.counts}>
      {error && <Notice>{error}</Notice>}
      {hub ? <HubManage data={hub} features={features} /> : data && <DashboardView data={data} features={features} />}
    </DashboardShell>
  )
}
