import type { ReactNode } from 'react'
import { ShellSync, type Counts } from './ShellContext'

/**
 * What a page wraps its content in. The sidebar and header now live in the dashboard layout and stay put;
 * this only tells them the page's title, badge counts and hub view, then shows the content.
 */
export default function DashboardShell({ title, counts, viewAs, backToHubs, children }: { title: string; counts?: Counts; viewAs?: { hubId: string; hubName: string }; backToHubs?: boolean; children: ReactNode }) {
  return (
    <>
      <ShellSync title={title} counts={counts} viewAs={viewAs} backToHubs={backToHubs} />
      {children}
    </>
  )
}
