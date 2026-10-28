import { notFound, redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import Notice from '@/components/dashboard/Notice'
import HubManage from '@/components/hubs/HubManage'
import { getSession } from '@/lib/auth/session'
import { getAuthEnv } from '@/lib/env'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { getHubManage, type HubManageData } from '@/lib/data/hubs'

export const metadata = { title: 'Manage Hub' }

export default async function ManageHubPage({ params }: { params: Promise<{ hubId: string }> }) {
  const { hubId } = await params
  const session = await getSession()
  if (!session) redirect('/')
  if (session.role !== 'super') redirect('/dashboard')

  let data: HubManageData | null = null
  let error: string | null = null
  try {
    data = await getHubManage(session, hubId)
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[hub]', e instanceof Error ? e.message : e)
    error = 'Could not load this hub. Try again.'
  }
  if (!data && !error) notFound()

  const env = getAuthEnv()
  return (
    <DashboardShell
      title="Manage Hub"
      viewAs={data ? { hubId: data.hub.id, hubName: data.hub.name } : undefined}
      counts={data ? { subscribers: data.totals.guests ?? undefined, announcements: data.totals.announcements, events: data.totals.events } : undefined}
      backToHubs
    >
      {error && <Notice>{error}</Notice>}
      {data && <HubManage data={data} features={{ notify: Boolean(env.pushWorkerUrl), upload: Boolean(env.imgbbApiKey) }} />}
    </DashboardShell>
  )
}
