import { redirect } from 'next/navigation'
import HubPageFrame from '@/components/dashboard/HubPageFrame'
import Notice from '@/components/dashboard/Notice'
import MapPicker from '@/components/pathfinder/MapPicker'
import { CalibrationLoader } from '@/components/pathfinder/MapStudioLoader'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { PathFinderAccessError, getCampgroundBundle, getCampgrounds, getHubChoices } from '@/lib/data/pathfinder'
import { requireSuperHubContext } from '@/lib/data/scope'
import DashboardShell from '@/components/dashboard/DashboardShell'
import HubBar from '@/components/pathfinder/HubBar'
import HubChooser from '@/components/pathfinder/HubChooser'
import type { CampgroundRecord, MapBundle } from '@/lib/pathfinder/model'
import { ID_RE } from '@/lib/pathfinder/validate'

export const metadata = { title: 'Calibration' }

export default async function Page({ searchParams }: { searchParams: Promise<{ hub?: string | string[]; map?: string | string[] }> }) {
  const sp = await searchParams
  const { scope } = await requireSuperHubContext(sp.hub)
  if (!scope) return <DashboardShell title="Calibration"><HubChooser hubs={await getHubChoices()} base="/dashboard/calibration" title="Calibration" /></DashboardShell>
  const hubQuery = true ? `hub=${encodeURIComponent(scope.hubId)}` : ''
  const mapParam = typeof sp.map === 'string' ? sp.map : ''
  let bundle: MapBundle | null = null
  let items: CampgroundRecord[] = []
  let error: string | null = null
  try {
    if (mapParam && ID_RE.test(mapParam)) bundle = await getCampgroundBundle(scope.hubId, mapParam)
    if (!bundle) {
      items = await getCampgrounds(scope.hubId)
      // A hub has one map, so open it straight away.
      if (!mapParam && items.length === 1) bundle = await getCampgroundBundle(scope.hubId, items[0].id)
    }
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    if (e instanceof PathFinderAccessError) error = 'Firebase is refusing access to Path Finder data. Publish the database rules in docs/pathfinder-migration.md (hubs/$hubId/pathfinder), then reload.'
    else {
      console.error('[calibration]', e instanceof Error ? e.message : e)
    error = 'Could not load the map. Try again.'
    }
  }
  return (
    <HubPageFrame scope={{ hubId: scope.hubId, hubName: scope.hubName }} title="Calibration">
      <HubBar hubId={scope.hubId} hubs={await getHubChoices()} base="/dashboard/calibration" />
      {error && <Notice>{error}</Notice>}
      {!error && bundle && (
        <div className="h-[calc(100dvh-8.5rem)] min-h-[560px] overflow-hidden rounded-2xl">
          <CalibrationLoader hubId={scope.hubId} bundle={bundle} backHref={`/dashboard/map-locations?map=${encodeURIComponent(bundle.record.id)}${hubQuery ? `&${hubQuery}` : ''}`} />
        </div>
      )}
      {!error && !bundle && <MapPicker items={items} base="/dashboard/calibration" hubQuery={hubQuery} title="Calibration" notFound={Boolean(mapParam)} />}
    </HubPageFrame>
  )
}
