import { InfoIcon } from './Icons'

/** The "Need access?" strip at the bottom of the card. */
export default function HelpNote() {
  return (
    <div className="mt-3 flex items-center justify-center gap-1.5 rounded-[10px] border border-brand bg-brand/10 p-2.5 text-center text-[11px] text-ink2">
      <InfoIcon />
      <span>Need access? Contact your administrator.</span>
    </div>
  )
}
