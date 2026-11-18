/** Minimum password length enforced everywhere (login, signup, reset, change). */
export const MIN_PASSWORD_LENGTH = 10

/** Maximum password length to prevent DoS via oversized payloads. */
export const MAX_PASSWORD_LENGTH = 128

/**
 * bcrypt silently truncates at 72 BYTES, so a longer "password" is really just its
 * 72-byte prefix and two distinct secrets could compare equal. Creation paths cap by
 * byte length; signin keeps the 128-char DoS cap because a compare truncates both
 * sides identically, keeping legacy long passwords working.
 */
export const MAX_PASSWORD_BYTES = 72

/** The one shared complexity rule for new passwords (lower + upper + digit). */
export const PASSWORD_COMPLEXITY_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/

export function passwordWithinBcryptLimit(value: string): boolean {
  return new TextEncoder().encode(value).byteLength <= MAX_PASSWORD_BYTES
}

// Cryptographically random URL-safe token of `length` chars. base64url
// (RFC 4648 §5) → ~6 bits per char. The byte pool is oversized so the
// encoded output always reaches `length`, then sliced.
export function makeToken(length: number): string {
  if (length <= 0) {
    return ''
  }
  const byteCount = Math.ceil((length * 6) / 8)
  const bytes = new Uint8Array(byteCount)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '')
  return encoded.slice(0, length)
}

export async function encodedEmail(email: string): Promise<string> {
  const input = new TextEncoder().encode(email.trim().toLowerCase())
  const digest = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}
