import type { Database } from '@kobato/db/database'
import type { VerificationPurpose } from '@kobato/db/operations/verification-token'

import {
  consumeSignInOtp,
  consumeVerificationByValue,
  findVerificationByValue,
  purgeExpiredVerifications,
  revokeVerificationsFor,
  upsertVerification,
} from '@kobato/db/operations/verification-token'
import { generateToken, sha256, TOKEN_LEN_RE } from '@kobato/server/infra/crypto/tokens'
import { getLogger } from '@kobato/server/infra/logger'
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

const log = getLogger('verification-tokens')

const RESET_TTL_MS = 15 * 60 * 1000
const SETUP_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type TokenPurpose = VerificationPurpose

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

/**
 * Mints the raw token plus its stored verification values (id + hashed value + expiry) for the author-invite
 * purpose WITHOUT writing — the persistence script (`inviteAuthorWithVerification`) inserts them transactionally.
 */
export function mintSetupTokenValues(): {
  raw: string
  id: string
  value: string
  expiresAt: Date
  updatedAt: Date
} {
  const raw = generateToken()
  return {
    raw,
    id: generateToken().slice(0, 24),
    value: sha256(raw),
    expiresAt: new Date(Date.now() + SETUP_TTL_MS),
    updatedAt: new Date(),
  }
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

  upsertVerification(db, {
    id,
    purpose,
    userId,
    value,
    expiresAt,
    updatedAt: new Date(),
  })

  return { token: raw, expiresAt }
}

interface ValidatedToken {
  userId: number
}

function validatedTokenRow(
  row: { purpose: string; userId: number; expiresAt: Date } | null,
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
    return validatedTokenRow(await findVerificationByValue(db, value), purpose)
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
    return validatedTokenRow(await consumeVerificationByValue(db, value), purpose)
  } catch (error) {
    log.error('consumeToken failed', { error })
    return null
  }
}

export async function revokeTokensFor(db: Database, userId: number, purpose: TokenPurpose): Promise<void> {
  await revokeVerificationsFor(db, userId, purpose)
}

export async function purgeExpired(db: Database): Promise<number> {
  return purgeExpiredVerifications(db, new Date(Date.now() - 86_400_000))
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

  upsertVerification(db, {
    id,
    purpose: 'signin-otp',
    userId,
    value,
    expiresAt,
    updatedAt: new Date(),
  })

  return { otpCode, expiresAt }
}

function otpMatches(rawOtpCode: string, storedValue: string): boolean {
  const parts = storedValue.split(':')
  if (parts.length !== 2) {
    return false
  }
  const [salt, storedHash] = parts
  const computedHash = hashOtp(rawOtpCode, salt)
  return (
    computedHash.length === storedHash.length && timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash))
  )
}

export async function verifyOtpToken(db: Database, userId: number, rawOtpCode: string): Promise<ValidatedToken | null> {
  try {
    return consumeSignInOtp(db, userId, (storedValue) => otpMatches(rawOtpCode, storedValue))
  } catch (error) {
    log.error('verifyOtpToken failed', { error })
    return null
  }
}
