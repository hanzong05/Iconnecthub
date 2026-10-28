const LOGO_URL = 'https://assets.cdn.filesafe.space/Sk7XUXxjVtIrJHKp3GhX/media/6a5634ab46ff6bf8017aab21.png'

/** The product mark with its name and the "Powered by" line. */
export default function Logo() {
  return (
    <div className="mb-8 flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_URL} alt="iConnectHub Admin" width={40} height={40} fetchPriority="high" decoding="async" className="h-10 w-10 flex-none rounded-[10px] object-cover" />
      <div>
        <div className="text-[18px] font-bold text-ink">iConnectHub Admin</div>
        <div className="mt-px text-[11px] text-ink3">Powered by BlueSpot</div>
      </div>
    </div>
  )
}
