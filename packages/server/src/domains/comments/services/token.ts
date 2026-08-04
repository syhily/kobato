import type { Database } from '@kobato/server/infra/db/database'
import type { CommentTokenCookie, CommentTokenCookieEntry } from '@kobato/shared/utils/comment-token'

import { oneTimeToken } from '@kobato/server/infra/db/schema/one-time-token'
import { getLogger } from '@kobato/server/infra/logger'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { isRecord } from '@kobato/shared/utils/type-guards'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

const log = getLogger('comments.token')

const TOKEN_KEY_PREFIX = 'comment:token:'

export interface CommentTokenPayload {
  commentId: string
  userId: string
  pageKey: string
  createdAt: number
}

function isCommentTokenPayload(value: unknown): value is CommentTokenPayload {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.commentId === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.pageKey === 'string' &&
    typeof value.createdAt === 'number'
  )
}

/**
 * Decode guard for `one_time_token` payloads. The row stores plain JSON
 * (superjson was dropped with the SQLite migration — the payload is all
 * strings and epoch-ms numbers), so writes pass the object straight to
 * Drizzle's JSON column; the guard runs after decode as a second-line
 * check against shape drift.
 */
function decodeTokenPayload(raw: unknown): CommentTokenPayload | null {
  try {
    if (!isCommentTokenPayload(raw)) {
      log.warn('Invalid comment token payload shape')
      return null
    }
    return raw
  } catch (error) {
    log.warn('Failed to parse comment token payload', { error })
    return null
  }
}

export async function issueCommentToken(
  db: Database,
  commentId: number | string,
  userId: number | string,
  pageKey: string,
  ttlSeconds?: number,
): Promise<string> {
  const token = randomUUID()
  const payload: CommentTokenPayload = {
    commentId: String(commentId),
    userId: String(userId),
    pageKey,
    createdAt: Date.now(),
  }
  const ttl = ttlSeconds ?? requireBlogSettingsSection('comments').comments.tokenTtlSeconds
  await db.insert(oneTimeToken).values({
    key: `${TOKEN_KEY_PREFIX}${token}`,
    payload,
    expiresAt: new Date(Date.now() + ttl * 1000),
  })
  return token
}

export async function verifyCommentToken(db: Database, token: string): Promise<CommentTokenPayload | null> {
  const rows = await db
    .select({ payload: oneTimeToken.payload })
    .from(oneTimeToken)
    .where(and(eq(oneTimeToken.key, `${TOKEN_KEY_PREFIX}${token}`), gt(oneTimeToken.expiresAt, new Date())))
    .limit(1)
  const row = rows[0]
  if (!row) {
    return null
  }
  return decodeTokenPayload(row.payload)
}

export async function revokeCommentToken(db: Database, token: string): Promise<void> {
  await db.delete(oneTimeToken).where(eq(oneTimeToken.key, `${TOKEN_KEY_PREFIX}${token}`))
}

/**
 * Clean up expired tokens from the cookie value by checking both the
 * per-token `expiresAt` field and the row's existence/expiry.
 * Returns the cleaned cookie payload and the list of still-valid tokens with payloads.
 */
export async function cleanupExpiredTokens(
  db: Database,
  cookie: CommentTokenCookie,
): Promise<{
  cleaned: CommentTokenCookie
  validEntries: Array<{ token: string; payload: CommentTokenPayload; expiresAt: number }>
}> {
  const cleaned: CommentTokenCookie = {}
  const validEntries: Array<{ token: string; payload: CommentTokenPayload; expiresAt: number }> = []
  const now = Date.now()

  // Collect all non-expired entries first so we can verify them in a
  // single query instead of N sequential round-trips.
  const candidates: Array<{ pageKey: string; entry: CommentTokenCookieEntry }> = []
  for (const [pageKey, entries] of Object.entries(cookie)) {
    for (const entry of entries) {
      if (entry.expiresAt > now) {
        candidates.push({ pageKey, entry })
      }
    }
  }

  if (candidates.length === 0) {
    return { cleaned, validEntries }
  }

  const keys = candidates.map((c) => `${TOKEN_KEY_PREFIX}${c.entry.token}`)
  const rows = await db
    .select({ key: oneTimeToken.key, payload: oneTimeToken.payload })
    .from(oneTimeToken)
    .where(and(inArray(oneTimeToken.key, keys), gt(oneTimeToken.expiresAt, new Date())))
  const payloadByKey = new Map(rows.map((row) => [row.key, row.payload]))

  for (const { pageKey, entry } of candidates) {
    const raw = payloadByKey.get(`${TOKEN_KEY_PREFIX}${entry.token}`)
    if (raw === undefined) {
      continue
    }
    const payload = decodeTokenPayload(raw)
    if (!payload) {
      continue
    }
    if (!cleaned[pageKey]) {
      cleaned[pageKey] = []
    }
    cleaned[pageKey]!.push(entry)
    validEntries.push({ token: entry.token, payload, expiresAt: entry.expiresAt })
  }

  return { cleaned, validEntries }
}

/**
 * Bounds for the commenter token jar. The whole jar rides in a single
 * cookie on every request, and browsers cap one cookie at ~4096 bytes
 * including name and attributes — an unbounded jar would eventually make
 * the browser drop the cookie (silently losing edit rights) or bloat
 * every request. Eviction drops the globally oldest entries first; the
 * freshly-issued token is always protected.
 */
const MAX_TOKEN_ENTRIES = 50
const MAX_COOKIE_JSON_BYTES = 3500

function serializedCookieSize(cookie: CommentTokenCookie): number {
  return encodeURIComponent(JSON.stringify(cookie)).length
}

/**
 * Remove the oldest entry (by `expiresAt`) from the jar, skipping the
 * protected token. Returns false when nothing evictable remains.
 */
function evictOldestEntry(cookie: CommentTokenCookie, protectToken: string): boolean {
  let oldest: { pageKey: string; index: number; expiresAt: number } | null = null
  for (const [pageKey, entries] of Object.entries(cookie)) {
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!
      if (entry.token === protectToken) {
        continue
      }
      if (!oldest || entry.expiresAt < oldest.expiresAt) {
        oldest = { pageKey, index, expiresAt: entry.expiresAt }
      }
    }
  }
  if (!oldest) {
    return false
  }
  const list = cookie[oldest.pageKey]!
  list.splice(oldest.index, 1)
  if (list.length === 0) {
    delete cookie[oldest.pageKey]
  }
  return true
}

/**
 * Build a new cookie payload by appending a freshly-issued token.
 * Enforces MAX_TOKEN_ENTRIES / MAX_COOKIE_JSON_BYTES by evicting the
 * oldest entries first; `cleanupExpiredTokens` stays the expiry-driven
 * cleanup path.
 */
export function appendCommentToken(
  existing: CommentTokenCookie,
  pageKey: string,
  token: string,
  ttlSeconds: number,
): CommentTokenCookie {
  // Deep-copy the entry lists so eviction below never mutates the
  // caller's cookie arrays (the record itself is re-created either way).
  const next: CommentTokenCookie = {}
  for (const [key, entries] of Object.entries(existing)) {
    next[key] = [...entries]
  }
  const list = next[pageKey] ?? []
  list.push({ token, expiresAt: Date.now() + ttlSeconds * 1000 })
  next[pageKey] = list

  let totalEntries = Object.values(next).reduce((count, entries) => count + entries.length, 0)
  while (totalEntries > MAX_TOKEN_ENTRIES || serializedCookieSize(next) > MAX_COOKIE_JSON_BYTES) {
    if (!evictOldestEntry(next, token)) {
      break
    }
    totalEntries--
  }
  return next
}

/**
 * Find the caller's valid token for the given comment, if any.
 * Returns the matching token (so callers can act on it, e.g. revoke)
 * or `null`, plus the cleaned cookie with expired and invalid entries
 * dropped.
 */
export async function verifyCommentOwnership(
  db: Database,
  cookie: CommentTokenCookie,
  commentId: string,
): Promise<{ token: string | null; cleaned: CommentTokenCookie }> {
  const { cleaned, validEntries } = await cleanupExpiredTokens(db, cookie)
  for (const entry of validEntries) {
    if (entry.payload.commentId === commentId) {
      return { token: entry.token, cleaned }
    }
  }
  return { token: null, cleaned }
}
