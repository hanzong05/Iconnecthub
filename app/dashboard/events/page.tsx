import { redirect } from 'next/navigation'
import HubPageFrame from '@/components/dashboard/HubPageFrame'
import Notice from '@/components/dashboard/Notice'
import EventsView from '@/components/events/EventsView'
import { getEvents, type EventRow } from '@/lib/data/content'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { requireHubContext } from '@/lib/data/scope'
import { getAuthEnv } from '@/lib/env'

export const metadata = { title: 'Events' }

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ hub?: string | string[] }> }) {
  const { session, scope } = await requireHubContext((await searchParams).hub)
  let items: EventRow[] = []
  let error: string | null = null
  try {
    items = await getEvents(scope.hubId)
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[events]', e instanceof Error ? e.message : e)
    error = 'Could not load the events. Try again.'
  }
  const env = getAuthEnv()

  return (
    <HubPageFrame scope={scope} title="Events" counts={error ? undefined : { events: items.filter((e) => e.active).length }}>
      {error && <Notice>{error}</Notice>}
      {!error && <EventsView hub={{ id: scope.hubId, name: scope.hubName }} items={items} canNotify={Boolean(env.pushWorkerUrl)} canUpload={Boolean(env.imgbbApiKey)} isSuper={session.role === 'super'} />}
    </HubPageFrame>
  )
}
