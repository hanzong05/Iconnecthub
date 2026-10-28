import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import HubPageFrame from '@/components/dashboard/HubPageFrame'
import Notice from '@/components/dashboard/Notice'
import SettingsView from '@/components/settings/SettingsView'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { getLivePages } from '@/lib/data/pages'
import { guestCss } from '@/lib/data/guest-css'
import { getHubChoices } from '@/lib/data/pathfinder'
import { requireSuperHubContext } from '@/lib/data/scope'
import { getHubSettings, getSettingsHistory } from '@/lib/data/settings'
import { emptyHubSettings } from '@/lib/settings-catalog'

export const metadata = { title: 'Settings' }

/** Settings are an admin function: Super Admin only, and shown as the admin (not as a manager viewing a hub). */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ hub?: string | string[] }> }) {
  const { scope } = await requireSuperHubContext((await searchParams).hub)
  const hubs = await getHubChoices().catch(() => [])
  // No hub chosen yet: show the full layout, empty and locked, with the hub picker first.
  if (!scope) return <DashboardShell title="Settings"><SettingsView hubId="" noHub initial={emptyHubSettings()} hubs={hubs} history={{ entries: [], currentReleaseId: null }} /></DashboardShell>
  const css = guestCss()
  const dbUrl = process.env.FIREBASE_DATABASE_URL ?? ''
  let livePages: Awaited<ReturnType<typeof getLivePages>> = {}
  let settings = null
  let history: Awaited<ReturnType<typeof getSettingsHistory>> = { entries: [], currentReleaseId: null }
  let error: string | null = null
  try {
    ;[settings, history, livePages] = await Promise.all([getHubSettings(scope.hubId, scope.hubName), getSettingsHistory(scope.hubId), getLivePages(scope.hubId)])
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[settings]', e instanceof Error ? e.message : e)
    error = 'Could not load the settings. Try again.'
  }
  return (
    <HubPageFrame scope={{ hubId: scope.hubId, hubName: scope.hubName }} title="Settings">
      {error && <Notice>{error}</Notice>}
      {settings && <SettingsView key={scope.hubId} hubId={scope.hubId} initial={settings} hubs={hubs} history={history} guestCss={css} dbUrl={dbUrl} pages={livePages} />}
    </HubPageFrame>
  )
}
