import type { LoginMethod } from '@kobato/api/contracts/users'
import type { Database } from '@kobato/db/sqlite/database'
import type { SafeUser } from '@kobato/db/sqlite/operations/identity/user'
import type { PasskeyCredentialRow } from '@kobato/db/sqlite/types'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'

import { isValidPasskeyDomain } from '@kobato/auth/network'
import { isUniqueConstraintError } from '@kobato/db/sqlite/errors'
import { consumeLiveOneTimeToken, upsertOneTimeToken } from '@kobato/db/sqlite/operations/identity/otp'
import {
  deletePasskeyCredentialsAndMaybeRevertLogin,
  findPasskeyByCredentialId,
  insertPasskeyCredential,
  listCredentialIdsForUser,
  listCredentialMetasForUser,
  setUserLoginMethod,
  updatePasskeyCounter,
} from '@kobato/db/sqlite/operations/identity/passkey'
import { findSafeUserById, findUserByEmail } from '@kobato/db/sqlite/operations/identity/user'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { requireBlogSettingsBundle } from '@kobato/settings/getters'
import { tryParseUrl } from '@kobato/utils/safe-url'
import { isRecord } from '@kobato/utils/type-guards'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import {
  generateAuthenticationOptions as swaGenerateAuthenticationOptions,
  generateRegistrationOptions as swaGenerateRegistrationOptions,
  verifyAuthenticationResponse as swaVerifyAuthenticationResponse,
  verifyRegistrationResponse as swaVerifyRegistrationResponse,
} from '@simplewebauthn/server'

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
    throw new DomainError('BAD_REQUEST', descriptorFor('auth.passkey.error.httpsRequired'))
  }
  return { rpID: url.hostname, rpName: title, origin: website }
}

async function storeChallenge(
  db: Database,
  prefix: string,
  challenge: string,
  data: Record<string, unknown>,
): Promise<void> {
  const payload = data
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000)
  await upsertOneTimeToken(db, { key: `${prefix}${challenge}`, payload, expiresAt })
}

async function consumeChallenge(
  db: Database,
  prefix: string,
  challenge: string,
): Promise<Record<string, unknown> | null> {
  const key = `${prefix}${challenge}`
  try {
    const payload = await consumeLiveOneTimeToken(db, key)
    return isRecord(payload) ? payload : null
  } catch (error) {
    log.error('Failed to consume passkey challenge', { key, error })
    return null
  }
}

export interface RegistrationBeginResult {
  options: PublicKeyCredentialCreationOptionsJSON
}

export async function generateRegistrationOptions(
  db: Database,
  dbUser: SafeUser,
  deviceName?: string,
): Promise<RegistrationBeginResult> {
  const { rpID, rpName } = rpConfig()
  const existing = await listCredentialIdsForUser(db, dbUser.id)

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
    throw new DomainError('BAD_REQUEST', descriptorFor('auth.passkey.error.registrationChallengeExpired'))
  }
  if (challengeData.userId !== String(dbUser.id)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('auth.passkey.error.registrationChallengeMismatch'))
  }

  const verification = await swaVerifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new DomainError('BAD_REQUEST', descriptorFor('auth.passkey.error.registrationFailed'))
  }

  const { credential } = verification.registrationInfo

  try {
    const inserted = await insertPasskeyCredential(db, {
      userId: dbUser.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: unsafeCast<string[] | undefined>(credential.transports) ?? [],
      deviceName: input.deviceName ?? null,
      backedUp: verification.registrationInfo.credentialBackedUp ?? false,
    })

    if (!inserted) {
      throw new DomainError('INTERNAL', descriptorFor('auth.passkey.error.saveFailed'))
    }
    return inserted
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new DomainError('CONFLICT', descriptorFor('auth.passkey.error.alreadyRegistered'))
    }
    log.error('passkey registration insert failed', { err: err instanceof Error ? err.message : String(err) })
    throw new DomainError('INTERNAL', descriptorFor('auth.passkey.error.saveFailed'))
  }
}

export interface AuthenticationBeginResult {
  options: PublicKeyCredentialRequestOptionsJSON
}

export async function generateAuthenticationOptions(db: Database, email?: string): Promise<AuthenticationBeginResult> {
  const { rpID } = rpConfig()

  let allowCredentials: { id: string; transports?: ('ble' | 'hybrid' | 'internal' | 'nfc' | 'usb')[] }[] | undefined
  if (email) {
    const targetUser = await findUserByEmail(db, email)
    if (targetUser) {
      const creds = await listCredentialIdsForUser(db, targetUser.id)
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
    throw new DomainError('BAD_REQUEST', descriptorFor('auth.passkey.error.loginChallengeExpired'))
  }

  const credentialId = response.id
  const cred = await findPasskeyByCredentialId(db, credentialId)

  if (!cred) {
    throw new DomainError('BAD_REQUEST', descriptorFor('auth.passkey.error.credentialNotFound'))
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
    throw new DomainError('BAD_REQUEST', descriptorFor('auth.passkey.error.verifyFailedGeneric'))
  }

  const dbUser = await findSafeUserById(db, cred.userId)
  if (!dbUser?.role || dbUser.deletedAt) {
    throw new DomainError('BAD_REQUEST', descriptorFor('auth.signin.error.accountCannotSignIn'))
  }

  await updatePasskeyCounter(db, cred.id, verification.authenticationInfo.newCounter)

  return { user: dbUser, authMethod: 'passkey' }
}

export interface CredentialMeta {
  id: string
  deviceName: string | null
  createdAt: Date
  backedUp: boolean
}

export async function listCredentials(db: Database, userId: number): Promise<CredentialMeta[]> {
  const rows = await listCredentialMetasForUser(db, userId)

  return rows.map((r) => ({
    id: r.credentialId,
    deviceName: r.deviceName,
    createdAt: r.createdAt,
    backedUp: r.backedUp,
  }))
}

export async function deleteCredential(db: Database, credentialId: string, userId: number): Promise<boolean> {
  return deletePasskeyCredentialsAndMaybeRevertLogin(db, { credentialId, userId }) > 0
}

export async function deleteAllCredentials(db: Database, userId: number): Promise<number> {
  return deletePasskeyCredentialsAndMaybeRevertLogin(db, { userId })
}

export async function setLoginMethod(db: Database, userId: number, method: LoginMethod): Promise<void> {
  if (method === 'passkey') {
    const outcome = setUserLoginMethod(db, userId, method)
    if (!outcome.ok) {
      throw new DomainError('BAD_REQUEST', descriptorFor('auth.passkey.error.requireOne'))
    }
    return
  }
  setUserLoginMethod(db, userId, method)
}
