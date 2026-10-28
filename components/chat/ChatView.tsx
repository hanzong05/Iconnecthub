'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteChatAction, listChatThreadsAction, openChatAction, sendChatReplyAction } from '@/app/actions/hubcontent'
import Icon from '@/components/ui/Icon'
import Modal from '@/components/ui/Modal'
import type { ChatMessage, ChatThread, GuestBrief } from '@/lib/data/content'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'

const stamp = (iso: string) => {
  const t = Date.parse(iso)
  if (!t) return ''
  const d = new Date(t)
  const same = d.toDateString() === new Date().toDateString()
  return same ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const day = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function Avatar({ name, size = 'h-10 w-10 text-xs', tone = 'bg-emerald-700' }: { name: string; size?: string; tone?: string }) {
  return (
    <div aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${tone} ${size}`}>
      {initials(name)}
    </div>
  )
}

export default function ChatView({ hub, initialThreads, guests }: { hub: { id: string; name: string }; initialThreads: ChatThread[]; guests: GuestBrief[] }) {
  const [threads, setThreads] = useState(initialThreads)
  const [active, setActive] = useState<{ id: string; name: string } | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const [guestQuery, setGuestQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const activeId = active?.id ?? null

  // Keep the list fresh, and the open conversation fresher.
  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return
      const r = await listChatThreadsAction(hub.id)
      if (r.threads) setThreads(r.threads)
    }, 10_000)
    return () => clearInterval(t)
  }, [hub.id])

  useEffect(() => {
    if (!activeId) return
    let alive = true
    const load = async (first: boolean) => {
      if (first) setLoading(true)
      const r = await openChatAction(hub.id, activeId)
      if (!alive) return
      if (first) setLoading(false)
      if (r.messages) setMessages((cur) => (cur.length === r.messages!.length && cur[cur.length - 1]?.id === r.messages![r.messages!.length - 1]?.id ? cur : r.messages!))
    }
    void load(true)
    const t = setInterval(() => !document.hidden && void load(false), 4_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [hub.id, activeId])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, activeId])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? threads.filter((t) => t.name.toLowerCase().includes(q) || t.last.toLowerCase().includes(q)) : threads
  }, [threads, query])

  const guestMatches = useMemo(() => {
    const q = guestQuery.trim().toLowerCase()
    return (q ? guests.filter((g) => g.name.toLowerCase().includes(q)) : guests).slice(0, 50)
  }, [guests, guestQuery])

  const unread = threads.filter((t) => t.unread).length

  function open(id: string, name: string) {
    setActive({ id, name })
    setMessages([])
    setDraft('')
    setError('')
    setConfirmDelete(false)
    setThreads((cur) => cur.map((t) => (t.id === id ? { ...t, unread: false } : t)))
  }

  async function send() {
    const text = draft.trim()
    if (!text || !active || sending) return
    setSending(true)
    setError('')
    // A conversation started from the guest list has no name on it yet, so send the name along once.
    const isNew = !threads.some((t) => t.id === active.id)
    const r = await sendChatReplyAction(hub.id, active.id, text, isNew ? active.name : undefined)
    setSending(false)
    if (r.error) return setError(r.error)
    setDraft('')
    const [m, l] = await Promise.all([openChatAction(hub.id, active.id), listChatThreadsAction(hub.id)])
    if (m.messages) setMessages(m.messages)
    if (l.threads) setThreads(l.threads)
  }

  async function remove() {
    if (!active) return
    const r = await deleteChatAction(hub.id, active.id)
    if (r.error) return setError(r.error)
    setThreads((cur) => cur.filter((t) => t.id !== active.id))
    setActive(null)
    setMessages([])
    setConfirmDelete(false)
  }

  let lastDay = ''
  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[460px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_2px_8px_rgba(15,31,74,0.04)]">
      {/* Conversations */}
      <aside className={`${active ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-line md:w-[340px]`}>
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5">
          <div>
            <div className="text-sm font-bold text-ink">Guest Chat</div>
            <div className="text-[11px] text-ink3">{unread ? `${unread} unread` : 'All caught up'}</div>
          </div>
          <button type="button" onClick={() => setPicking(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-dim">
            <span aria-hidden="true" className="text-base leading-none">+</span> New message
          </button>
        </div>
        <div className="border-b border-line p-3">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
            <input type="search" aria-label="Search conversations" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations…" className="h-10 w-full rounded-xl border border-line2 bg-surface2 pl-9 pr-3 text-[13px] outline-none focus:border-brand" />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {shown.length === 0 && <li className="p-8 text-center text-[13px] text-ink3">{query ? 'No matching conversations.' : 'No guest messages yet.'}</li>}
          {shown.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => open(t.id, t.name)} aria-current={activeId === t.id ? 'true' : undefined} className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface2 ${activeId === t.id ? 'bg-[#eef4ff]' : ''}`}>
                <Avatar name={t.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-[13px] ${t.unread ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>{t.name}</span>
                    <span className="shrink-0 text-[10px] text-ink3" suppressHydrationWarning>{stamp(t.lastAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-xs ${t.unread ? 'font-semibold text-ink' : 'text-ink2'}`}>{t.last || 'No messages yet'}</span>
                    {t.unread && <span aria-label="Unread" className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Conversation */}
      <section className={`${active ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-ink3">
            <Icon name="mail" className="h-10 w-10" />
            <div className="text-sm font-semibold text-ink2">Select a conversation</div>
            <div className="text-[13px]">or start a new one with a registered guest.</div>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-line px-4 py-3">
              <button type="button" aria-label="Back to conversations" onClick={() => setActive(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink2 hover:bg-surface2 md:hidden">
                <Icon name="left" />
              </button>
              <Avatar name={active.name} size="h-10 w-10 text-xs" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink">{active.name}</div>
                <div className="truncate text-[11px] text-ink3">{hub.name}</div>
              </div>
              <button type="button" aria-label="Delete conversation" onClick={() => setConfirmDelete(true)} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink2 hover:bg-red-50 hover:text-red-700">
                <Icon name="trash" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface2 px-4 py-4" aria-live="polite">
              {loading && <p className="p-6 text-center text-xs text-ink3">Loading…</p>}
              {!loading && messages.length === 0 && <p className="p-6 text-center text-xs text-ink3">No messages yet. Say hello below.</p>}
              {messages.map((m) => {
                const label = day(m.at)
                const sep = label !== lastDay
                lastDay = label
                const mine = m.sender === 'admin'
                return (
                  <div key={m.id}>
                    {sep && (
                      <div className="my-3 text-center">
                        <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-semibold text-ink3" suppressHydrationWarning>{label}</span>
                      </div>
                    )}
                    <div className={`mb-3 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                        <div className="mb-1 text-[11px] text-ink3">{mine ? 'You (Staff)' : m.senderName || active.name}</div>
                        <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug ${mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-surface text-ink'}`}>{m.text}</div>
                        <div className="mt-1 text-[10px] text-ink3" suppressHydrationWarning>{stamp(m.at)}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottom} />
            </div>

            <footer className="border-t border-line p-3">
              {error && <p role="alert" className="mb-2 text-xs font-medium text-red-600">{error}</p>}
              <div className="flex items-end gap-2">
                <textarea
                  aria-label="Reply"
                  value={draft}
                  maxLength={2000}
                  rows={1}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  placeholder="Type a reply… (Enter to send, Shift+Enter for a new line)"
                  className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line2 bg-surface2 px-3.5 py-2.5 text-sm outline-none focus:border-brand"
                />
                <button type="button" onClick={() => void send()} disabled={sending || !draft.trim()} className="h-11 shrink-0 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dim disabled:cursor-not-allowed disabled:opacity-60">
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </footer>
          </>
        )}
      </section>

      <Modal open={picking} onClose={() => setPicking(false)} title="New message" subtitle="Choose a registered guest">
        <div className="mb-3 relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink2" />
          <input type="search" aria-label="Search guests" value={guestQuery} onChange={(e) => setGuestQuery(e.target.value)} placeholder="Search guests…" className="h-11 w-full rounded-xl border border-line2 bg-surface2 pl-9 pr-3 text-sm outline-none focus:border-brand" />
        </div>
        <ul className="max-h-72 overflow-y-auto rounded-xl border border-line">
          {guestMatches.length === 0 && <li className="p-6 text-center text-[13px] text-ink3">{guests.length ? 'No guests match.' : 'No registered guests yet.'}</li>}
          {guestMatches.map((g) => (
            <li key={g.key} className="border-b border-line last:border-0">
              <button
                type="button"
                onClick={() => {
                  open(g.key, g.name)
                  setPicking(false)
                  setGuestQuery('')
                }}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface2"
              >
                <Avatar name={g.name} size="h-9 w-9 text-xs" />
                <span className="truncate text-sm font-semibold text-ink">{g.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete conversation">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
          <p className="mb-3 text-[13px] font-medium text-red-700">Delete this conversation? This removes the entire message history and cannot be undone.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="h-10 flex-1 rounded-xl border border-line2 bg-surface text-sm font-semibold text-ink2">Cancel</button>
            <button type="button" onClick={() => void remove()} className="h-10 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700">Yes, delete</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
