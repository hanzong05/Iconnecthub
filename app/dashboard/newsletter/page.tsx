import { redirect } from 'next/navigation'
import HubPageFrame from '@/components/dashboard/HubPageFrame'
import Notice from '@/components/dashboard/Notice'
import NewsletterView from '@/components/newsletter/NewsletterView'
import { getNewsletterUrl } from '@/lib/data/content'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { requireHubContext } from '@/lib/data/scope'
import { getAuthEnv } from '@/lib/env'

export const metadata = { title: 'Newsletter' }

export default async function NewsletterPage({ searchParams }: { searchParams: Promise<{ hub?: string | string[] }> }) {
  const { session, scope } = await requireHubContext((await searchParams).hub)
  let url: string | null = null
  let error: string | null = null
  try {
    url = await getNewsletterUrl(scope.hubId)
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[newsletter]', e instanceof Error ? e.message : e)
    error = 'Could not load the newsletter image. Try again.'
  }

  return (
    <HubPageFrame scope={scope} title="Newsletter">
      {error && <Notice>{error}</Notice>}
      {!error && <NewsletterView hub={{ id: scope.hubId, name: scope.hubName }} initialUrl={url} canUpload={Boolean(getAuthEnv().imgbbApiKey)} />}
    </HubPageFrame>
  )
}
