import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import UsersView from '@/components/users/UsersView'
import Notice from '@/components/dashboard/Notice'
import { getSession } from '@/lib/auth/session'
import { getHubsList, getUsersList, SessionExpiredError, type UserRow } from '@/lib/data/dashboard'

export const metadata = { title: 'Users' }

export default async function UsersPage() {
  const session = await getSession()
  if (!session) redirect('/')
  if (session.role !== 'super' && session.role !== 'super_manager') redirect('/dashboard')

  let users: UserRow[] = []
  let hubs: { id: string; name: string }[] = []
  let error: string | null = null
  try {
    users = await getUsersList(session)
    hubs = (await getHubsList(session)).map((h) => ({ id: h.id, name: h.name })).sort((a, b) => a.name.localeCompare(b.name))
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[users]', e instanceof Error ? e.message : e)
    error = 'Could not load the users. Try again.'
  }

  return (
    <DashboardShell title="Users" counts={{ users: users.length }}>
      {error && <Notice>{error}</Notice>}
      {!error && <UsersView users={users} hubs={hubs} isSuper={session.role === 'super'} ownHub={session.hubId ?? ''} selfEmail={session.email} />}
    </DashboardShell>
  )
}
