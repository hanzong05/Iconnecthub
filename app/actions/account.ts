'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { unlinkProvider } from '@/lib/auth/credentials'
import { parseProvider, providerInfo } from '@/lib/auth/oauth'
import { getFirebaseToken, getSession } from '@/lib/auth/session'

/** Removes a bound Google or Apple sign-in from the signed-in user's own account. Nobody can change another account here. */
export async function unbindProviderAction(formData: FormData): Promise<void> {
  const session = await getSession()
  if (!session) redirect('/')
  const key = parseProvider(String(formData.get('provider') ?? ''))
  if (!key) redirect('/dashboard/account?oauth=failed')
  const token = await getFirebaseToken()
  if (!token) redirect('/session-expired')

  const result = await unlinkProvider(token, providerInfo(key).firebaseId)
  revalidatePath('/dashboard/account')
  redirect(`/dashboard/account?oauth=${result.ok ? 'unlinked' : result.reason === 'last_method' ? 'last_method' : 'failed'}`)
}
