import type { FormEvent } from 'react'

/**
 * Last chance to cancel before guests are contacted. If the form's "notify" box is ticked and the person
 * answers Cancel, the submit is stopped and nothing is saved or sent.
 */
export function confirmNotify(e: FormEvent<HTMLFormElement>, what: string) {
  const box = e.currentTarget.elements.namedItem('notify')
  const ticked = box instanceof HTMLInputElement && box.type === 'checkbox' && box.checked
  if (ticked && !window.confirm(`This will send ${what} to this hub's guests as a push notification and an email. It cannot be unsent. Save and send now?`)) e.preventDefault()
}
