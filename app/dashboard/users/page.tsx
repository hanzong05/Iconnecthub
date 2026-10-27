import { redirect } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import Notice from '@/components/dashboard/Notice'
import { getSession } from '@/lib/auth/session'
import { getUsersList, SessionExpiredError, type UserRow } from '@/lib/data/dashboard'

export const metadata = { title: 'Users – iConnectHub Admin' }

export default async function UsersPage() {
  const session = await getSession()
  if (!session) redirect('/')
  if (session.role !== 'super' && session.role !== 'super_manager') redirect('/dashboard')

  let users: UserRow[] = []
  let error: string | null = null
  try {
    users = await getUsersList(session)
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[users]', e instanceof Error ? e.message : e)
    error = 'Could not load the users. Try again.'
  }

  return (
    <DashboardShell title="Users" user={{ email: session.email, name: session.name, role: session.role, hub: session.hub }} counts={{ users: users.length }}>
      {error && <Notice>{error}</Notice>}
      {!error && users.length === 0 && <Notice tone="info">No users yet.</Notice>}
      {users.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink3">
                <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Email</th>
                <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                <th scope="col" className="px-4 py-3 font-semibold">Hub</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-semibold text-ink">{u.name || '—'}</td>
                  <td className="px-4 py-3 text-ink2">{u.email || '—'}</td>
                  <td className="px-4 py-3 text-ink2">{u.roleLabel}</td>
                  <td className="px-4 py-3 text-ink2">{u.hubName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  )
}
