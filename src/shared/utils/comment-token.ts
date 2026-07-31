import { z } from 'zod'

export const commentTokenEntrySchema = z.object({
  token: z.string(),
  expiresAt: z.number(),
})

export const commentTokenCookieSchema = z.record(z.string(), z.array(commentTokenEntrySchema))

export type CommentTokenCookieEntry = z.infer<typeof commentTokenEntrySchema>
export type CommentTokenCookie = z.infer<typeof commentTokenCookieSchema>

const COMMENT_TOKEN_COOKIE_NAME = '__comment_tokens'

export function parseCommentTokensCookie(cookieHeader: string | null): CommentTokenCookie {
  if (!cookieHeader) {
    return {}
  }
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COMMENT_TOKEN_COOKIE_NAME}=`))
  if (!match) {
    return {}
  }
  try {
    const raw = decodeURIComponent(match.slice(`${COMMENT_TOKEN_COOKIE_NAME}=`.length))
    const parsed: unknown = JSON.parse(raw)
    return commentTokenCookieSchema.parse(parsed)
  } catch {
    // malformed cookie — treat as empty
  }
  return {}
}

function cookieAttributes(maxAge: number): string {
  const parts = ['Path=/', 'SameSite=Lax', 'HttpOnly']
  // `Secure` only in production — over plain HTTP (local dev on a LAN
  // IP, TLS-less deployments) browsers refuse to store Secure cookies
  // and the commenter token jar would silently never persist. The
  // session and visitor cookies already follow this PROD-conditional
  // pattern.
  if (import.meta.env.PROD) {
    parts.push('Secure')
  }
  parts.push(`Max-Age=${maxAge}`)
  return parts.join('; ')
}

export function serializeCommentTokensCookie(payload: CommentTokenCookie): string {
  const value = encodeURIComponent(JSON.stringify(payload))
  const maxAge = 60 * 60 * 24 * 7
  return `${COMMENT_TOKEN_COOKIE_NAME}=${value}; ${cookieAttributes(maxAge)}`
}

export function clearCommentTokensCookie(): string {
  return `${COMMENT_TOKEN_COOKIE_NAME}=; ${cookieAttributes(0)}`
}
