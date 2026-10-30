import { redirect } from 'next/navigation'
import AccountView from '@/components/account/AccountView'
import DashboardShell from '@/components/dashboard/DashboardShell'
import { listProviders } from '@/lib/auth/credentials'
import { enabledProviders } from '@/lib/auth/oauth'
import { oauthNotice } from '@/lib/auth/oauth-messages'
import { getFirebaseToken, getSession } from '@/lib/auth/session'

export const metadata = { title: 'Account' }

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ oauth?: string }> }) {
  const session = await getSession()
  if (!session) redirect('/')
  const token = await getFirebaseToken()
  if (!token) redirect('/session-expired')

  const linked = await listProviders(token)
  const { oauth } = await searchParams

  return (
    <DashboardShell title="Account">
      <AccountView email={session.email} name={session.name} linked={linked} available={enabledProviders()} notice={oauthNotice(oauth)} />
    </DashboardShell>
  )
}
