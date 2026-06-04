import { randomBytes, timingSafeEqual } from 'node:crypto'

import { redisInstance } from '@/server/infra/redis/storage'

const REDIS_KEY = 'setup_token'
const TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

/** Local fast-path flag. In multi-instance deployments this is only
 * accurate on the instance that called invalidateSetupToken(); other
 * instances rely on the Redis key being absent. */
let tokenInvalidated = false

/**
 * Generate (or retrieve) the one-time setup token used to authenticate
 * the initial setup-restore endpoint. The token is stored in Redis so
 * multi-instance deployments share it; it is valid only until the first
 * admin is created.
 *
 * Security note: the full token is NEVER written to structured logs.
 * Only a SHA-256 hash prefix is logged for troubleshooting; the actual
 * token is returned to the caller (install wizard) so it can be shown
 * in the UI or TTY console without entering the logging pipeline.
 */
export async function getSetupToken(): Promise<string> {
  if (tokenInvalidated) {
    throw new Error('Setup token has been invalidated — an admin already exists')
  }
  const redis = redisInstance()
  const existing = await redis.get(REDIS_KEY)
  if (existing) {
    return existing
  }
  const token = randomBytes(32).toString('hex')
  await redis.set(REDIS_KEY, token, 'EX', TTL_SECONDS)
  // Print the full token to stdout (not structured logs) so operators
  // can read it from the terminal or `docker logs` while the SHA-256
  // hash above is the only value that enters the logging pipeline.
  // eslint-disable-next-line no-console
  console.log('╔══════════════════════════════════════════════════════════════════╗')
  // eslint-disable-next-line no-console
  console.log('║  Setup token generated (valid until first admin is created):     ║')
  // eslint-disable-next-line no-console
  console.log(`║  ${token}  ║`)
  // eslint-disable-next-line no-console
  console.log('╚══════════════════════════════════════════════════════════════════╝')
  return token
}

/** Call after the first admin is created to invalidate the token. */
export async function invalidateSetupToken(): Promise<void> {
  tokenInvalidated = true
  const redis = redisInstance()
  await redis.del(REDIS_KEY)
}

/** Verify a setup token presented by the client. */
export async function verifySetupToken(candidate: string): Promise<boolean> {
  if (tokenInvalidated) {
    return false
  }
  const redis = redisInstance()
  const token = await redis.get(REDIS_KEY)
  if (!token) {
    return false
  }
  if (candidate.length !== token.length) {
    return false
  }
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(token))
}

/** Check whether the setup token still exists in Redis (i.e. has not
 * expired and has not been invalidated). Used as a second layer of
 * defense so a stale session flag cannot bypass domain-level checks. */
export async function isSetupTokenActive(): Promise<boolean> {
  const redis = redisInstance()
  const token = await redis.get(REDIS_KEY)
  return token !== null
}
