import type { OAuthProviderKey } from '@/lib/env'
import { AppleMark, GoogleMark } from './ProviderIcons'

const LABEL: Record<OAuthProviderKey, string> = { google: 'Google', apple: 'Apple' }

/** "Continue with Google / Apple". Plain links: the server starts the flow. They only sign in an account that already bound it. */
export default function SocialButtons({ providers }: { providers: OAuthProviderKey[] }) {
  if (!providers.length) return null
  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink2">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="flex flex-col gap-2.5">
        {providers.map((p) => (
          <a
            key={p}
            href={`/api/auth/oauth/${p}/start?mode=login`}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface p-[12px] text-sm font-semibold text-ink transition-colors hover:bg-surface2"
          >
            {p === 'google' ? <GoogleMark /> : <AppleMark />}
            Continue with {LABEL[p]}
          </a>
        ))}
      </div>
      <p className="mt-2.5 text-center text-[11.5px] leading-normal text-ink2">Works only if you already bound it to your account from the Account page.</p>
    </div>
  )
}
