import { and, eq, gt } from 'drizzle-orm'
import { randomBytes, timingSafeEqual } from 'node:crypto'

import type { Database } from '@/server/infra/db/database'

import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { boxLog } from '@/server/infra/logger/box-console'

const TOKEN_KEY = 'setup_token'
const TTL_SECONDS = 7 * 24 * 60 * 60

/** Local fast-path flag; multi-instance correctness relies on the DB row. */
let tokenInvalidated = false

async function readSetupToken(db: Database): Promise<string | null> {
  const rows = await db
    .select({ payload: oneTimeToken.payload })
    .from(oneTimeToken)
    .where(and(eq(oneTimeToken.key, TOKEN_KEY), gt(oneTimeToken.expiresAt, new Date())))
    .limit(1)
  const payload = rows[0]?.payload
  // Rows carry the plain-JSON token string; anything else reads as a miss.
  try {
    return typeof payload === 'string' ? payload : null
  } catch {
    return null
  }
}

/**
 * Generate (or retrieve) the one-time setup token; valid only until the
 * first admin is created. Never written to structured logs — stdout and
 * the caller (install wizard) only.
 */
export async function getSetupToken(db: Database): Promise<string> {
  if (tokenInvalidated) {
    throw new Error('Setup token has been invalidated — an admin already exists')
  }
  let token = await readSetupToken(db)
  if (!token) {
    token = randomBytes(32).toString('hex')
    const payload = token
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000)
    await db.insert(oneTimeToken).values({ key: TOKEN_KEY, payload, expiresAt }).onConflictDoUpdate({
      target: oneTimeToken.key,
      set: { payload, expiresAt },
    })
  }
  boxLog(['Setup token generated (valid until first admin is created):', token], { style: 'bold', align: 'center' })
  return token
}

/** Call after the first admin is created to invalidate the token. */
export async function invalidateSetupToken(db: Database): Promise<void> {
  tokenInvalidated = true
  await db.delete(oneTimeToken).where(eq(oneTimeToken.key, TOKEN_KEY))
}

/** Test seam: reset the process-local invalidation flag. */
export function __resetSetupTokenForTests(): void {
  tokenInvalidated = false
}

export async function verifySetupToken(db: Database, candidate: string): Promise<boolean> {
  if (tokenInvalidated) {
    return false
  }
  const token = await readSetupToken(db)
  if (!token) {
    return false
  }
  if (candidate.length !== token.length) {
    return false
  }
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(token))
}

/** Second layer of defense: true only while the row still exists. */
export async function isSetupTokenActive(db: Database): Promise<boolean> {
  const token = await readSetupToken(db)
  return token !== null
}
