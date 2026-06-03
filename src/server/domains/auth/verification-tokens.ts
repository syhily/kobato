import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq, lt, sql } from 'drizzle-orm'
import { createHash, randomBytes, randomInt } from 'node:crypto'

import { verification } from '@/server/infra/db/schema/user'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('verification-tokens')

const TOKEN_BYTES = 32
const RESET_TTL_MS = 15 * 60 * 1000
const SETUP_TTL_MS = 7 * 24 * 60 * 60 * 1000

// `randomBytes(TOKEN_BYTES=32).toString('base64url')` produces exactly
// 43 chars. Any input outside that length is by-construction not one
// of our tokens — fail fast before hitting the DB.
const TOKEN_LEN_RE = /^[A-Za-z0-9_-]{43}$/

// Purpose tags persisted to `verification.purpose`. The DB column is
// `varchar(32)` so the set has plenty of headroom for future flows
// (e.g. `'email-change'`), but new values must be added here so the
// type system catches typos at call sites.
export type TokenPurpose = 'password-reset' | 'author-invite' | 'signin-otp'

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export interface TokenResult {
  token: string
  expiresAt: Date
}

export async function issueResetToken(db: NodePgDatabase, userId: bigint): Promise<TokenResult> {
  return issueToken(db, userId, 'password-reset', RESET_TTL_MS)
}

export async function issueSetupToken(db: NodePgDatabase, userId: bigint): Promise<TokenResult> {
  return issueToken(db, userId, 'author-invite', SETUP_TTL_MS)
}

async function issueToken(
  db: NodePgDatabase,
  userId: bigint,
  purpose: TokenPurpose,
  ttlMs: number,
): Promise<TokenResult> {
  const raw = generateToken()
  const value = sha256(raw)
  const expiresAt = new Date(Date.now() + ttlMs)
  const id = generateToken().slice(0, 24)

  // Single-token-per-(purpose, user) invariant. The unique index
  // `uq_verification_purpose_user` enforces this; we use UPSERT to
  // rotate the live token in-place when an admin re-clicks
  // "发送邀请" without leaving stale rows behind.
  await db
    .insert(verification)
    .values({ id, purpose, userId, value, expiresAt })
    .onConflictDoUpdate({
      target: [verification.purpose, verification.userId],
      set: { id, value, expiresAt, updatedAt: new Date() },
    })

  return { token: raw, expiresAt }
}

interface ValidatedToken {
  userId: bigint
}

function validatedTokenRow(
  row: { purpose: string; userId: bigint; expiresAt: Date } | undefined,
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

/**
 * Read-only check that the token exists, has the expected purpose, and
 * is unexpired. Does NOT delete the row — callers in the loader use
 * this to short-circuit a form before the user submits a password.
 * The destructive {@link consumeToken} is reserved for the action.
 */
export async function peekToken(
  db: NodePgDatabase,
  rawToken: string,
  purpose: TokenPurpose,
): Promise<ValidatedToken | null> {
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

/**
 * Delete the row matching `rawToken` and return `{ userId }` if the row
 * exists, has the expected purpose, and is unexpired. Single-shot — a
 * subsequent call with the same token returns `null`.
 */
export async function consumeToken(
  db: NodePgDatabase,
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

export async function revokeTokensFor(db: NodePgDatabase, userId: bigint, purpose: TokenPurpose): Promise<void> {
  await db.delete(verification).where(and(eq(verification.purpose, purpose), eq(verification.userId, userId)))
}

export async function purgeExpired(db: NodePgDatabase): Promise<number> {
  const result = await db.delete(verification).where(lt(verification.expiresAt, sql`now() - interval '1 day'`))
  return result.rowCount ?? 0
}

// ── OTP (signin-otp) — separate path from generic tokens ───────────────────
// 6-digit numeric OTPs have too little entropy (~20 bits) to be safely
// stored as bare sha256 hashes.  We salt each OTP with a per-token
// random 16-byte hex string so an attacker who reads the DB cannot
// pre-compute a 1,000,000-entry rainbow table.

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

/**
 * Issue a 6-digit numeric OTP for login verification.
 * Stored as `salt:hash` in the `value` column; queried by
 * `(purpose='signin-otp', userId)` rather than by value.
 */
export async function issueOtpToken(db: NodePgDatabase, userId: bigint): Promise<OtpTokenResult> {
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

/**
 * Verify a raw 6-digit OTP code for the given user.
 * Looks up by `(purpose='signin-otp', userId)`, compares the salted
 * hash, and **deletes the row on success** (single-use).
 */
export async function verifyOtpToken(
  db: NodePgDatabase,
  userId: bigint,
  rawOtpCode: string,
): Promise<ValidatedToken | null> {
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: verification.id,
          userId: verification.userId,
          value: verification.value,
          expiresAt: verification.expiresAt,
        })
        .from(verification)
        .where(and(eq(verification.purpose, 'signin-otp'), eq(verification.userId, userId)))
        .limit(1)
        .for('update')

      const row = rows[0]
      if (!row) {
        return null
      }
      if (row.expiresAt.getTime() < Date.now()) {
        await tx.delete(verification).where(eq(verification.id, row.id))
        return null
      }

      const parts = row.value.split(':')
      if (parts.length !== 2) {
        return null
      }
      const [salt, storedHash] = parts
      if (hashOtp(rawOtpCode, salt) !== storedHash) {
        return null
      }

      await tx.delete(verification).where(eq(verification.id, row.id))
      return { userId: row.userId }
    })
  } catch (error) {
    log.error('verifyOtpToken failed', { error })
    return null
  }
}
