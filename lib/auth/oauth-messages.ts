/** Short codes carried in the address after a Google / Apple attempt. The page maps them to text; the text itself is never taken from the address. */
export const OAUTH_NOTICES = {
  cancelled: { tone: 'error', text: 'The sign-in was cancelled or timed out. Please try again.' },
  failed: { tone: 'error', text: 'We could not complete that sign-in. Please try again.' },
  unavailable: { tone: 'error', text: 'Sign-in is unavailable right now. Try again shortly.' },
  throttled: { tone: 'error', text: 'Too many attempts. Try again later.' },
  disabled: { tone: 'error', text: 'This account has been disabled.' },
  not_linked: { tone: 'error', text: 'No account is linked to that Google or Apple ID. Sign in with your email and password, then bind it from the Account page. Accounts cannot be created this way.' },
  already_linked: { tone: 'error', text: 'That Google or Apple ID is already bound to a different account.' },
  last_method: { tone: 'error', text: 'You must keep at least one other way to sign in before removing this one.' },
  linked: { tone: 'success', text: 'Bound. You can now use it to sign in.' },
  unlinked: { tone: 'success', text: 'Removed. It can no longer be used to sign in.' },
} as const

export type OAuthNoticeCode = keyof typeof OAUTH_NOTICES

export function oauthNotice(code: string | string[] | undefined) {
  return typeof code === 'string' && Object.hasOwn(OAUTH_NOTICES, code) ? OAUTH_NOTICES[code as OAuthNoticeCode] : null
}
