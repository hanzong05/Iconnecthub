import LoginPage from '@/components/auth/LoginPage'
import { enabledProviders } from '@/lib/auth/oauth'
import { oauthNotice } from '@/lib/auth/oauth-messages'

export default async function Home({ searchParams }: { searchParams: Promise<{ oauth?: string }> }) {
  const { oauth } = await searchParams
  return <LoginPage providers={enabledProviders()} notice={oauthNotice(oauth)} />
}
