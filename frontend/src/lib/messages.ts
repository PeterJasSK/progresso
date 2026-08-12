// Typed wrappers over the chat API (P8 §5.8). Screens never inline fetch logic.
// The thread is `since`-incremental (fetch only newer messages, never re-fetch the
// whole thread); it is not paginated (the `since` window bounds it).
import { api } from './api'

export interface Message {
  id: number
  sender: number
  receiver: number
  content: string
  created_at: string
  read_at: string | null
  // sender === the current user — the SPA aligns bubbles by this.
  mine: boolean
}

// The thread with `withUserId`. Pass `since` (an ISO timestamp) to get only
// strictly-newer messages; omit it for the initial load (last 200).
export function listThread(withUserId: number, since?: string): Promise<Message[]> {
  const q = since
    ? `?with=${withUserId}&since=${encodeURIComponent(since)}`
    : `?with=${withUserId}`
  return api.get<Message[]>(`/messages${q}`)
}

export function sendMessage(to: number, content: string): Promise<Message> {
  return api.post<Message>('/messages', { to, content })
}

// Mark the thread with `withUserId` read once (sets read_at on unread inbound).
export function markRead(withUserId: number): Promise<{ updated: number }> {
  return api.post<{ updated: number }>('/messages/read', { with: withUserId })
}
