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
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return encoded.slice(0, length)
}

export async function encodedEmail(email: string): Promise<string> {
  const input = new TextEncoder().encode(email.trim().toLowerCase())
  const digest = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

/** Escape the entities that matter for double-quoted attributes and text content — the single canonical implementation. */
export function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
