import { buildProxyHeaders } from '@kobato/sdk/proxy'
import { createKeyAuthSigner, type KeyAuthSigner } from '@kobato/sdk/signer'
import { createMiddleware } from 'hono/factory'

import { getVisitorAddress } from '@/lib/http/rpc-proxy'

/**
 * Same-origin POST /webmention proxy (headless phase 2).
 *
 * W3C webmention senders POST `source` + `target` (form-encoded) to the
 * site's canonical domain — which the frontend serves. Core owns the
 * receive endpoint (`packages/server/src/http/resources/webmention.ts`,
 * the 202/400/410/413 semantics, the per-IP rate limit, and the async
 * inbox enqueue), so the frontend buffers the small form body and
 * forwards it to `${coreBase}/webmention`.
 *
 *   - Body cap: 16 KB — same ceiling as core's `dynamicBodyLimit` on the
 *     route. The declared `content-length` is checked up front; a body
 *     without a length is buffered and measured (`TextEncoder` — the cap
 *     is on bytes, not chars). Oversize → 413, never forwarded.
 *   - Identity: with a frontend key the request carries the phase-0.6
 *     proxy header family (EdDSA JWT, scope `content:write`) plus the
 *     visitor address derived exactly like the `/rpc` write proxy
 *     (forwarding headers honoured only when the direct TCP peer is
 *     loopback — see `getVisitorAddress`). Core buckets the webmention
 *     rate limit by the forwarded IP only behind a valid key.
 *   - Without a key the request is forwarded ANONYMOUSLY — an acceptable
 *     degradation (webmention receive is open by protocol design; the
 *     abuse load is core's rate limit + moderation queue), but core then
 *     ignores every forwarding header and sees the frontend's own
 *     connection.
 *
 * The core response (202 accepted, 400 invalid, 410 receive disabled,
 * 413 too large, 429 rate-limited, …) is relayed verbatim.
 */

export interface WebmentionProxyOptions {
  /** Core base URL (`CORE_API_URL`) — `/webmention` is appended. */
  coreApiUrl: string | null
  /** Frontend Ed25519 private key (PEM). `null` disables JWT signing. */
  privateKeyPem: string | null
  /** Registered key id (`iss` claim). */
  keyId: string | null
}

/** Same ceiling as core's receive route (`MAX_FORM_BODY_BYTES`). */
const MAX_FORM_BODY_BYTES = 16 * 1024

export function createWebmentionProxy(options: WebmentionProxyOptions) {
  const trimmed = options.coreApiUrl?.trim()
  const coreBase = trimmed !== undefined && trimmed !== '' ? trimmed.replace(/\/+$/, '') : null
  const signer: KeyAuthSigner | null =
    options.privateKeyPem !== null && options.privateKeyPem !== '' && options.keyId !== null && options.keyId !== ''
      ? createKeyAuthSigner(options.privateKeyPem, options.keyId)
      : null

  return createMiddleware(async (c) => {
    if (coreBase === null) {
      return c.text('Core is not configured — webmention receive is unavailable', 503)
    }

    // 16 KB cap, checked before any buffering when the length is
    // declared. A chunked body without a length is buffered and measured
    // below — the cap can never be bypassed by omitting the header. The
    // rejection body matches core's `dynamicBodyLimit` onError shape so
    // a protocol peer sees the same 413 either way.
    const declared = c.req.header('content-length')
    if (declared !== undefined && Number(declared) > MAX_FORM_BODY_BYTES) {
      return c.json({ error: { message: 'Payload too large' } }, 413)
    }
    let body: string
    try {
      body = await c.req.text()
    } catch {
      return c.json({ error: { message: 'Could not read the request body' } }, 400)
    }
    if (new TextEncoder().encode(body).byteLength > MAX_FORM_BODY_BYTES) {
      return c.json({ error: { message: 'Payload too large' } }, 413)
    }

    const headers = new Headers()
    // The wire format the sender chose (form-urlencoded in practice) —
    // core's `parseBody` trusts it.
    const contentType = c.req.header('content-type')
    if (contentType !== undefined) {
      headers.set('content-type', contentType)
    }
    // Plain UA relay so core's audit log records the sender even for
    // anonymous forwards (same discipline as the `/rpc` proxy).
    const userAgent = c.req.header('user-agent')
    if (userAgent !== undefined) {
      headers.set('user-agent', userAgent)
    }
    const proxyHeaders = buildProxyHeaders({
      jwt: signer !== null ? signer.sign({ scope: ['content:write'] }) : null,
      forwardedFor: signer !== null ? getVisitorAddress(c) : null,
      forwardedUserAgent: signer !== null ? (userAgent ?? null) : null,
    })
    for (const [name, value] of Object.entries(proxyHeaders)) {
      headers.set(name, value)
    }

    let upstream: Response
    try {
      upstream = await fetch(`${coreBase}/webmention`, { method: 'POST', headers, body, redirect: 'manual' })
    } catch {
      return c.text('Core is unreachable — the webmention could not be forwarded', 503)
    }

    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers })
  })
}
