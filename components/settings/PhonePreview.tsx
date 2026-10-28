import RemoteImg from '@/components/ui/RemoteImg'
import { QUICK_ACTION_OPTIONS, TAB_LABELS, type Palette } from '@/lib/settings-catalog'

const SAFE = /^#[0-9a-f]{6}$/i
const col = (v: string, fb: string) => (SAFE.test(v) ? v : fb)

/**
 * A small phone showing how the guest home screen will look with the values being edited, including ones not saved yet.
 * It is a sketch of colours, hero picture, quick actions and tab order, not a copy of the guest app.
 */
export default function PhonePreview({
  name,
  palette,
  hero,
  quick,
  tabs,
  phone,
}: {
  name: string
  palette: Palette
  hero: string
  quick: string[]
  tabs: string[]
  phone: string
}) {
  const primary = col(palette.primary, '#1a56db')
  const dark = col(palette.dark, '#122fa0')
  const accent = col(palette.tab, '#4a4fe0')
  const bg = col(palette.bg, '#e8e5ef')
  const muted = col(palette.secondary, '#7b85a0')
  const link = col(palette.textPrimary, '#1a56db')
  const label = (id: string) => QUICK_ACTION_OPTIONS.find((o) => o.id === id)?.label ?? id
  return (
    <figure aria-label="Phone preview" className="m-0 flex flex-col items-center">
      <div className="w-[240px] rounded-[32px] border-[6px] border-ink bg-ink p-0 shadow-[0_8px_24px_rgba(15,31,74,0.2)]">
        <div className="flex h-[440px] flex-col overflow-hidden rounded-[26px]" style={{ background: bg }}>
          <div className="relative h-[130px] shrink-0" style={{ background: `linear-gradient(135deg, ${primary}, ${dark})` }}>
            {hero && <RemoteImg src={hero} w={480} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-sm font-bold text-white">{name || 'Hub name'}</div>
          </div>
          <div className="flex-1 space-y-2 overflow-hidden p-3">
            <div className="text-[11px] font-bold" style={{ color: link }}>Quick actions</div>
            <div className="grid grid-cols-2 gap-1.5">
              {quick.map((id, i) => (
                <div key={i} className="truncate rounded-lg bg-white px-2 py-2 text-center text-[10px] font-semibold" style={{ color: primary }}>
                  {label(id)}
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-white p-2 text-[10px]" style={{ color: muted }}>
              Contact: {phone || 'no phone set'}
            </div>
            <div className="rounded-lg px-2 py-1.5 text-center text-[10px] font-semibold text-white" style={{ background: accent }}>Book now</div>
          </div>
          <nav aria-label="Preview tabs" className="flex shrink-0 justify-around border-t border-black/10 bg-white py-2">
            {tabs.map((t, i) => (
              <span key={t} className="text-[10px] font-bold" style={{ color: i === 0 ? primary : muted }}>
                {TAB_LABELS[t] ?? t}
              </span>
            ))}
          </nav>
        </div>
      </div>
      <figcaption className="mt-2 max-w-[240px] text-center text-[11px] text-ink3">Live sketch of your edits. Colors, hero picture, quick actions and tab order update as you type, before you save.</figcaption>
    </figure>
  )
}
