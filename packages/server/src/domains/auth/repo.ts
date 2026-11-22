import type { Role } from '@kobato/auth/roles'
import type { Database } from '@kobato/db/database'
import type { SessionRow } from '@kobato/db/types'

import {
  deleteSessionsOfUser as deleteSessionsOfUserOp,
  findLiveSessionRow,
  listLiveSessionRows,
  listLiveSessionRowsByUser,
  recordSessionActivity as recordSessionActivityOp,
  recordSessionLogin as recordSessionLoginOp,
  revokeSessionById as revokeSessionByIdOp,
} from '@kobato/db/operations/session'
import { resolveSessionMaxAge } from '@kobato/server/domains/auth/session-storage'

const USER_AGENT_MAX_LENGTH = 512

export interface SessionMeta {
  sid: string
  userId: number
  userAgent: string
  platformHint: string | null
  ip: string
  loginAt: Date
  lastActiveAt: Date
  expiresAt: Date
}

export interface SessionWithUser extends SessionMeta {
  userName: string
  userEmail: string
  userRole: Role | null
}

interface RecordLoginInput {
  sid: string
  userId: number
  userAgent: string | null
  platformHint?: string | null
  ip: string
  loginAt?: Date
}

function truncateUserAgent(ua: string | null): string {
  if (!ua) {
    return ''
  }
  return ua.length > USER_AGENT_MAX_LENGTH ? ua.slice(0, USER_AGENT_MAX_LENGTH) : ua
}

export async function recordSessionLogin(db: Database, input: RecordLoginInput): Promise<void> {
  const now = input.loginAt ?? new Date()
  await recordSessionLoginOp(db, {
    sid: input.sid,
    userAgent: truncateUserAgent(input.userAgent),
    platformHint: input.platformHint ?? null,
    ip: input.ip,
    loginAt: now,
    lastActiveAt: now,
  })
}

export function recordSessionActivity(db: Database, sid: string): void {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + resolveSessionMaxAge() * 1000)
  recordSessionActivityOp(db, sid, now, expiresAt)
}

function sessionRowToMeta(row: SessionRow | null | undefined): SessionMeta | null {
  if (!row || row.userId === null || row.loginAt === null || row.lastActiveAt === null) {
    return null
  }
  return {
    sid: row.id,
    userId: row.userId,
    userAgent: row.userAgent ?? '',
    platformHint: row.platformHint,
    ip: row.ip ?? '',
    loginAt: row.loginAt,
    lastActiveAt: row.lastActiveAt,
    expiresAt: row.expiresAt,
  }
}

export async function revokeSessionById(db: Database, sid: string, userId: number): Promise<void> {
  await revokeSessionByIdOp(db, sid, userId)
}

export async function findSessionMeta(db: Database, sid: string): Promise<SessionMeta | null> {
  return sessionRowToMeta(await findLiveSessionRow(db, sid))
}

export async function listLiveSessionsByUser(db: Database, userId: number): Promise<SessionMeta[]> {
  const rows = await listLiveSessionRowsByUser(db, userId)
  return rows.map(sessionRowToMeta).filter((meta): meta is SessionMeta => meta !== null)
}

export async function listLiveSessions(db: Database, maxRows: number): Promise<SessionMeta[]> {
  const rows = await listLiveSessionRows(db, maxRows)
  return rows.map(sessionRowToMeta).filter((meta): meta is SessionMeta => meta !== null)
}

export async function deleteSessionsOfUser(db: Database, userId: number, exceptSessionId?: string): Promise<number> {
  return deleteSessionsOfUserOp(db, userId, exceptSessionId)
}
