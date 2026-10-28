import type { ReactNode } from 'react'
import type { HubScope } from '@/lib/data/scope'
import DashboardShell from './DashboardShell'
import type { CountKey } from './nav'

/** For a hub-content page: a super admin viewing one hub gets that hub's manager menu and a Back to Hubs link. */
export default function HubPageFrame({ scope, title, counts, children }: { scope: HubScope; title: string; counts?: Partial<Record<CountKey, number>>; children: ReactNode }) {
  return (
    <DashboardShell title={title} counts={counts} viewAs={scope.viewAs} backToHubs={Boolean(scope.viewAs)}>
      {children}
    </DashboardShell>
  )
}
