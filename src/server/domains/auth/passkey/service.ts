import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'

import {
  generateAuthenticationOptions as swaGenerateAuthenticationOptions,
  generateRegistrationOptions as swaGenerateRegistrationOptions,
  verifyAuthenticationResponse as swaVerifyAuthenticationResponse,
  verifyRegistrationResponse as swaVerifyRegistrationResponse,
} from '@simplewebauthn/server'
import { and, eq, gt } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { SafeUser } from '@/server/infra/db/operations/user'
import type { PasskeyCredentialRow } from '@/server/infra/db/types'
import type { LoginMethod } from '@/shared/contracts/users'

import { findSafeUserById, findUserByEmail } from '@/server/infra/db/operations/user'
import { oneTimeToken } from '@/server/infra/db/schema/one-time-token'
import { passkeyCredential } from '@/server/infra/db/schema/passkey'
import { user } from '@/server/infra/db/schema/user'
import { DomainError, isUniqueConstraintError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsBundle } from '@/shared/config/getters'
import { isValidPasskeyDomain, tryParseUrl } from '@/shared/utils/safe-url'
import { isRecord } from '@/shared/utils/type-guards'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('auth.passkey')

const CHALLENGE_TTL_SECONDS = 300
const REG_CHALLENGE_PREFIX = 'passkey:reg-challenge:'
const AUTH_CHALLENGE_PREFIX = 'passkey:auth-challenge:'

function rpConfig() {
  const bundle = requireBlogSettingsBundle()
  const website = bundle.siteIdentity?.website ?? ''
  const title = bundle.siteIdentity?.title ?? 'Kobato'
  const url = tryParseUrl(website)
  if (!url || !isValidPasskeyDomain(website)) {
    throw new DomainError('BAD_REQUEST', 'Passkey 需要公开可访问的 HTTPS 域名，不能使用 localhost 或私有地址。')
  }
  return { rpID: url.hostname, rpName: title, origin: website }
}

async function storeChallenge(
  db: Database,
  prefix: string,
  challenge: string,
  data: Record<string, unknown>,
): Promise<void> {
  // Plain JSON (superjson was dropped with the SQLite migration — the
  // challenge payloads are `{ userId, deviceName }` / `{ email }`).
  const payload = data
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000)
  await db
    .insert(oneTimeToken)
    .values({ key: `${prefix}${challenge}`, payload, expiresAt })
    .onConflictDoUpdate({
      target: oneTimeToken.key,
      set: { payload, expiresAt },
    })
}

/**
 * Atomic consume: a single `DELETE … RETURNING payload` removes the row
 * and returns its payload in one statement, so a challenge can never be
 * replayed under concurrency. Expired rows consume as misses.
 */
async function consumeChallenge(
  db: Database,
  prefix: string,
  challenge: string,
): Promise<Record<string, unknown> | null> {
  const key = `${prefix}${challenge}`
  try {
    const rows = await db
      .delete(oneTimeToken)
      .where(and(eq(oneTimeToken.key, key), gt(oneTimeToken.expiresAt, new Date())))
      .returning({ payload: oneTimeToken.payload })
    const payload = rows[0]?.payload
    // Rows written by `storeChallenge` carry the plain-JSON payload;
    // anything but an object reads as a miss.
    return isRecord(payload) ? payload : null
  } catch (error) {
    log.error('Failed to consume passkey challenge', { key, error })
    return null
  }
}

// ─── Registration ──────────────────────────────────────────

export interface RegistrationBeginResult {
  options: PublicKeyCredentialCreationOptionsJSON
}

export async function generateRegistrationOptions(
  db: Database,
  dbUser: SafeUser,
  deviceName?: string,
): Promise<RegistrationBeginResult> {
  const { rpID, rpName } = rpConfig()
  const existing = await db
    .select({ credentialId: passkeyCredential.credentialId, transports: passkeyCredential.transports })
    .from(passkeyCredential)
    .where(eq(passkeyCredential.userId, dbUser.id))

  const options = await swaGenerateRegistrationOptions({
    rpName,
    rpID,
    userName: dbUser.email,
    userDisplayName: dbUser.name || dbUser.email,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: unsafeCast<('ble' | 'hybrid' | 'internal' | 'nfc' | 'usb')[] | undefined>(c.transports) ?? [],
    })),
  })

  await storeChallenge(db, REG_CHALLENGE_PREFIX, options.challenge, {
    userId: String(dbUser.id),
    deviceName: deviceName ?? null,
  })

  return { options }
}

export interface RegistrationFinishInput {
  response: RegistrationResponseJSON
  deviceName?: string
  challenge: string
}

export async function verifyRegistrationResponse(
  db: Database,
  dbUser: SafeUser,
  input: RegistrationFinishInput,
): Promise<PasskeyCredentialRow> {
  const { rpID, origin } = rpConfig()

  const challengeData = await consumeChallenge(db, REG_CHALLENGE_PREFIX, input.challenge)
  if (!challengeData) {
    throw new DomainError('BAD_REQUEST', '注册挑战已过期或无效，请重试。')
  }
  if (challengeData.userId !== String(dbUser.id)) {
    throw new DomainError('BAD_REQUEST', '注册挑战与当前用户不匹配。')
  }

  const verification = await swaVerifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new DomainError('BAD_REQUEST', 'Passkey 注册验证失败。')
  }

  const { credential } = verification.registrationInfo

  try {
    const [inserted] = await db
      .insert(passkeyCredential)
      .values({
        userId: dbUser.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: Number(credential.counter),
        transports: unsafeCast<string[] | undefined>(credential.transports) ?? [],
        deviceName: input.deviceName ?? null,
        backedUp: verification.registrationInfo.credentialBackedUp ?? false,
      })
      .returning()

    if (!inserted) {
      throw new DomainError('INTERNAL', '保存 Passkey 凭据失败。')
    }
    return inserted
  } catch (err) {
    // Graceful duplicate handling
    if (isUniqueConstraintError(err)) {
      throw new DomainError('CONFLICT', '该 Passkey 凭据已注册。')
    }
    log.error('passkey registration insert failed', { err: err instanceof Error ? err.message : String(err) })
    throw new DomainError('INTERNAL', '保存 Passkey 凭据失败。')
  }
}

// ─── Authentication ────────────────────────────────────────

export interface AuthenticationBeginResult {
  options: PublicKeyCredentialRequestOptionsJSON
}

export async function generateAuthenticationOptions(db: Database, email?: string): Promise<AuthenticationBeginResult> {
  const { rpID } = rpConfig()

  let allowCredentials: { id: string; transports?: ('ble' | 'hybrid' | 'internal' | 'nfc' | 'usb')[] }[] | undefined
  if (email) {
    const targetUser = await findUserByEmail(db, email)
    if (targetUser) {
      const creds = await db
        .select({ credentialId: passkeyCredential.credentialId, transports: passkeyCredential.transports })
        .from(passkeyCredential)
        .where(eq(passkeyCredential.userId, targetUser.id))
      allowCredentials = creds.map((c) => ({
        id: c.credentialId,
        transports: unsafeCast<('ble' | 'hybrid' | 'internal' | 'nfc' | 'usb')[] | undefined>(c.transports) ?? [],
      }))
    }
  }

  const options = await swaGenerateAuthenticationOptions({
    rpID,
    allowCredentials: allowCredentials?.length ? allowCredentials : undefined,
    userVerification: 'required',
  })

  await storeChallenge(db, AUTH_CHALLENGE_PREFIX, options.challenge, {
    email: email ?? null,
  })

  return { options }
}

export interface AuthenticationFinishResult {
  user: SafeUser
  authMethod: string
}

export async function verifyAuthenticationResponse(
  db: Database,
  response: AuthenticationResponseJSON,
  challenge: string,
): Promise<AuthenticationFinishResult> {
  const { rpID, origin } = rpConfig()

  const challengeData = await consumeChallenge(db, AUTH_CHALLENGE_PREFIX, challenge)
  if (!challengeData) {
    throw new DomainError('BAD_REQUEST', '登录挑战已过期或无效，请重试。')
  }

  const credentialId = response.id
  const [cred] = await db
    .select()
    .from(passkeyCredential)
    .where(eq(passkeyCredential.credentialId, credentialId))
    .limit(1)

  if (!cred) {
    throw new DomainError('BAD_REQUEST', 'Passkey 凭据不存在。')
  }

  const verification = await swaVerifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKey),
      counter: cred.counter,
      transports: unsafeCast<('ble' | 'hybrid' | 'internal' | 'nfc' | 'usb')[] | undefined>(cred.transports) ?? [],
    },
    requireUserVerification: true,
  })

  if (!verification.verified) {
    throw new DomainError('BAD_REQUEST', 'Passkey 验证失败。')
  }

  // Verify user state BEFORE mutating the credential counter.
  const dbUser = await findSafeUserById(db, cred.userId)
  if (!dbUser || !dbUser.role || dbUser.deletedAt) {
    throw new DomainError('BAD_REQUEST', '账户状态异常，无法登录。')
  }

  // Update counter and timestamp
  await db
    .update(passkeyCredential)
    .set({ counter: Number(verification.authenticationInfo.newCounter), updatedAt: new Date() })
    .where(eq(passkeyCredential.id, cred.id))

  return { user: dbUser, authMethod: 'passkey' }
}

// ─── Credential management ─────────────────────────────────

export interface CredentialMeta {
  id: string
  deviceName: string | null
  createdAt: Date
  backedUp: boolean
}

export async function listCredentials(db: Database, userId: number): Promise<CredentialMeta[]> {
  const rows = await db
    .select({
      id: passkeyCredential.id,
      credentialId: passkeyCredential.credentialId,
      deviceName: passkeyCredential.deviceName,
      createdAt: passkeyCredential.createdAt,
      backedUp: passkeyCredential.backedUp,
    })
    .from(passkeyCredential)
    .where(eq(passkeyCredential.userId, userId))
    .orderBy(passkeyCredential.createdAt)

  return rows.map((r) => ({
    id: r.credentialId,
    deviceName: r.deviceName,
    createdAt: r.createdAt,
    backedUp: r.backedUp,
  }))
}

// Invariant: `loginMethod = 'passkey'` must not outlive credentials — a
// user whose method is passkey with zero passkeys would lock themselves
// out. Every credential-deletion path runs this check so callers inherit it.
async function revertMethodWhenNoCredentials(db: Database, userId: number): Promise<void> {
  const remaining = await db
    .select({ id: passkeyCredential.id })
    .from(passkeyCredential)
    .where(eq(passkeyCredential.userId, userId))
    .limit(1)
  if (remaining.length === 0) {
    await db
      .update(user)
      .set({ loginMethod: 'password' })
      .where(and(eq(user.id, userId), eq(user.loginMethod, 'passkey')))
  }
}

export async function deleteCredential(db: Database, credentialId: string, userId: number): Promise<boolean> {
  const result = await db
    .delete(passkeyCredential)
    .where(and(eq(passkeyCredential.credentialId, credentialId), eq(passkeyCredential.userId, userId)))
    .returning({ id: passkeyCredential.id })
  if (result.length === 0) {
    return false
  }
  await revertMethodWhenNoCredentials(db, userId)
  return true
}

export async function deleteAllCredentials(db: Database, userId: number): Promise<number> {
  const result = await db
    .delete(passkeyCredential)
    .where(eq(passkeyCredential.userId, userId))
    .returning({ id: passkeyCredential.id })
  await revertMethodWhenNoCredentials(db, userId)
  return result.length
}

export async function setLoginMethod(db: Database, userId: number, method: LoginMethod): Promise<void> {
  if (method === 'passkey') {
    const credentials = await db
      .select({ id: passkeyCredential.id })
      .from(passkeyCredential)
      .where(eq(passkeyCredential.userId, userId))
      .limit(1)
    if (credentials.length === 0) {
      throw new DomainError('BAD_REQUEST', '必须至少注册一个 Passkey 才能选择 Passkey 登陆。')
    }
  }
  await db.update(user).set({ loginMethod: method }).where(eq(user.id, userId))
}
