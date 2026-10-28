import type { CSSProperties } from 'react'
import { formatText, type Block, type Page } from '@/lib/pages'
import type { Palette } from '@/lib/settings-catalog'

const SAFE = /^#[0-9a-f]{6}$/i
const col = (v: string | undefined, fb: string) => (v && SAFE.test(v) ? v : fb)
const W = 375
const H = 680
const SCALE = 0.62

function Text({ text }: { text: string }) {
  return (
    <>
      {formatText(text).map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line.map((p, j) => (p.bold ? <strong key={j}>{p.text}</strong> : <span key={j}>{p.text}</span>))}
        </span>
      ))}
    </>
  )
}
const shown = (b: Extract<Block, { type: 'contact' }>) => (b.kind === 'link' ? b.value.replace(/^https:\/\//i, '') : b.value)
const heading = (b: Block) => (b.type === 'card' ? (b.meta ? `${b.title} · ${b.meta}` : b.title) : b.type === 'contact' ? b.label : b.type === 'rule' ? b.title : '')

/** Rules-style page: how the live hubs draw every page except Reservations (header, then white cards). */
function PageScreen({ page, p }: { page: Page; p: { primary: string; dark: string; bg: string; muted: string } }) {
  const sections: { label: string; alert: boolean; rows: Block[] }[] = []
  for (const b of page.blocks) {
    if (b.type === 'section') sections.push({ label: b.title, alert: b.tone === 'alert', rows: [] })
    else {
      if (!sections.length) sections.push({ label: '', alert: false, rows: [] })
      sections[sections.length - 1].rows.push(b)
    }
  }
  return (
    <div className="hp-screen" style={{ background: p.bg }}>
      <div className="hp-head" style={{ background: `linear-gradient(135deg, ${p.primary}, ${p.dark})` }}>
        <div className="hp-back">‹ Back</div>
        <h2>{page.title || 'Page title'}</h2>
        {page.subtitle && <p>{page.subtitle}</p>}
      </div>
      <div className="hp-body">
        {page.blocks.length === 0 && <p className="hp-empty">Nothing here yet. Add a block to start.</p>}
        {sections.map((s, i) => (
          <div key={i} className="hp-sec" style={s.alert ? { borderLeft: '4px solid #ef4444' } : undefined}>
            {s.label && <div className="hp-label" style={s.alert ? { color: '#ef4444' } : { color: p.muted }}>{s.label}</div>}
            {s.rows.map((b, j) => (
              <div key={b.id} className="hp-rule" style={j === 0 ? { borderTop: 'none' } : undefined}>
                {b.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <><img src={b.url} alt={b.caption} loading="lazy" className="hp-img" />{b.caption && <div className="hp-rbody">{b.caption}</div>}</>
                ) : (
                  <>
                    {heading(b) && <div className="hp-rtitle">{heading(b)}</div>}
                    <div className="hp-rbody">
                      {b.type === 'contact' ? <span style={{ color: p.primary, fontWeight: 700 }}>{shown(b)}</span> : <Text text={b.type === 'rule' ? b.body : b.type === 'card' ? b.text : ''} />}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Reservations: the "Choose Your Stay" sheet that drops from the top over the home screen. */
function ReserveScreen({ page, p }: { page: Page; p: { primary: string; dark: string; bg: string; muted: string } }) {
  return (
    <div className="hp-screen" style={{ background: p.bg }}>
      <div className="hp-dim">
        <div className="hp-sheet">
          <div className="hp-sheet-head"><span>{page.title || 'Choose Your Stay'}</span><i>✕</i></div>
          {page.blocks.length === 0 && <p className="hp-empty">Nothing here yet. Add a block to start.</p>}
          {page.blocks.map((b) => {
            if (b.type === 'section') return <div key={b.id} className="hp-sec-lab" style={{ color: b.tone === 'alert' ? '#ef4444' : '#6b7280' }}>{b.title}</div>
            if (b.type === 'image') return null
            const title = b.type === 'contact' ? b.label : heading(b)
            const sub = b.type === 'contact' ? shown(b) : b.type === 'rule' ? b.body : b.type === 'card' ? b.text : ''
            return (
              <div key={b.id} className="hp-row">
                <div className="hp-ico" style={{ background: `${p.primary}1a`, color: p.primary }}>{b.type === 'contact' ? (b.kind === 'phone' ? '☎' : b.kind === 'email' ? '✉' : '⌂') : '•'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {title && <div className="hp-rn">{title}</div>}
                  {sub && <div className="hp-rs"><Text text={sub} /></div>}
                </div>
                {b.type === 'contact' && <div className="hp-chev">›</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const CSS = `
.hp{width:${W}px;height:${H}px;font-family:Inter,system-ui,sans-serif;font-size:14px;color:#111827;transform:scale(${SCALE});transform-origin:top left}
.hp *{box-sizing:border-box;margin:0}
.hp-screen{position:relative;display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden}
.hp-head{padding:36px 16px 28px;flex-shrink:0;color:#fff}.hp-back{font-size:13px;font-weight:600;color:rgba(255,255,255,.8);margin-bottom:10px}
.hp-head h2{font-size:22px;font-weight:700;color:#fff;margin-bottom:4px}.hp-head p{font-size:13px;color:rgba(255,255,255,.7)}
.hp-body{flex:1;overflow:hidden;padding:16px}.hp-empty{padding:28px 16px;text-align:center;color:#6b7280;font-size:13px}
.hp-sec{background:#fff;border-radius:14px;overflow:hidden;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,.07)}
.hp-label{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:14px 16px 6px}
.hp-rule{padding:12px 16px;border-top:1px solid #f3f4f6}.hp-rtitle{font-size:12px;font-weight:700;color:#111827;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}
.hp-rbody{font-size:13px;color:#374151;line-height:1.65;word-break:break-word}.hp-img{display:block;width:100%;border-radius:10px;margin-bottom:6px}
.hp-dim{position:absolute;inset:0;background:rgba(0,0,0,.45)}
.hp-sheet{background:#fff;border-radius:0 0 20px 20px;padding:34px 0 16px;max-height:92%;overflow:hidden}
.hp-sheet-head{display:flex;align-items:center;justify-content:space-between;padding:4px 20px 14px;border-bottom:1px solid #f0f0f0;margin-bottom:4px;font-size:16px;font-weight:700}
.hp-sheet-head i{width:30px;height:30px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:14px;color:#6b7280;font-weight:400}
.hp-sec-lab{padding:12px 20px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.hp-row{display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #f3f4f6}.hp-ico{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px}
.hp-rn{font-size:15px;font-weight:600;color:#111827;word-break:break-word}.hp-rs{font-size:12px;color:#6b7280;margin-top:2px;word-break:break-word}.hp-chev{color:#9ca3af;font-size:20px}
`

/**
 * How a page looks on the live hubs today: Reservations as the "Choose Your Stay" sheet, every other page in the
 * Rules layout, using the hub's colours. Drawn as text only; links are shown but not clickable, so previewing can never open anything.
 */
export default function PagePreview({ page, pageId = 'rules', palette, framed = true }: { page: Page; pageId?: string; palette?: Partial<Palette>; framed?: boolean }) {
  const p = { primary: col(palette?.primary, '#1a56db'), dark: col(palette?.dark, '#1e3a8a'), bg: col(palette?.bg, '#e8e5ef'), muted: col(palette?.secondary, '#6b7280') }
  const box: CSSProperties = { width: W * SCALE, height: H * SCALE, overflow: 'hidden', position: 'relative' }
  const inner = (
    <div style={box}>
      <style>{CSS}</style>
      <div className="hp">{pageId === 'reservations' ? <ReserveScreen page={page} p={p} /> : <PageScreen page={page} p={p} />}</div>
    </div>
  )
  if (!framed) return <div className="mx-auto w-fit overflow-hidden rounded-2xl border border-line">{inner}</div>
  return (
    <figure aria-label="Page preview" className="m-0 flex flex-col items-center">
      <div className="overflow-hidden rounded-[30px] border-[6px] border-ink bg-ink shadow-[0_8px_24px_rgba(15,31,74,0.2)]"><div className="overflow-hidden rounded-[24px]">{inner}</div></div>
      <figcaption className="mt-2 max-w-[240px] text-center text-[11px] text-ink3">How guests see this page on the hub. Updates as you type.</figcaption>
    </figure>
  )
}
