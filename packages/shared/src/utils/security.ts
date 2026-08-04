// Generate a cryptographically random URL-safe token of the requested
// character length. Uses base64url encoding (RFC 4648 §5) so each character
// contributes ~6 bits of entropy: a 64-char token therefore carries 384 bits.
//
// We oversize the random byte pool to `ceil(length * 6 / 8)` so the encoded
// output is always at least `length` characters, then slice to the exact
// requested width.
export function makeToken(length: number): string {
  if (length <= 0) {
    return ''
  }
  const byteCount = Math.ceil((length * 6) / 8)
  const bytes = new Uint8Array(byteCount)
  crypto.getRandomValues(bytes)
  // Standard base64 → base64url (urlsafe alphabet, no padding).
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

/**
 * Escape the four HTML entities that matter for double-quoted attribute
 * values and text content: `&`, `<`, `>` and `"`. Keep this the single
 * canonical implementation so security fixes only need to land in one place.
 */
export function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
