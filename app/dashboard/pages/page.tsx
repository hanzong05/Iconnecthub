import { redirect } from 'next/navigation'
import HubPageFrame from '@/components/dashboard/HubPageFrame'
import Notice from '@/components/dashboard/Notice'
import PagesView from '@/components/pages/PagesView'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { getHubSettings } from '@/lib/data/settings'
import { guestCss } from '@/lib/data/guest-css'
import { getPages, type PageState } from '@/lib/data/pages'
import { requireHubContext } from '@/lib/data/scope'
import type { HubSettings } from '@/lib/settings-catalog'

export const metadata = { title: 'Pages' }

/** Detail pages of one hub (Reservations, Rules, …): managers edit their own hub, a super admin the hub they are viewing. */
export default async function PagesPage({ searchParams }: { searchParams: Promise<{ hub?: string | string[] }> }) {
  const { scope } = await requireHubContext((await searchParams).hub)
  let pages: PageState[] = []
  let settings: HubSettings | null = null
  let error: string | null = null
  try {
    ;[pages, settings] = await Promise.all([getPages(scope.hubId), getHubSettings(scope.hubId, scope.hubName)])
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[pages]', e instanceof Error ? e.message : e)
    error = 'Could not load the pages. Try again.'
  }
  return (
    <HubPageFrame scope={scope} title="Pages">
      {error && <Notice>{error}</Notice>}
      {!error && settings && <PagesView key={scope.hubId} hubId={scope.hubId} hubName={scope.hubName} pages={pages} settings={settings} css={guestCss()} dbUrl={process.env.FIREBASE_DATABASE_URL ?? ''} />}
    </HubPageFrame>
  )
}
