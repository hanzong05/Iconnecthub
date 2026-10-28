import { redirect } from 'next/navigation'
import HubPageFrame from '@/components/dashboard/HubPageFrame'
import Notice from '@/components/dashboard/Notice'
import AnnouncementsView from '@/components/announcements/AnnouncementsView'
import { getAnnouncements, type AnnouncementRow } from '@/lib/data/content'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { requireHubContext } from '@/lib/data/scope'
import { getAuthEnv } from '@/lib/env'

export const metadata = { title: 'Announcements' }

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ hub?: string | string[] }> }) {
  const { session, scope } = await requireHubContext((await searchParams).hub)
  let items: AnnouncementRow[] = []
  let error: string | null = null
  try {
    items = await getAnnouncements(scope.hubId)
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[announcements]', e instanceof Error ? e.message : e)
    error = 'Could not load the announcements. Try again.'
  }

  return (
    <HubPageFrame scope={scope} title="Announcements" counts={error ? undefined : { announcements: items.filter((a) => a.active).length }}>
      {error && <Notice>{error}</Notice>}
      {!error && <AnnouncementsView hub={{ id: scope.hubId, name: scope.hubName }} items={items} canNotify={Boolean(getAuthEnv().pushWorkerUrl)} isSuper={session.role === 'super'} />}
    </HubPageFrame>
  )
}
