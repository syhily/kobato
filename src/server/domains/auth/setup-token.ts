import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { SuperJSONResult } from 'superjson'

import { and, eq, gt } from 'drizzle-orm'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import superjson from 'superjson'

import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { boxLog } from '@/server/infra/logger/box-console'
import { isRecord } from '@/shared/utils/type-guards'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const TOKEN_KEY = 'setup_token'
const TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

/** Local fast-path flag. In multi-instance deployments this is only
 * accurate on the instance that called invalidateSetupToken(); other
 * instances rely on the `one_time_token` row being absent. */
let tokenInvalidated = false

/** Read the live setup token row, or null when missing/expired. */
async function readSetupToken(db: NodePgDatabase): Promise<string | null> {
  const rows = await db
    .select({ payload: oneTimeToken.payload })
    .from(oneTimeToken)
    .where(and(eq(oneTimeToken.key, TOKEN_KEY), gt(oneTimeToken.expiresAt, new Date())))
    .limit(1)
  const payload = rows[0]?.payload
  // Rows written below always carry the superjson envelope
  // (`{ json, meta? }`); anything else reads as a miss.
  if (!isRecord(payload) || !('json' in payload)) {
    return null
  }
  try {
    const token = superjson.deserialize<string>(unsafeCast<SuperJSONResult>(payload))
    return typeof token === 'string' ? token : null
  } catch {
    return null
  }
}

/**
 * Generate (or retrieve) the one-time setup token used to authenticate
 * the initial setup-restore endpoint. The token is stored in Postgres so
 * multi-instance deployments share it; it is valid only until the first
 * admin is created.
 *
 * Security note: the full token is NEVER written to structured logs.
 * Only a SHA-256 hash prefix is logged for troubleshooting; the actual
 * token is returned to the caller (install wizard) so it can be shown
 * in the UI or TTY console without entering the logging pipeline.
 */
export async function getSetupToken(db: NodePgDatabase): Promise<string> {
  if (tokenInvalidated) {
    throw new Error('Setup token has been invalidated — an admin already exists')
  }
  let token = await readSetupToken(db)
  if (!token) {
    token = randomBytes(32).toString('hex')
    const payload = superjson.serialize(token)
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000)
    await db.insert(oneTimeToken).values({ key: TOKEN_KEY, payload, expiresAt }).onConflictDoUpdate({
      target: oneTimeToken.key,
      set: { payload, expiresAt },
    })
  }
  // Print the full token to stdout (not structured logs) so operators
  // can read it from the terminal or `docker logs` while the SHA-256
  // hash above is the only value that enters the logging pipeline.
  boxLog(['Setup token generated (valid until first admin is created):', token], { style: 'bold', align: 'center' })
  return token
}

/** Call after the first admin is created to invalidate the token. */
export async function invalidateSetupToken(db: NodePgDatabase): Promise<void> {
  tokenInvalidated = true
  await db.delete(oneTimeToken).where(eq(oneTimeToken.key, TOKEN_KEY))
}

/** Verify a setup token presented by the client. */
export async function verifySetupToken(db: NodePgDatabase, candidate: string): Promise<boolean> {
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

/** Check whether the setup token still exists (i.e. has not expired and
 * has not been invalidated). Used as a second layer of defense so a
 * stale session flag cannot bypass domain-level checks. */
export async function isSetupTokenActive(db: NodePgDatabase): Promise<boolean> {
  const token = await readSetupToken(db)
  return token !== null
}
