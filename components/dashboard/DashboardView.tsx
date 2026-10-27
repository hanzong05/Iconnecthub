import type { DashboardData } from '@/lib/data/dashboard'
import Link from 'next/link'
import QuickActions from './QuickActions'
import NavIcon from './NavIcon'
import StatCard from './StatCard'
import Thumb from './Thumb'

const CARD = 'flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5'

function Heading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-2 text-[15px] font-bold text-ink">
      {children}
    </h2>
  )
}

function ColumnHead({ title, id, href }: { title: string; id: string; href?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 id={id} className="text-[15px] font-bold text-ink">
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-xs font-semibold text-brand hover:underline">
          View All
        </Link>
      )}
    </div>
  )
}

/** The dashboard body, laid out like the hub admin: stat row, quick actions, recent hubs and users, status bar. */
export default function DashboardView({ data, features }: { data: DashboardData; features: { notify: boolean; upload: boolean } }) {
  const statCols = data.stats.length >= 5 ? 'min-[900px]:grid-cols-5' : 'min-[900px]:grid-cols-2'

  return (
    <>
      <section aria-label="Summary" className={`grid grid-cols-2 gap-2.5 min-[480px]:gap-3.5 ${statCols}`}>
        {data.stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </section>

      <section aria-labelledby="quick-actions">
        <Heading id="quick-actions">Quick Actions</Heading>
        <QuickActions data={data} canNotify={features.notify} canUpload={features.upload} />
      </section>

      <div className={`grid grid-cols-1 gap-3 ${data.isSuper ? 'min-[900px]:grid-cols-2 min-[900px]:gap-4' : ''}`}>
        <section aria-labelledby="recent-hubs" className="min-w-0">
          <ColumnHead id="recent-hubs" title="Recent Hubs" href={data.isSuper ? '/dashboard/hubs' : undefined} />
          <div className="flex flex-col gap-2">
            {data.recentHubs.length ? (
              data.recentHubs.map((h) => (
                <div key={h.id} className={CARD}>
                  <Thumb src={h.logoUrl} label={h.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-ink">{h.name}</div>
                    <div className="truncate text-[11px] text-ink3">{h.location ?? 'No location'}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-semibold text-ink">Active</div>
                    <NavIcon name="check" className="ml-auto h-[13px] w-[13px] text-emerald-600" />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-ink3">No hubs yet</p>
            )}
          </div>
        </section>

        {data.isSuper && (
          <section aria-labelledby="recent-users" className="min-w-0">
            <ColumnHead id="recent-users" title="Recent Users" href="/dashboard/users" />
            <div className="flex flex-col gap-2">
              {data.recentUsers.length ? (
                data.recentUsers.map((u) => (
                  <div key={u.id} className={CARD}>
                    <Thumb src={null} label={u.name} className="bg-gradient-to-br from-violet-500 to-violet-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">{u.name}</div>
                      <div className="truncate text-[11px] text-ink3">{u.roleLabel}</div>
                    </div>
                    <div className="max-w-[40%] shrink-0 truncate text-[11px] text-ink3">{u.hubName}</div>
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-ink3">No users yet</p>
              )}
            </div>
          </section>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-surface px-[18px] py-3.5 shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#e8f0fe] text-brand">
            <NavIcon name="dashboard" className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-ink">System Overview</h3>
            <p className="text-[11px] text-ink3">Data loaded from your hubs just now.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-600/10 px-3 py-1.5 text-[11px] font-bold text-emerald-600">
          <NavIcon name="check" className="h-3.5 w-3.5" />
          Connected
        </div>
      </div>
    </>
  )
}
