// Wire-format DTOs for the webmention-moderation endpoints. Lives in
// `@/shared` so both the server (admin controller output) and the client
// (mentions admin UI) can import the same shape without crossing the
// server/client boundary. Bigint ids and Dates are projected to
// strings/ISO — the oRPC JSON channel cannot carry either.

// Wire shape for the admin moderation list.
export interface AdminWebmentionWire {
  id: string
  sourceUrl: string
  targetUrl: string
  targetType: 'post' | 'page'
  status: 'pending' | 'approved' | 'rejected'
  authorName: string | null
  title: string | null
  summary: string | null
  fetchedAt: string | null
  createdAt: string
  moderatedAt: string | null
}
