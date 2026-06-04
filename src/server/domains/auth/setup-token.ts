import { randomBytes, timingSafeEqual } from 'node:crypto'

import { getLogger } from '@/server/infra/logger'
import { redisInstance } from '@/server/infra/redis/storage'

const log = getLogger('auth.setup-token')

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
  log.info('╔══════════════════════════════════════════════════════════════════╗')
  log.info('║  Setup token generated (valid until first admin is created):     ║')
  log.info(`║  ${token}  ║`)
  log.info('╚══════════════════════════════════════════════════════════════════╝')
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
