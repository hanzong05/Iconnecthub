import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import DashboardView from '@/components/dashboard/DashboardView'
import Notice from '@/components/dashboard/Notice'
import { getAuthEnv } from '@/lib/env'
import { getSession } from '@/lib/auth/session'
import { getDashboardData, SessionExpiredError, type DashboardData } from '@/lib/data/dashboard'

export const metadata = { title: 'Dashboard – iConnectHub Admin' }

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/')

  let data: DashboardData | null = null
  let error: string | null = null
  try {
    data = await getDashboardData(session)
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[dashboard]', e instanceof Error ? e.message : e)
    error = 'Could not load the dashboard data. Check your connection and try again, or sign in again.'
  }

  const env = getAuthEnv()
  const features = { notify: Boolean(env.pushWorkerUrl), upload: Boolean(env.imgbbApiKey) }

  return (
    <DashboardShell title="Dashboard" user={{ email: session.email, name: session.name, role: session.role, hub: session.hub }} counts={data?.counts}>
      {error && <Notice>{error}</Notice>}
      {data && <DashboardView data={data} features={features} />}
    </DashboardShell>
  )
}
