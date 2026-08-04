import type { Context } from 'hono'

import { createKeyAuthSigner, type KeyAuthSigner } from '@kobato/sdk/signer'
import { parseCommentTokenHeader, serializeCommentTokenHeader } from '@kobato/sdk/token'
import { resolveProxyAddress } from '@kobato/shared/http/proxy-address'
import { SESSION_COOKIE_NAME, X_KOBATO_SESSION_TOKEN } from '@kobato/shared/http/session-bridge'
import { createMiddleware } from 'hono/factory'

/**
 * Same-origin `/rpc` write proxy (headless stage 3).
 *
 * The public pages' comment/like forms talk to the same-origin
 * `@kobato/client` oRPC client (`location.origin + '/rpc'`). Under the
 * two-service topology the frontend has no `/rpc` of its own — this
 * middleware is that endpoint: it forwards the browser's oRPC request to
 * core's `/rpc` mount with the phase-0.6 proxy header family attached.
 *
 * Identity bridging (no cookies are ever forwarded to core — a cookie
 * would trip core's CSRF guard and leak frontend-domain state):
 *
 *   - `Authorization: Bearer <jwt>` — a short-lived EdDSA JWT signed with
 *     the frontend's registered key (`KOBATO_FRONTEND_PRIVATE_KEY` +
 *     `KOBATO_FRONTEND_KEY_ID`). Without a key the proxy still forwards
 *     anonymous writes (comment creation is open), but core then ignores
 *     every forwarding header.
 *   - `X-Kobato-Comment-Token` — the visitor's `__comment_tokens` jar
 *     read from the frontend's first-party cookie and mirrored onto the
 *     header. Core merges it into its token jar ONLY behind a valid JWT
 *     (see `commentTokenCookie` in the server package's `http/orpc-base`), so
 *     guest identity continuity (edit / get-raw / my-comments) works
 *     cross-domain. Core's fresh-token `Set-Cookie` responses are relayed
 *     back and land on the frontend domain.
 *   - `X-Kobato-Session-Token` — the visitor's mirrored `__session`
 *     cookie (the login handoff bridge sets it on the frontend domain,
 *     see `shared/http/session-bridge`); core resolves the member session
 *     from it ONLY behind a valid JWT. The bridge is what makes member
 *     comments (name/email prefill, moderation) work cross-domain.
 *   - `X-Forwarded-For` / `X-Forwarded-User-Agent` — visitor IP and UA as
 *     seen by the frontend; core honours them only behind a valid key
 *     (rate-limit buckets, audit, comment metadata). The IP is derived by
 *     the proxy itself (operator proxy headers or the direct socket —
 *     never the browser-supplied header, which is freely forgeable); the
 *     UA is the browser's own.
 *
 * CSRF: the browser POST is same-origin (the frontend's own pages), and
 * the middleware rejects cross-origin requests carrying an `Origin`
 * header. Core sees a cookie-less request and its csrfGuard passes it via
 * the no-cookie rule — no token dance is needed on either side.
 *
 * The browser's `User-Agent` is also forwarded as the plain `user-agent`
 * header so core records honest UAs even for anonymous (key-less)
 * forwards.
 */

export interface RpcProxyOptions {
  /** Core base URL (`CORE_API_URL`) — the `/rpc` mount is appended. */
  coreApiUrl: string | null
  /** Frontend Ed25519 private key (PEM). `null` disables JWT signing. */
  privateKeyPem: string | null
  /** Registered key id (`iss` claim). */
  keyId: string | null
}

const COMMENT_TOKEN_COOKIE = '__comment_tokens'

/**
 * Whether the request's `Origin` matches the frontend's own origin.
 * `c.req.raw.url` derives its scheme from the socket protocol only, so a
 * TLS-terminating reverse proxy (nginx etc.) would present `http://site`
 * against a browser `https://site` Origin — `x-forwarded-proto` carries
 * the scheme the browser actually used. Cross-origin browser requests
 * cannot carry that header (preflight), so honouring it is safe.
 */
function isSameOrigin(c: Context, origin: string): boolean {
  const url = new URL(c.req.raw.url)
  const forwardedProto = c.req.header('x-forwarded-proto')
  const scheme = forwardedProto ? forwardedProto.split(',')[0]!.trim() : url.protocol.slice(0, -1)
  return origin === `${scheme}://${url.host}`
}

/** Browser headers forwarded verbatim (the frontend owns nothing else). */
const FORWARD_HEADERS = ['content-type', 'accept', 'accept-language', 'user-agent']

/** The visitor's socket address as seen by the frontend server. */
function getDirectRemoteAddress(c: Context): string | null {
  // Hono's `c.env` (the fetch env generic `E['Bindings']`) is untyped here;
  // the shape is defensive — the socket only exists when a plain http
  // server accepted the request, and every access is optional-chained.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return env?.incoming?.socket?.remoteAddress ?? null
}

/**
 * Visitor IP forwarded to core as `X-Forwarded-For` (honoured by core's
 * `frontendKeyAuth` only behind a valid frontend JWT). Same trust model as
 * core's `getClientAddress` — both import `@kobato/shared/http/proxy-address`
 * (the single source: forwarding headers are honoured ONLY when the direct
 * TCP peer is loopback, i.e. the operator's reverse proxy on the same host).
 * A remote browser can forge `X-Forwarded-For` freely — it is never
 * relayed as-is; the rightmost VALID chain entry is the one the nearest
 * trusted proxy appended. When no honest address is derivable the header
 * is omitted and core falls back to its own view of the connection.
 */
function getVisitorAddress(c: Context): string | null {
  const direct = getDirectRemoteAddress(c)
  return resolveProxyAddress(direct, {
    cfConnectingIp: c.req.header('cf-connecting-ip') ?? null,
    realIp: c.req.header('x-real-ip') ?? null,
    forwardedFor: c.req.header('x-forwarded-for') ?? null,
  })
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) {
    return null
  }
  const match = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return match ? match.slice(`${name}=`.length) : null
}

export function createRpcProxy(options: RpcProxyOptions) {
  const trimmed = options.coreApiUrl?.trim()
  const coreBase = trimmed !== undefined && trimmed !== '' ? trimmed.replace(/\/+$/, '') : null
  const signer: KeyAuthSigner | null =
    options.privateKeyPem !== null && options.privateKeyPem !== '' && options.keyId !== null && options.keyId !== ''
      ? createKeyAuthSigner(options.privateKeyPem, options.keyId)
      : null

  return createMiddleware(async (c) => {
    if (coreBase === null) {
      return c.json(
        { error: { message: 'CORE_API_URL is not configured — the frontend cannot proxy writes to core' } },
        502,
      )
    }

    // Cross-origin write rejection. Browsers always send `Origin` on
    // POST; a same-origin request matches the frontend's own origin and
    // passes, a cross-origin page cannot forge the header. Non-browser
    // clients (curl, SEA smoke) omit it and pass like any public write.
    // The scheme comes from `x-forwarded-proto` when the operator's
    // TLS-terminating proxy sets it — `c.req.raw.url` only knows the
    // socket protocol, and without this a browser's `https://site`
    // Origin would 403 against an `http://site` request URL.
    const origin = c.req.header('origin')
    if (origin !== undefined && !isSameOrigin(c, origin)) {
      return c.json({ error: { message: 'Cross-origin write requests are not allowed' } }, 403)
    }

    // Visitor token jar → header (only when a key is configured — without
    // a JWT core ignores the header, so sending it would be pointless).
    let commentToken: string | null = null
    if (signer !== null) {
      const jar = parseCommentTokenHeader(readCookie(c.req.header('cookie') ?? null, COMMENT_TOKEN_COOKIE))
      if (Object.keys(jar).length > 0) {
        commentToken = serializeCommentTokenHeader(jar)
      }
    }
    // Member session bridge → header: the visitor's frontend-domain
    // `__session` cookie (mirrored by the login-handoff bridge) is
    // relayed as `X-Kobato-Session-Token` so core can resolve the member
    // behind the JWT. Same bearer discipline as the token jar: only sent
    // when a key is configured, since core ignores it otherwise.
    const sessionToken = signer !== null ? readCookie(c.req.header('cookie') ?? null, SESSION_COOKIE_NAME) : null

    const headers = new Headers()
    for (const name of FORWARD_HEADERS) {
      const value = c.req.header(name)
      if (value !== undefined) {
        headers.set(name, value)
      }
    }
    if (signer !== null) {
      headers.set('Authorization', `Bearer ${signer.sign({ scope: ['content:write'] })}`)
      if (commentToken !== null) {
        headers.set('X-Kobato-Comment-Token', commentToken)
      }
      if (sessionToken !== null && sessionToken !== '') {
        headers.set(X_KOBATO_SESSION_TOKEN, sessionToken)
      }
      const visitorAddress = getVisitorAddress(c)
      if (visitorAddress !== null) {
        headers.set('X-Forwarded-For', visitorAddress)
      }
      const userAgent = c.req.header('user-agent')
      if (userAgent !== undefined) {
        headers.set('X-Forwarded-User-Agent', userAgent)
      }
    }

    const rawUrl = new URL(c.req.raw.url)
    const target = `${coreBase}${rawUrl.pathname}${rawUrl.search}`

    // Buffer the RPC envelope and send it with a concrete content-length
    // (same rationale as the SSR transport in `routes/public/client.ts`).
    const body = c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.text()

    let upstream: Response
    try {
      upstream = await fetch(target, { method: c.req.method, headers, body, redirect: 'manual' })
    } catch {
      return c.json({ error: { message: 'Core is unreachable — the write could not be forwarded' } }, 502)
    }

    // Relay the core response verbatim: status, body, and every header —
    // including the `Set-Cookie` lines that carry freshly issued comment
    // tokens (they land on the frontend domain, closing the guest
    // continuity loop) and `Retry-After` from rate-limit rejections.
    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers })
  })
}
