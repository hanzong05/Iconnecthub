import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import Notice from '@/components/dashboard/Notice'
import CampgroundsView from '@/components/pathfinder/CampgroundsView'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { PathFinderAccessError, getAllMaps } from '@/lib/data/pathfinder'
import { requireSuperHubContext } from '@/lib/data/scope'

export const metadata = { title: 'Maps' }

/** Every hub's map in one place. Super Admin only. Each hub has one map; Add map offers the hubs that have none. */
export default async function CampgroundsPage() {
  await requireSuperHubContext(undefined)
  let data: Awaited<ReturnType<typeof getAllMaps>> | null = null
  let error: string | null = null
  try {
    data = await getAllMaps()
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    if (e instanceof PathFinderAccessError) error = 'Firebase is refusing access to Path Finder data. Publish the database rules in docs/pathfinder-migration.md (hubs/$hubId/pathfinder), then reload.'
    else {
      console.error('[campgrounds]', e instanceof Error ? e.message : e)
      error = 'Could not load the maps. Try again.'
    }
  }
  return (
    <DashboardShell title="Maps">
      {error && <Notice>{error}</Notice>}
      {data && <CampgroundsView maps={data.maps} hubsWithoutMap={data.hubsWithoutMap} />}
    </DashboardShell>
  )
}
