import AuthLayout from './AuthLayout'
import FeatureBox from './FeatureBox'
import HelpNote from './HelpNote'
import Logo from './Logo'
import LoginForm from './LoginForm'
import SocialButtons from './SocialButtons'
import type { OAuthProviderKey } from '@/lib/env'

/** The sign-in screen. The form posts to a server action that checks the credentials. */
export default function LoginPage({ providers = [], notice = null }: { providers?: OAuthProviderKey[]; notice?: { tone: 'error' | 'success'; text: string } | null }) {
  return (
    <AuthLayout>
      <Logo />

      <h1 className="mb-1.5 text-[26px] font-bold text-ink">Sign in</h1>
      <p className="mb-7 text-[13px] leading-normal text-ink2">Access your admin control panel.</p>

      {notice && (
        <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-xl border px-3.5 py-3 text-[13px] font-medium ${notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {notice.text}
        </div>
      )}

      <LoginForm />
      <SocialButtons providers={providers} />

      <FeatureBox />
      <HelpNote />
    </AuthLayout>
  )
}
