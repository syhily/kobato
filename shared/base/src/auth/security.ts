export const MIN_PASSWORD_LENGTH = 10

export const MAX_PASSWORD_LENGTH = 128

export const MAX_PASSWORD_BYTES = 72

export const PASSWORD_COMPLEXITY_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/

export function passwordWithinBcryptLimit(value: string): boolean {
  return new TextEncoder().encode(value).byteLength <= MAX_PASSWORD_BYTES
}

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
