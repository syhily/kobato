import type { Database } from '@kobato/db/sqlite/database'

import { findLiveOneTimeToken, deleteOneTimeToken, upsertOneTimeToken } from '@kobato/db/sqlite/operations/identity/otp'
import { boxLog } from '@kobato/server/infra/logger/box-console'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const TOKEN_KEY = 'setup_token'
const TTL_SECONDS = 7 * 24 * 60 * 60

let tokenInvalidated = false

async function readSetupToken(db: Database): Promise<string | null> {
  const payload = await findLiveOneTimeToken(db, TOKEN_KEY)
  try {
    return typeof payload === 'string' ? payload : null
  } catch {
    return null
  }
}

export async function getSetupToken(db: Database): Promise<string> {
  if (tokenInvalidated) {
    throw new Error('Setup token has been invalidated — an admin already exists')
  }
  let token = await readSetupToken(db)
  if (!token) {
    token = randomBytes(32).toString('hex')
    const payload = token
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000)
    await upsertOneTimeToken(db, { key: TOKEN_KEY, payload, expiresAt })
  }
  boxLog(['Setup token generated (valid until first admin is created):', token], { style: 'bold', align: 'center' })
  return token
}

export async function invalidateSetupToken(db: Database): Promise<void> {
  tokenInvalidated = true
  await deleteOneTimeToken(db, TOKEN_KEY)
}

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

export async function isSetupTokenActive(db: Database): Promise<boolean> {
  const token = await readSetupToken(db)
  return token !== null
}

export async function liveSetupToken(db: Database): Promise<string | null> {
  return readSetupToken(db)
}

export function setupTokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
