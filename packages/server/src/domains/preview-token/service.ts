import { serverConfig } from '@kobato/server/infra/config'
import { isRecord } from '@kobato/shared/utils/type-guards'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Draft-preview credentials (plan 0.5 §5, "preview 凭证化"): the
 * cross-domain deployment cannot carry the author's core session cookie
 * to core through the public frontend (the frontend transport strips
 * cookies by design), so draft-preview authorization rides a SHORT-LIVED
 * bearer token minted on the core domain (admin/author session present)
 * and carried in the preview URL (`?preview_token=…`).
 *
 * The token is ROLE-BOUND, not slug-bound: the minting session attests
 * the role (`author` may preview post drafts, `admin` post + page drafts
 * — enforced by the per-entity `canPreviewDraft` adapters at verify
 * time), and the editor can change the slug before the preview link is
 * followed without invalidating the token. Expiry is the only lifetime
 * gate (30 minutes, matching the "short-lived preview" contract).
 *
 * Signed with HMAC-SHA256 over the core session secret (no new key
 * material, no new dependencies). The value is a bearer credential —
 * treat it like a preview URL: shareable, expiring, unrevocable
 * individually (a revoked role / rotated session secret invalidates all
 * outstanding tokens).
 */

export const PREVIEW_TOKEN_TTL_SECONDS = 30 * 60

export interface PreviewTokenClaims {
  /** The minting session's role — the ONLY authority the token carries. */
  role: 'author' | 'admin'
  /** Absolute expiry (epoch seconds). */
  exp: number
}

const PAYLOAD_SEPARATOR = '.'

function encodePayload(claims: PreviewTokenClaims): string {
  return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
}

function decodePayload(encoded: string): PreviewTokenClaims | null {
  try {
    const raw = Buffer.from(encoded, 'base64url').toString('utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return null
    }
    if ((parsed['role'] !== 'author' && parsed['role'] !== 'admin') || typeof parsed['exp'] !== 'number') {
      return null
    }
    const exp = parsed['exp']
    if (!Number.isFinite(exp)) {
      return null
    }
    return { role: parsed['role'], exp }
  } catch {
    return null
  }
}

function sign(payload: string): string {
  // Same convention as the session cookie: the FIRST secret signs, the
  // rest (if any) only verify — rotation keeps old tokens valid.
  const secret = serverConfig.security.sessionSecret[0]
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function verifySignature(payload: string, signature: string): boolean {
  // Accept any configured secret (rotation window), not just the signer.
  for (const secret of serverConfig.security.sessionSecret) {
    const expected = createHmac('sha256', secret).update(payload).digest()
    const actual = Buffer.from(signature, 'base64url')
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      return true
    }
  }
  return false
}

/** Mint a role-bound preview token valid for `PREVIEW_TOKEN_TTL_SECONDS`. */
export function mintPreviewToken(role: 'author' | 'admin'): string {
  const payload = encodePayload({ role, exp: Math.floor(Date.now() / 1000) + PREVIEW_TOKEN_TTL_SECONDS })
  return `${payload}${PAYLOAD_SEPARATOR}${sign(payload)}`
}

/**
 * Verify a preview token. `null` on malformed input, bad signature,
 * unknown role, or expiry. NOTE: the caller must STILL apply the
 * per-entity role gate (`canPreviewDraft`) — the token only attests the
 * minting session's role.
 */
export function verifyPreviewToken(token: string): PreviewTokenClaims | null {
  const separatorIndex = token.lastIndexOf(PAYLOAD_SEPARATOR)
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return null
  }
  const payload = token.slice(0, separatorIndex)
  const signature = token.slice(separatorIndex + 1)
  if (!verifySignature(payload, signature)) {
    return null
  }
  const claims = decodePayload(payload)
  if (claims === null || claims.exp <= Math.floor(Date.now() / 1000)) {
    return null
  }
  return claims
}
