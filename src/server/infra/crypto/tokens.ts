import { createHash, randomBytes } from 'node:crypto'

// Shared random-token primitives (auth verification tokens, newsletter
// double-opt-in confirm tokens). `randomBytes(TOKEN_BYTES=32).toString('base64url')`
// produces exactly 43 chars. Any input outside that length is
// by-construction not one of our tokens — fail fast before hitting the DB.
const TOKEN_BYTES = 32

export const TOKEN_LEN_RE = /^[A-Za-z0-9_-]{43}$/

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
