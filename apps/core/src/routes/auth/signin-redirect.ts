import { SESSION_COOKIE_NAME, SESSION_TOKEN_URL_PARAM } from '@kobato/shared/http/session-bridge'
import { isHttpUrl, safeRedirectPath } from '@kobato/shared/utils/safe-url'

/**
 * Cross-domain login handoff (headless stage 3, plan v6 §6). The signin
 * action owns the redirect channel; these two pure helpers implement the
 * allowlist gate + the token append. Both take `allowedOrigins` (the
 * `api.allowedOrigins` config value) as a parameter so they stay
 * unit-testable without the config graph.
 */

/**
 * Append the signed `__session` cookie VALUE to a cross-origin redirect
 * (`?session_token=…`) — the frontend root loader mirrors it into its
 * own-domain cookie. Only fires for origins in `allowedOrigins`; any
 * other target keeps the plain URL.
 */
export function toSessionBridgedRedirect(
  to: string,
  setCookie: string | undefined,
  origin: string,
  allowedOrigins: string[],
): string {
  if (setCookie === undefined) {
    return to
  }
  const cookieMatch = setCookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`))
  if (cookieMatch === null) {
    return to
  }
  const target = new URL(to, origin)
  if (!allowedOrigins.includes(target.origin)) {
    return to
  }
  target.searchParams.set(SESSION_TOKEN_URL_PARAM, cookieMatch[1]!)
  return target.toString()
}

/**
 * Resolve the login redirect target. Same-origin targets keep the
 * historical `safeRedirectPath` semantics (path-only); a cross-origin
 * `redirect_to` is honoured ONLY when its origin is in `allowedOrigins`
 * (the frontend handoff — the token gets appended after login completes).
 * Any other cross-origin value falls back like `safeRedirectPath` does.
 */
export function resolveLoginRedirect(
  value: string | null,
  fallback: string,
  origin: string,
  allowedOrigins: string[],
): string {
  if (value === null || value === undefined || value.trim() === '') {
    return fallback
  }
  const trimmed = value.trim()
  try {
    const target = new URL(trimmed, origin)
    if (target.origin !== new URL(origin).origin) {
      return isHttpUrl(trimmed) && allowedOrigins.includes(target.origin) ? target.toString() : fallback
    }
  } catch {
    return fallback
  }
  return safeRedirectPath(value, fallback, origin)
}
