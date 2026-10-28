import { redirect } from 'next/navigation'
import { SANWAR_HUB_ID } from '@/components/dashboard/nav'
import FlyersView from '@/components/flyers/FlyersView'
import HubPageFrame from '@/components/dashboard/HubPageFrame'
import Notice from '@/components/dashboard/Notice'
import { getFlyers } from '@/lib/data/content'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { requireHubContext } from '@/lib/data/scope'
import { getAuthEnv } from '@/lib/env'

export const metadata = { title: 'Music Festival' }

export default async function Page({ searchParams }: { searchParams: Promise<{ hub?: string | string[] }> }) {
  const { session, scope } = await requireHubContext((await searchParams).hub)
  // Built for the Sanwar hub only, as on the hub admin.
  if (scope.hubId !== SANWAR_HUB_ID) redirect('/dashboard')
  let flyers: string[] = []
  let error: string | null = null
  try {
    flyers = await getFlyers(scope.hubId, 'musicFestival')
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[flyers]', e instanceof Error ? e.message : e)
    error = 'Could not load the flyers. Try again.'
  }
  return (
    <HubPageFrame scope={scope} title="Music Festival">
      {error && <Notice>{error}</Notice>}
      {!error && <FlyersView hubId={scope.hubId} hubName={scope.hubName} kind="musicFestival" noun="Music Festival flyers" initial={flyers} canUpload={Boolean(getAuthEnv().imgbbApiKey)} />}
    </HubPageFrame>
  )
}
