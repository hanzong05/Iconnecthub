import AuthLayout from './AuthLayout'
import FeatureBox from './FeatureBox'
import HelpNote from './HelpNote'
import Logo from './Logo'
import LoginForm from './LoginForm'

/** The sign-in screen. The form posts to a server action that checks the credentials. */
export default function LoginPage() {
  return (
    <AuthLayout>
      <Logo />

      <h1 className="mb-1.5 text-[26px] font-bold text-ink">Sign in</h1>
      <p className="mb-7 text-[13px] leading-normal text-ink2">Access your admin control panel.</p>

      <LoginForm />

      <FeatureBox />
      <HelpNote />
    </AuthLayout>
  )
}
