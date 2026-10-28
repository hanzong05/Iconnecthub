import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import DashboardFrame from '@/components/dashboard/DashboardFrame'
import { getSession } from '@/lib/auth/session'

// Everything behind the sign-in is private: never indexed, never followed, never archived.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
}

/**
 * The sidebar and header are built once here and stay mounted while you move between pages; only the content changes.
 * Every page and action still checks the session itself, so this is a convenience for the screen, not the protection.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/')
  return <DashboardFrame user={{ email: session.email, name: session.name, role: session.role, hub: session.hub, hubId: session.hubId }}>{children}</DashboardFrame>
}
