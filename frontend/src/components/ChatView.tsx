// Shared 1:1 chat thread (P8 §5.8): a scrollable bubble list, a composer in the
// action bar, and a 10s incremental poll that advances `since` (never re-fetches
// the whole thread) and marks inbound read once. Consumed by both the trainee
// `/me/chat` and the trainer `/trainer/trainees/:id/chat` screens — only the
// counterpart id, title and nav differ (the ProgressView pattern, §11 Q7). No
// realtime (F2 is post-MVP).
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from './AppShell'
import { Button } from './Button'
import { Input } from './Input'
import { Spinner } from './Spinner'
import { ApiError } from '../lib/api'
import { listThread, markRead, sendMessage, type Message } from '../lib/messages'
import { formatDateTime } from '../i18n'

const POLL_MS = 10_000

function errorKey(err: unknown): string {
  return err instanceof ApiError ? err.key : 'unknown'
}

interface ChatViewProps {
  withUserId: number
  title: string
  nav: ReactNode
}

export function ChatView({ withUserId, title, nav }: ChatViewProps) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // Newest created_at we've seen — the `since` cursor for the next poll.
  const sinceRef = useRef<string | undefined>(undefined)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Merge newly-polled messages (de-dupe by id), advance the cursor, and mark
  // read once if any inbound arrived.
  const merge = useCallback(
    (incoming: Message[]) => {
      if (incoming.length === 0) return
      setMessages((prev) => {
        const seen = new Set((prev ?? []).map((m) => m.id))
        const fresh = incoming.filter((m) => !seen.has(m.id))
        return fresh.length ? [...(prev ?? []), ...fresh] : (prev ?? [])
      })
      sinceRef.current = incoming[incoming.length - 1].created_at
      if (incoming.some((m) => !m.mine)) void markRead(withUserId).catch(() => {})
    },
    [withUserId],
  )

  useEffect(() => {
    let active = true
    sinceRef.current = undefined
    setMessages(null)
    setError(null)

    listThread(withUserId)
      .then((initial) => {
        if (!active) return
        setMessages(initial)
        if (initial.length) {
          sinceRef.current = initial[initial.length - 1].created_at
        }
        if (initial.some((m) => !m.mine)) {
          void markRead(withUserId).catch(() => {})
        }
      })
      .catch((err) => active && setError(errorKey(err)))

    const id = setInterval(() => {
      listThread(withUserId, sinceRef.current)
        .then((incoming) => active && merge(incoming))
        .catch(() => {})
    }, POLL_MS)

    return () => {
      active = false
      clearInterval(id)
    }
  }, [withUserId, merge])

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    setError(null)
    try {
      const msg = await sendMessage(withUserId, content)
      setDraft('')
      setMessages((prev) => [...(prev ?? []), msg])
      sinceRef.current = msg.created_at
    } catch (err) {
      setError(errorKey(err))
    } finally {
      setSending(false)
    }
  }

  const composer = (
    <form onSubmit={handleSend} className="flex gap-2">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t('chat.placeholder')}
        className="flex-1"
        aria-label={t('chat.placeholder')}
      />
      <Button type="submit" disabled={sending || draft.trim() === ''}>
        {t('chat.send')}
      </Button>
    </form>
  )

  return (
    <AppShell actionBar={composer}>
      {nav}
      <h1 className="mb-4 font-display text-2xl font-bold text-heading">{title}</h1>

      {error && (
        <p className="mb-3 font-sans text-sm text-danger">{t(`errors.${error}`)}</p>
      )}

      {messages === null && !error && <Spinner />}

      {messages !== null && messages.length === 0 && (
        <p className="font-sans text-sm text-muted">{t('chat.empty')}</p>
      )}

      {messages !== null && messages.length > 0 && (
        <div className="flex flex-col gap-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                'max-w-[80%] rounded-lg px-3 py-2 ' +
                (m.mine
                  ? 'self-end bg-primary text-white'
                  : 'self-start bg-surface text-text')
              }
            >
              <p className="whitespace-pre-wrap break-words font-sans text-sm">
                {m.content}
              </p>
              <p
                className={
                  'mt-1 font-mono text-xs ' +
                  (m.mine ? 'text-white/70' : 'text-muted')
                }
              >
                {formatDateTime(m.created_at)}
              </p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </AppShell>
  )
}
