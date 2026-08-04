import type { Database } from '@kobato/server/infra/db/database'

import { apiKey } from '@kobato/server/infra/db/schema/api-key'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { createPublicKey, randomUUID, verify } from 'node:crypto'

/**
 * Headless front-end credentials (phase 0.6): named Ed25519 public keys.
 * Core stores ONLY public keys; the private key never leaves the
 * front-end program. The front end signs short-lived JWTs
 * (`EdDSA`, `{ iss: key-id, scope, exp }`) which the write-interaction
 * proxy chain attaches as `Authorization: Bearer …`.
 *
 * Verification rules (plan 0.6-1):
 *   - exp ≤ 5 minutes, ±60 s clock-skew tolerance
 *   - scope gating — this round only `content:write`
 *   - rotation: register a new key → switch the frontend → revoke the old
 */

export const FRONTEND_KEY_MAX_EXP_SECONDS = 5 * 60
export const FRONTEND_KEY_CLOCK_SKEW_SECONDS = 60
export const FRONTEND_SCOPE_WRITE = 'content:write' as const

export interface ApiKeyRow {
  id: string
  name: string
  publicKey: string
  scopes: string[]
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

function toRow(row: typeof apiKey.$inferSelect): ApiKeyRow {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.publicKey,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  }
}

/** Register a new named key. The caller supplies the public key (SPKI PEM). */
export async function registerApiKey(db: Database, input: { name: string; publicKeyPem: string }): Promise<ApiKeyRow> {
  // Fail fast on an unparseable key — never store garbage the verifier
  // would trip over at request time.
  createPublicKey(input.publicKeyPem)
  const now = new Date()
  const row: typeof apiKey.$inferInsert = {
    id: randomUUID(),
    name: input.name,
    publicKey: input.publicKeyPem,
    scopes: [FRONTEND_SCOPE_WRITE],
    createdAt: now,
  }
  await db.insert(apiKey).values(row)
  return toRow({ ...row, lastUsedAt: null, revokedAt: null })
}

/** Revoke a key; a revoked key no longer verifies. */
export async function revokeApiKey(db: Database, id: string): Promise<boolean> {
  const rows = await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKey.id, id), isNull(apiKey.revokedAt)))
    .returning({ id: apiKey.id })
  return rows.length > 0
}

/** All keys, newest first (revoked included — audit surface). */
export async function listApiKeys(db: Database): Promise<ApiKeyRow[]> {
  const rows = await db.select().from(apiKey).orderBy(desc(apiKey.createdAt))
  return rows.map(toRow)
}

export interface VerifiedFrontendAuth {
  keyId: string
  scopes: string[]
}
/**
 * Verify a front-end JWT (`Authorization: Bearer <token>`).
 * Returns the key identity when the signature checks out, the key is
 * active, `iss`/`scope`/`exp` are well-formed and exp is within the
 * skew window; `null` otherwise. Updates `last_used_at` on success.
 */
export async function verifyFrontendJwt(db: Database, token: string): Promise<VerifiedFrontendAuth | null> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }
  const headerB64 = parts[0]
  const payloadB64 = parts[1]
  const signatureB64 = parts[2]
  // The length check above guarantees the split, but TS cannot narrow a
  // destructured `string[]`; guard once and the names stay `string` below.
  if (headerB64 === undefined || payloadB64 === undefined || signatureB64 === undefined) {
    return null
  }

  let header: { alg?: unknown; typ?: unknown }
  let payload: { iss?: unknown; scope?: unknown; exp?: unknown }
  try {
    // Only the envelope is asserted here — every claim is validated
    // field-by-field below (alg / iss / scope / exp).
    header = unsafeCast<typeof header>(JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')))
    payload = unsafeCast<typeof payload>(JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')))
  } catch {
    return null
  }

  // Only EdDSA (Ed25519) — anything else is rejected outright.
  if (header.alg !== 'EdDSA') {
    return null
  }
  if (typeof payload.iss !== 'string' || payload.iss === '') {
    return null
  }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return null
  }
  const scopes = Array.isArray(payload.scope) ? payload.scope.filter((s): s is string => typeof s === 'string') : []
  if (!scopes.includes(FRONTEND_SCOPE_WRITE)) {
    return null
  }

  // exp window: ≤ 5 min lifetime, ±60 s skew tolerance.
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (payload.exp > nowSeconds + FRONTEND_KEY_MAX_EXP_SECONDS + FRONTEND_KEY_CLOCK_SKEW_SECONDS) {
    return null
  }
  if (payload.exp < nowSeconds - FRONTEND_KEY_CLOCK_SKEW_SECONDS) {
    return null
  }

  const row = await db.select().from(apiKey).where(eq(apiKey.id, payload.iss)).limit(1)
  const key = row[0]
  if (key === undefined || key.revokedAt !== null) {
    return null
  }

  let publicKey
  try {
    publicKey = createPublicKey(key.publicKey)
  } catch {
    return null
  }

  const data = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8')
  const signature = Buffer.from(signatureB64, 'base64url')
  const valid = verify(null, data, publicKey, signature)
  if (!valid) {
    return null
  }

  await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, key.id))
  return { keyId: key.id, scopes }
}
