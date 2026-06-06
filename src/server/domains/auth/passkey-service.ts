import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import {
  generateAuthenticationOptions as swaGenerateAuthenticationOptions,
  generateRegistrationOptions as swaGenerateRegistrationOptions,
  verifyAuthenticationResponse as swaVerifyAuthenticationResponse,
  verifyRegistrationResponse as swaVerifyRegistrationResponse,
} from '@simplewebauthn/server'
import { and, eq, sql } from 'drizzle-orm'

import type { SafeUser } from '@/server/infra/db/operations/user'
import type { PasskeyCredentialRow } from '@/server/infra/db/types'

import { findUserByEmail, findUserById } from '@/server/infra/db/operations/user'
import { passkeyCredential } from '@/server/infra/db/schema/passkey'
import { user } from '@/server/infra/db/schema/user'
import { DomainError, isUniqueConstraintError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { redisInstance } from '@/server/infra/redis/storage'
import { requireBlogSettingsBundle } from '@/shared/config/getters'
import { isPrivateIp, tryParseUrl } from '@/shared/utils/safe-url'

const log = getLogger('auth.passkey')

const CHALLENGE_TTL_SECONDS = 300
const REG_CHALLENGE_PREFIX = 'passkey:reg-challenge:'
const AUTH_CHALLENGE_PREFIX = 'passkey:auth-challenge:'

function rpConfig() {
  const bundle = requireBlogSettingsBundle()
  const website = bundle.siteIdentity?.website ?? ''
  const title = bundle.siteIdentity?.title ?? 'Kobato'
  const url = tryParseUrl(website)
  if (!url) {
    throw new DomainError('BAD_REQUEST', '站点域名未配置，无法使用 Passkey。')
  }
  if (url.protocol !== 'https:') {
    throw new DomainError('BAD_REQUEST', 'Passkey 要求站点使用 HTTPS 协议。')
  }
  const rpID = url.hostname
  if (rpID === 'localhost' || rpID === '127.0.0.1' || rpID === '::1' || rpID === '[::1]' || isPrivateIp(rpID)) {
    throw new DomainError('BAD_REQUEST', 'Passkey 需要公开可访问的 HTTPS 域名，不能使用 localhost 或私有地址。')
  }
  return { rpID, rpName: title, origin: website }
}

async function storeChallenge(prefix: string, challenge: string, data: Record<string, unknown>): Promise<void> {
  const redis = redisInstance()
  await redis.set(`${prefix}${challenge}`, JSON.stringify(data), 'EX', CHALLENGE_TTL_SECONDS)
}

// Atomic GET-and-DELETE to prevent challenge replay under concurrency.
const CONSUME_CHALLENGE_LUA = `
local raw = redis.call('GET', KEYS[1])
if raw then
  redis.call('DEL', KEYS[1])
  return raw
end
return nil
`

async function consumeChallenge(prefix: string, challenge: string): Promise<Record<string, unknown> | null> {
  const redis = redisInstance()
  const key = `${prefix}${challenge}`
  try {
    // EVAL script numkeys key — traditional syntax is portable across
    // ioredis versions and test mocks.
    const raw = (await redis.eval(CONSUME_CHALLENGE_LUA, 1, key)) as string | null
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

// ─── Registration ──────────────────────────────────────────

export interface RegistrationBeginResult {
  options: PublicKeyCredentialCreationOptionsJSON
}

export async function generateRegistrationOptions(
  db: NodePgDatabase,
  dbUser: SafeUser,
  deviceName?: string,
): Promise<RegistrationBeginResult> {
  const { rpID, rpName } = rpConfig()
  const existing = await db
    .select({ credentialId: passkeyCredential.credentialId })
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
      transports: [] as ('ble' | 'hybrid' | 'internal' | 'nfc' | 'usb')[],
    })),
  })

  await storeChallenge(REG_CHALLENGE_PREFIX, options.challenge, {
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
  db: NodePgDatabase,
  dbUser: SafeUser,
  input: RegistrationFinishInput,
): Promise<PasskeyCredentialRow> {
  const { rpID, origin } = rpConfig()

  const challengeData = await consumeChallenge(REG_CHALLENGE_PREFIX, input.challenge)
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
        transports: (credential.transports as string[] | undefined) ?? [],
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

export async function generateAuthenticationOptions(
  db: NodePgDatabase,
  email?: string,
): Promise<AuthenticationBeginResult> {
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
        transports: (c.transports as ('ble' | 'hybrid' | 'internal' | 'nfc' | 'usb')[] | undefined) ?? [],
      }))
    }
  }

  const options = await swaGenerateAuthenticationOptions({
    rpID,
    allowCredentials: allowCredentials?.length ? allowCredentials : undefined,
    userVerification: 'required',
  })

  await storeChallenge(AUTH_CHALLENGE_PREFIX, options.challenge, {
    email: email ?? null,
  })

  return { options }
}

export interface AuthenticationFinishResult {
  user: SafeUser
  authMethod: string
}

export async function verifyAuthenticationResponse(
  db: NodePgDatabase,
  response: AuthenticationResponseJSON,
  challenge: string,
): Promise<AuthenticationFinishResult> {
  const { rpID, origin } = rpConfig()

  const challengeData = await consumeChallenge(AUTH_CHALLENGE_PREFIX, challenge)
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
      transports: (cred.transports as ('ble' | 'hybrid' | 'internal' | 'nfc' | 'usb')[] | undefined) ?? [],
    },
    requireUserVerification: true,
  })

  if (!verification.verified) {
    throw new DomainError('BAD_REQUEST', 'Passkey 验证失败。')
  }

  // Update counter and timestamp
  await db
    .update(passkeyCredential)
    .set({ counter: Number(verification.authenticationInfo.newCounter), updatedAt: new Date() })
    .where(eq(passkeyCredential.id, cred.id))

  const dbUser = await findUserById(db, cred.userId)
  if (!dbUser || !dbUser.role || dbUser.deletedAt) {
    throw new DomainError('BAD_REQUEST', '账户状态异常，无法登录。')
  }

  // Return SafeUser shape
  const { password: _p, lastIp: _li, lastUa: _lu, ...safeUser } = dbUser
  return { user: safeUser as SafeUser, authMethod: 'passkey' }
}

// ─── Credential management ─────────────────────────────────

export interface CredentialMeta {
  id: string
  deviceName: string | null
  createdAt: Date
  backedUp: boolean
}

export async function listCredentials(db: NodePgDatabase, userId: bigint): Promise<CredentialMeta[]> {
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

export async function deleteCredential(db: NodePgDatabase, credentialId: string, userId: bigint): Promise<boolean> {
  const result = await db
    .delete(passkeyCredential)
    .where(and(eq(passkeyCredential.credentialId, credentialId), eq(passkeyCredential.userId, userId)))
    .returning({ id: passkeyCredential.id })
  return result.length > 0
}

export async function deleteAllCredentials(db: NodePgDatabase, userId: bigint): Promise<number> {
  const result = await db
    .delete(passkeyCredential)
    .where(eq(passkeyCredential.userId, userId))
    .returning({ id: passkeyCredential.id })
  return result.length
}

export async function countCredentials(db: NodePgDatabase, userId: bigint): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(passkeyCredential)
    .where(eq(passkeyCredential.userId, userId))
  return rows[0]?.count ?? 0
}

export async function setPasskeyForce(db: NodePgDatabase, userId: bigint, force: boolean): Promise<void> {
  await db.update(user).set({ passkeyForce: force }).where(eq(user.id, userId))
}

export async function getPasskeyForce(db: NodePgDatabase, userId: bigint): Promise<boolean> {
  const rows = await db.select({ passkeyForce: user.passkeyForce }).from(user).where(eq(user.id, userId)).limit(1)
  return rows[0]?.passkeyForce ?? false
}
