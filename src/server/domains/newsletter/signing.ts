import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

import { serverConfig } from '@/server/infra/config'

// One-click unsubscribe URLs carry the subscriber id plus an HMAC-SHA256
// signature so they can't be forged or enumerated. The signing key is
// HKDF-derived from the deployment encryption key (same pattern as
// `infra/crypto/secret-encryption`) — no extra secret to provision, and a
// key rotation invalidates outstanding links, which is acceptable for a
// one-click action. The config is immutable per process, so the derived
// key is cached at module level.
const HKDF_SALT = 'kobato-newsletter-unsubscribe-salt'
const HKDF_INFO = 'newsletter-unsubscribe-signing-key'
const SIGNATURE_HEX_LEN = 64

let cachedKey: Buffer | undefined

function getSigningKey(): Buffer {
  if (cachedKey === undefined) {
    cachedKey = Buffer.from(hkdfSync('sha256', serverConfig.security.encryptionKey, HKDF_SALT, HKDF_INFO, 32))
  }
  return cachedKey
}

export function signUnsubscribeId(id: bigint): string {
  return createHmac('sha256', getSigningKey()).update(`newsletter-unsubscribe:${id.toString()}`).digest('hex')
}

export function verifyUnsubscribeSignature(id: bigint, signature: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(signature)) {
    return false
  }
  const expected = signUnsubscribeId(id)
  const received = Buffer.from(signature, 'utf8')
  const wanted = Buffer.from(expected, 'utf8')
  return received.length === SIGNATURE_HEX_LEN && wanted.length === received.length && timingSafeEqual(received, wanted)
}
