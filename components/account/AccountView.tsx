import { unbindProviderAction } from '@/app/actions/account'
import { AppleMark, GoogleMark } from '@/components/auth/ProviderIcons'
import type { LinkedProvider } from '@/lib/auth/credentials'
import type { OAuthProviderKey } from '@/lib/env'

const PROVIDERS: { key: OAuthProviderKey; firebaseId: string; label: string }[] = [
  { key: 'google', firebaseId: 'google.com', label: 'Google (Gmail)' },
  { key: 'apple', firebaseId: 'apple.com', label: 'Apple' },
]

interface Props {
  email: string
  name: string | null
  /** Null when the list could not be loaded. */
  linked: LinkedProvider[] | null
  /** Providers the server has set up. Others are not offered. */
  available: OAuthProviderKey[]
  notice: { tone: 'error' | 'success'; text: string } | null
}

/** The signed-in person's own sign-in methods. They can bind Google or Apple as another way in, but cannot sign up with them. */
export default function AccountView({ email, name, linked, available, notice }: Props) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-3 sm:p-6">
      {notice && (
        <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-3 text-[13px] font-medium ${notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {notice.text}
        </div>
      )}

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">{name ?? 'Your account'}</h2>
        <p className="mt-0.5 break-all text-[13px] text-ink2">{email}</p>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="signin-methods">
        <h2 id="signin-methods" className="text-sm font-bold text-ink">Other ways to sign in</h2>
        <p className="mb-4 mt-1 text-[13px] leading-normal text-ink2">
          Your account was created for you. Bind a Google or Apple account if you want to sign in with it instead of typing your password. This only adds a way in to this account; it cannot create a new one.
        </p>

        {linked === null && (
          <p role="alert" className="mb-3 text-[13px] font-medium text-red-700">
            Could not load your sign-in methods. Reload the page to try again.
          </p>
        )}

        <ul className="divide-y divide-line">
          {PROVIDERS.filter((p) => available.includes(p.key) || linked?.some((l) => l.providerId === p.firebaseId)).map((p) => {
            const bound = linked?.find((l) => l.providerId === p.firebaseId)
            return (
              <li key={p.key} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface2 text-ink">{p.key === 'google' ? <GoogleMark /> : <AppleMark />}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{p.label}</div>
                  <div className="truncate text-xs text-ink2">{bound ? `Bound${bound.email ? ` · ${bound.email}` : ''}` : 'Not bound'}</div>
                </div>
                {bound ? (
                  <form action={unbindProviderAction}>
                    <input type="hidden" name="provider" value={p.key} />
                    <button type="submit" className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink hover:bg-surface2">
                      Remove
                    </button>
                  </form>
                ) : linked !== null && available.includes(p.key) ? (
                  <a href={`/api/auth/oauth/${p.key}/start?mode=link`} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dim">
                    Bind
                  </a>
                ) : null}
              </li>
            )
          })}
        </ul>
        {available.length === 0 && <p className="mt-3 text-[13px] text-ink2">Google and Apple sign-in are not turned on for this site yet.</p>}
      </section>
    </div>
  )
}
