import type { Database } from '@kobato/db/database'

import { verification } from '@kobato/db/schema/user'
import { generateToken, sha256, TOKEN_LEN_RE } from '@kobato/server/infra/crypto/tokens'
import { getLogger } from '@kobato/server/infra/logger'
import { and, eq, lt } from 'drizzle-orm'
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

const log = getLogger('verification-tokens')

const RESET_TTL_MS = 15 * 60 * 1000
const SETUP_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type TokenPurpose = 'password-reset' | 'author-invite' | 'signin-otp' | 'signin-link'

export interface TokenResult {
  token: string
  expiresAt: Date
}

export function issueResetToken(db: Database, userId: number): TokenResult {
  return issueToken(db, userId, 'password-reset', RESET_TTL_MS)
}

export function issueSetupToken(db: Database, userId: number): TokenResult {
  return issueToken(db, userId, 'author-invite', SETUP_TTL_MS)
}

const SIGNIN_LINK_TTL_MS = 15 * 60 * 1000
export const SIGNIN_LINK_TTL_MINUTES = SIGNIN_LINK_TTL_MS / (60 * 1000)

export function issueSignInLinkToken(db: Database, userId: number): TokenResult {
  return issueToken(db, userId, 'signin-link', SIGNIN_LINK_TTL_MS)
}

function issueToken(db: Database, userId: number, purpose: TokenPurpose, ttlMs: number): TokenResult {
  const raw = generateToken()
  const value = sha256(raw)
  const expiresAt = new Date(Date.now() + ttlMs)
  const id = generateToken().slice(0, 24)

  db.insert(verification)
    .values({ id, purpose, userId, value, expiresAt })
    .onConflictDoUpdate({
      target: [verification.purpose, verification.userId],
      set: { id, value, expiresAt, updatedAt: new Date() },
    })
    .run()

  return { token: raw, expiresAt }
}

interface ValidatedToken {
  userId: number
}

function validatedTokenRow(
  row: { purpose: string; userId: number; expiresAt: Date } | undefined,
  purpose: TokenPurpose,
): ValidatedToken | null {
  if (!row) {
    return null
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return null
  }
  if (row.purpose !== purpose) {
    return null
  }
  return { userId: row.userId }
}

export async function peekToken(db: Database, rawToken: string, purpose: TokenPurpose): Promise<ValidatedToken | null> {
  if (!TOKEN_LEN_RE.test(rawToken)) {
    return null
  }
  const value = sha256(rawToken)
  try {
    const rows = await db
      .select({
        purpose: verification.purpose,
        userId: verification.userId,
        expiresAt: verification.expiresAt,
      })
      .from(verification)
      .where(eq(verification.value, value))
      .limit(1)
    return validatedTokenRow(rows[0], purpose)
  } catch (error) {
    log.error('peekToken failed', { error })
    return null
  }
}

export async function consumeToken(
  db: Database,
  rawToken: string,
  purpose: TokenPurpose,
): Promise<ValidatedToken | null> {
  if (!TOKEN_LEN_RE.test(rawToken)) {
    return null
  }
  const value = sha256(rawToken)
  try {
    const rows = await db.delete(verification).where(eq(verification.value, value)).returning({
      purpose: verification.purpose,
      userId: verification.userId,
      expiresAt: verification.expiresAt,
    })
    return validatedTokenRow(rows[0], purpose)
  } catch (error) {
    log.error('consumeToken failed', { error })
    return null
  }
}

export async function revokeTokensFor(db: Database, userId: number, purpose: TokenPurpose): Promise<void> {
  await db.delete(verification).where(and(eq(verification.purpose, purpose), eq(verification.userId, userId)))
}

export async function purgeExpired(db: Database): Promise<number> {
  const result = await db.delete(verification).where(lt(verification.expiresAt, new Date(Date.now() - 86_400_000)))
  return Number(result.changes)
}

export const OTP_TTL_MS = 5 * 60 * 1000
export const OTP_TTL_MINUTES = OTP_TTL_MS / (60 * 1000)

function generateOtpCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0')
}

function generateSalt(): string {
  return randomBytes(16).toString('hex')
}

function hashOtp(otpCode: string, salt: string): string {
  return createHash('sha256')
    .update(salt + otpCode)
    .digest('hex')
}

export interface OtpTokenResult {
  otpCode: string
  expiresAt: Date
}

export async function issueOtpToken(db: Database, userId: number): Promise<OtpTokenResult> {
  const otpCode = generateOtpCode()
  const salt = generateSalt()
  const value = `${salt}:${hashOtp(otpCode, salt)}`
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  const id = generateToken().slice(0, 24)

  await db
    .insert(verification)
    .values({ id, purpose: 'signin-otp', userId, value, expiresAt })
    .onConflictDoUpdate({
      target: [verification.purpose, verification.userId],
      set: { id, value, expiresAt, updatedAt: new Date() },
    })

  return { otpCode, expiresAt }
}

export async function verifyOtpToken(db: Database, userId: number, rawOtpCode: string): Promise<ValidatedToken | null> {
  try {
    return db.transaction((tx) => {
      const rows = tx
        .select({
          id: verification.id,
          userId: verification.userId,
          value: verification.value,
          expiresAt: verification.expiresAt,
        })
        .from(verification)
        .where(and(eq(verification.purpose, 'signin-otp'), eq(verification.userId, userId)))
        .limit(1)
        .all()

      const row = rows[0]
      if (!row) {
        return null
      }
      if (row.expiresAt.getTime() < Date.now()) {
        tx.delete(verification).where(eq(verification.id, row.id)).run()
        return null
      }

      const parts = row.value.split(':')
      if (parts.length !== 2) {
        return null
      }
      const [salt, storedHash] = parts
      const computedHash = hashOtp(rawOtpCode, salt)
      if (
        computedHash.length !== storedHash.length ||
        !timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash))
      ) {
        return null
      }

      tx.delete(verification).where(eq(verification.id, row.id)).run()
      return { userId: row.userId }
    })
  } catch (error) {
    log.error('verifyOtpToken failed', { error })
    return null
  }
}
