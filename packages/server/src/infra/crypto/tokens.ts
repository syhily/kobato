import { createHash, randomBytes } from 'node:crypto'

const TOKEN_BYTES = 32

export const TOKEN_LEN_RE = /^[A-Za-z0-9_-]{43}$/

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
