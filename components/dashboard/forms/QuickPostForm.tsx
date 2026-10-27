'use client'

import { useActionState } from 'react'
import { createAnnouncementAction, type ActionState } from '@/app/actions/content'
import type { HubOption } from '@/lib/data/dashboard'
import { Check, Field, FormMessage, HubSelect, inputClass, SubmitButton } from '@/components/ui/fields'

const INITIAL: ActionState = {}

export default function QuickPostForm({ hubs, canNotify, onDone }: { hubs: HubOption[]; canNotify: boolean; onDone: () => void }) {
  const [state, action, pending] = useActionState(
    async (prev: ActionState, data: FormData) => {
      const result = await createAnnouncementAction(prev, data)
      if (result.success) onDone()
      return result
    },
    INITIAL,
  )

  return (
    <form action={action}>
      <FormMessage error={state.error} />
      <Field label="Hub" htmlFor="qp-hub">
        <HubSelect id="qp-hub" options={hubs} />
      </Field>
      <Field label="Title" htmlFor="qp-title">
        <input id="qp-title" name="title" required maxLength={120} placeholder="e.g. Pool closes early today" className={inputClass} />
      </Field>
      <Field label="Message" htmlFor="qp-message">
        <textarea id="qp-message" name="message" required maxLength={2000} rows={4} placeholder="What should guests know?" className={`${inputClass} resize-y`} />
      </Field>
      {canNotify && <Check name="notify" label="Also notify guests" hint="Sends a push notification and email to this hub's guests." />}
      <SubmitButton pending={pending}>Publish Announcement</SubmitButton>
    </form>
  )
}
