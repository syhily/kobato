import { randomBytes } from 'node:crypto'

import { getLogger } from '@/server/infra/logger'

const log = getLogger('auth.setup-token')

let setupToken: string | null = null
let tokenInvalidated = false

/**
 * Generate (or retrieve) the one-time setup token used to authenticate
 * the initial setup-restore endpoint.  The token is printed to the
 * console once; it is valid only until the first admin is created.
 */
export function getSetupToken(): string {
  if (tokenInvalidated) {
    throw new Error('Setup token has been invalidated — an admin already exists')
  }
  if (setupToken === null) {
    setupToken = randomBytes(32).toString('hex')
    log.info('╔══════════════════════════════════════════════════════════════════╗')
    log.info('║  Setup token generated (valid until first admin is created):     ║')
    log.info(`║  ${setupToken}  ║`)
    log.info('╚══════════════════════════════════════════════════════════════════╝')
  }
  return setupToken
}

/** Call after the first admin is created to invalidate the token. */
export function invalidateSetupToken(): void {
  tokenInvalidated = true
  setupToken = null
}

/** Verify a setup token presented by the client. */
export function verifySetupToken(candidate: string): boolean {
  if (tokenInvalidated || setupToken === null) {
    return false
  }
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(setupToken))
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!
  }
  return result === 0
}
