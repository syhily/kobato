import { randomUUID } from 'node:crypto'
import superjson from 'superjson'

import type { CommentTokenCookie, CommentTokenCookieEntry } from '@/shared/utils/comment-token'

import { getLogger } from '@/server/infra/logger'
import { redisInstance } from '@/server/infra/redis/storage'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { isRecord } from '@/shared/utils/type-guards'

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
 * Single codec for the Redis token keyspace. superjson both ways — the guard
 * runs after decode as a second-line check against shape drift.
 */
function encodeTokenPayload(payload: CommentTokenPayload): string {
  return superjson.stringify(payload)
}

function decodeTokenPayload(raw: string): CommentTokenPayload | null {
  try {
    const parsed: unknown = superjson.parse(raw)
    if (!isCommentTokenPayload(parsed)) {
      log.warn('Invalid comment token payload shape from Redis')
      return null
    }
    return parsed
  } catch (error) {
    log.warn('Failed to parse comment token payload from Redis', { error })
    return null
  }
}

export async function issueCommentToken(
  commentId: bigint | string,
  userId: bigint | string,
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
  const redis = redisInstance()
  await redis.set(`${TOKEN_KEY_PREFIX}${token}`, encodeTokenPayload(payload), 'EX', ttl)
  return token
}

export async function verifyCommentToken(token: string): Promise<CommentTokenPayload | null> {
  const redis = redisInstance()
  const raw = await redis.get(`${TOKEN_KEY_PREFIX}${token}`)
  if (!raw) {
    return null
  }
  return decodeTokenPayload(raw)
}

export async function revokeCommentToken(token: string): Promise<void> {
  const redis = redisInstance()
  await redis.del(`${TOKEN_KEY_PREFIX}${token}`)
}

/**
 * Clean up expired tokens from the cookie value by checking both the
 * per-token `expiresAt` field and the Redis key existence.
 * Returns the cleaned cookie payload and the list of still-valid tokens with payloads.
 */
export async function cleanupExpiredTokens(cookie: CommentTokenCookie): Promise<{
  cleaned: CommentTokenCookie
  validEntries: Array<{ token: string; payload: CommentTokenPayload; expiresAt: number }>
}> {
  const cleaned: CommentTokenCookie = {}
  const validEntries: Array<{ token: string; payload: CommentTokenPayload; expiresAt: number }> = []
  const now = Date.now()

  // Collect all non-expired entries first so we can verify them in a
  // single Redis MGET instead of N sequential round-trips.
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

  const redis = redisInstance()
  const keys = candidates.map((c) => `${TOKEN_KEY_PREFIX}${c.entry.token}`)
  const rawResults = await redis.mget(...keys)

  for (let i = 0; i < candidates.length; i++) {
    const { pageKey, entry } = candidates[i]!
    const raw = rawResults[i]
    if (typeof raw !== 'string') {
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
 * Build a new cookie payload by appending a freshly-issued token.
 */
export function appendCommentToken(
  existing: CommentTokenCookie,
  pageKey: string,
  token: string,
  ttlSeconds: number,
): CommentTokenCookie {
  const next: CommentTokenCookie = { ...existing }
  const list = next[pageKey] ? [...next[pageKey]] : []
  list.push({ token, expiresAt: Date.now() + ttlSeconds * 1000 })
  next[pageKey] = list
  return next
}

/**
 * Check whether the caller owns the given comment via a valid token.
 * Returns the cleaned cookie (for Set-Cookie refresh) and a boolean.
 */
export async function verifyCommentOwnership(
  cookie: CommentTokenCookie,
  commentId: string,
): Promise<{ ok: boolean; cleaned: CommentTokenCookie }> {
  const { cleaned, validEntries } = await cleanupExpiredTokens(cookie)
  for (const entry of validEntries) {
    if (entry.payload.commentId === commentId) {
      return { ok: true, cleaned }
    }
  }
  return { ok: false, cleaned }
}
