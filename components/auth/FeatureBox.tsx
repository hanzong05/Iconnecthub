import FeatureChip from './FeatureChip'
import { BellIcon, CalendarIcon, HomeIcon, MonitorIcon } from './Icons'

/** "Your communication command center": a short pitch with the three main areas. */
export default function FeatureBox() {
  return (
    <section className="mt-4 rounded-[14px] border border-line bg-surface2 p-3.5 text-center">
      <div className="mb-1.5 flex items-center justify-center gap-2">
        <MonitorIcon />
        <h2 className="text-xs font-bold text-ink">Your communication command center</h2>
      </div>
      <p className="mb-2.5 text-[11px] leading-[1.4] text-ink2">Manage announcements, events, updates and important information from one simple dashboard.</p>
      <div className="grid grid-cols-3 gap-2">
        <FeatureChip icon={<BellIcon />} label="Announcements" />
        <FeatureChip icon={<CalendarIcon />} label="Events" />
        <FeatureChip icon={<HomeIcon />} label="Updates" />
      </div>
    </section>
  )
}
