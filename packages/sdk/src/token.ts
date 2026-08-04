/**
 * Comment-token helpers for the proxy chain (`X-Kobato-Comment-Token`).
 *
 * The core issues per-page visitor tokens on the first comment submit and
 * returns the refreshed jar as a `Set-Cookie: __comment_tokens=…` response
 * header; the frontend replays it into its own first-party cookie and
 * echoes the current page's token back through this header on subsequent
 * proxy requests — no third-party cookies anywhere.
 *
 * The wire format mirrors `@kobato/shared/utils/comment-token` (a JSON map of
 * page key → entries): the SDK re-implements it standalone so the
 * published package never imports workspace internals; the contract test
 * pins the two sides to the same shape.
 */

export interface CommentTokenEntry {
  token: string
  expiresAt: number
}

/** Page key → issued tokens. */
export type CommentTokenJar = Record<string, CommentTokenEntry[]>

export function parseCommentTokenHeader(header: string | null): CommentTokenJar {
  if (header === null || header === '') {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(header))
    if (typeof parsed === 'object' && parsed !== null) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- wire shape pinned by the comment-token contract test; the published SDK cannot import workspace internals
      return parsed as CommentTokenJar
    }
  } catch {
    // malformed header — treat as empty
  }
  return {}
}

export function serializeCommentTokenHeader(jar: CommentTokenJar): string {
  return encodeURIComponent(JSON.stringify(jar))
}

/** Pick the freshest non-expired token for a page, if any. */
export function pickCommentToken(jar: CommentTokenJar, pageKey: string): string | null {
  const entries = jar[pageKey] ?? []
  const now = Date.now()
  for (const entry of entries) {
    if (entry.expiresAt * 1000 > now) {
      return entry.token
    }
  }
  return null
}
