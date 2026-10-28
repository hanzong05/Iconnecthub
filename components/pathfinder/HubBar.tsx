import { HubSelectCard } from './HubChooser'

/** Shows which hub Path Finder is working on, and lets the Super Admin switch to another from the same dropdown. */
export default function HubBar({ hubId, hubs, base }: { hubId: string; hubs: { id: string; name: string }[]; base: string }) {
  return (
    <div className="mb-4">
      <HubSelectCard hubs={hubs} base={base} value={hubId} />
    </div>
  )
}
