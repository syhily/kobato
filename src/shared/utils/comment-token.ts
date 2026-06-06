export interface CommentTokenCookieEntry {
  token: string
  expiresAt: number
}

export type CommentTokenCookie = Record<string, CommentTokenCookieEntry[]>

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
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as CommentTokenCookie
    }
  } catch {
    // malformed cookie — treat as empty
  }
  return {}
}

export function serializeCommentTokensCookie(payload: CommentTokenCookie): string {
  const value = encodeURIComponent(JSON.stringify(payload))
  const maxAge = 60 * 60 * 24 * 7
  return `${COMMENT_TOKEN_COOKIE_NAME}=${value}; Path=/; SameSite=Lax; Max-Age=${maxAge}`
}

export function clearCommentTokensCookie(): string {
  return `${COMMENT_TOKEN_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`
}
