import { redirect } from 'next/navigation'
import ChatView from '@/components/chat/ChatView'
import HubPageFrame from '@/components/dashboard/HubPageFrame'
import Notice from '@/components/dashboard/Notice'
import { getChatThreads, getGuestBriefs, type ChatThread, type GuestBrief } from '@/lib/data/content'
import { SessionExpiredError } from '@/lib/data/dashboard'
import { requireHubContext } from '@/lib/data/scope'

export const metadata = { title: 'Guest Chat' }

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ hub?: string | string[] }> }) {
  const { session, scope } = await requireHubContext((await searchParams).hub)
  let threads: ChatThread[] = []
  let guests: GuestBrief[] = []
  let error: string | null = null
  try {
    ;[threads, guests] = await Promise.all([getChatThreads(scope.hubId), getGuestBriefs(scope.hubId).catch(() => [])])
  } catch (e) {
    if (e instanceof SessionExpiredError) redirect('/session-expired')
    console.error('[chat]', e instanceof Error ? e.message : e)
    error = 'Could not load the conversations. Try again.'
  }

  return (
    <HubPageFrame scope={scope} title="Guest Chat">
      {error && <Notice>{error}</Notice>}
      {!error && <ChatView hub={{ id: scope.hubId, name: scope.hubName }} initialThreads={threads} guests={guests} />}
    </HubPageFrame>
  )
}
