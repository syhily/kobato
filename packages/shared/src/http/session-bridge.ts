/**
 * Session-bridge contract (headless stage 3, plan v6+): the member
 * session credential that crosses the two-domain topology.
 *
 * The browser's core-domain `__session` cookie cannot reach core when the
 * public pages live on a different origin, so the frontend program relays
 * the visitor's OWN domain `__session` cookie to core as the
 * `X-Kobato-Session-Token` header on its /rpc proxy chain. Core resolves
 * the session from that header ONLY behind a valid frontend JWT (the same
 * trust rule as `X-Forwarded-*` — see `frontendKeyAuth`).
 *
 * Ownership: this module is the single writer/reader contract between
 * core (issuer + resolver), the frontend proxy (relay), and the SDK
 * (`buildProxyHeaders`). Never hardcode the cookie name, header name, or
 * URL parameter elsewhere.
 */

/** The browser cookie name on both domains (core sets it, the frontend mirrors it). */
export const SESSION_COOKIE_NAME = '__session'

/** The proxy-chain header carrying the signed session cookie value. */
export const X_KOBATO_SESSION_TOKEN = 'X-Kobato-Session-Token'

/** The URL parameter of the login handoff (`?session_token=<signed-value>`). */
export const SESSION_TOKEN_URL_PARAM = 'session_token'

/** Cookie lifetime the frontend mirror uses — must match core's `SESSION_MAX_AGE`. */
export const SESSION_MIRROR_MAX_AGE_SECONDS = 60 * 60 * 24 * 14
