/**
 * Proxy-chain header assembly (phase 0.6 contract).
 *
 * A frontend proxying write interactions to core attaches exactly this
 * header family; core honours `X-Forwarded-*` ONLY behind a valid key
 * (see `frontendKeyAuth`), so anonymous forged headers are ignored.
 */

export interface ProxyHeadersInput {
  /** EdDSA JWT signed with the frontend's registered key. */
  jwt: string
  /** Visitor comment token for the target page (see `token.ts`). */
  commentToken?: string | null
  /** Member session token (returned to the frontend at login handoff). */
  sessionToken?: string | null
  /** Visitor IP as seen by the frontend (best effort). */
  forwardedFor?: string | null
  /** Visitor user agent as seen by the frontend (best effort). */
  forwardedUserAgent?: string | null
}

export function buildProxyHeaders(input: ProxyHeadersInput): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${input.jwt}` }
  if (input.commentToken !== undefined && input.commentToken !== null && input.commentToken !== '') {
    headers['X-Kobato-Comment-Token'] = input.commentToken
  }
  if (input.sessionToken !== undefined && input.sessionToken !== null && input.sessionToken !== '') {
    headers['X-Kobato-Session-Token'] = input.sessionToken
  }
  if (input.forwardedFor !== undefined && input.forwardedFor !== null && input.forwardedFor !== '') {
    headers['X-Forwarded-For'] = input.forwardedFor
  }
  if (input.forwardedUserAgent !== undefined && input.forwardedUserAgent !== null && input.forwardedUserAgent !== '') {
    headers['X-Forwarded-User-Agent'] = input.forwardedUserAgent
  }
  return headers
}
