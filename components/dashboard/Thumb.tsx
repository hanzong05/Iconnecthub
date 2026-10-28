import RemoteImg from '@/components/ui/RemoteImg'
/** A small square image, or the first letter on a coloured tile when there is none. */
export default function Thumb({ src, label, className = 'bg-gradient-to-br from-brand to-blue-400' }: { src: string | null; label: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <RemoteImg src={src} w={40} alt="" className="h-10 w-10 shrink-0 rounded-[10px] object-cover" />
  ) : (
    <div aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-sm font-bold text-white ${className}`}>
      {(label[0] ?? '?').toUpperCase()}
    </div>
  )
}
