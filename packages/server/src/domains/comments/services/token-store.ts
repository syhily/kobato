import type { Database } from '@kobato/db/sqlite/database'
import type {
  CommentTokenCookie,
  CommentTokenCookieEntry,
} from '@kobato/server/domains/comments/services/comment-token'

import { isRecord } from '@kobato/base/utils/type-guards'
import {
  findLiveOneTimeTokenPayloads,
  insertOneTimeToken,
  deleteOneTimeToken,
} from '@kobato/db/sqlite/operations/identity/otp'
import { getLogger } from '@kobato/server/infra/logger'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
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
  await insertOneTimeToken(db, {
    key: `${TOKEN_KEY_PREFIX}${token}`,
    payload,
    expiresAt: new Date(Date.now() + ttl * 1000),
  })
  return token
}

export async function revokeCommentToken(db: Database, token: string): Promise<void> {
  await deleteOneTimeToken(db, `${TOKEN_KEY_PREFIX}${token}`)
}

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
  const payloadByKey = await findLiveOneTimeTokenPayloads(db, keys)

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

const MAX_TOKEN_ENTRIES = 50
const MAX_COOKIE_JSON_BYTES = 3500

function serializedCookieSize(cookie: CommentTokenCookie): number {
  return encodeURIComponent(JSON.stringify(cookie)).length
}

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

export function appendCommentToken(
  existing: CommentTokenCookie,
  pageKey: string,
  token: string,
  ttlSeconds: number,
): CommentTokenCookie {
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
