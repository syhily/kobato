/**
 * Reference implementation: the proxy chain for write interactions.
 *
 * This file is the minimal third-party frontend skeleton — the exact
 * flow the official frontend (apps/public) follows as dogfood. It is
 * intentionally small and reads against the SDK contracts
 * (`packages/sdk/src/{signer,token,proxy}.ts`) so a port to any language
 * only needs to re-implement the header family.
 *
 * Run order:
 *   1. admin registers the Ed25519 PUBLIC key (/admin/security/keys)
 *   2. this proxy holds the PRIVATE key + key id
 *   3. visitor submits a comment to THIS server (same-origin)
 *   4. this proxy signs a short-lived JWT, assembles the headers and
 *      forwards to core /api/content/v1/comments/reply
 */

import { buildProxyHeaders } from '@kobato/sdk/proxy'
import { createKeyAuthSigner } from '@kobato/sdk/signer'
import { parseCommentTokenHeader, pickCommentToken } from '@kobato/sdk/token'

// Frontend-held credentials (never shipped to the browser).
const PRIVATE_KEY_PEM = process.env.KOBATO_FRONTEND_PRIVATE_KEY ?? ''
const KEY_ID = process.env.KOBATO_FRONTEND_KEY_ID ?? ''
const CORE_API = process.env.KOBATO_CORE_API ?? 'http://core:4321'

const signer = createKeyAuthSigner(PRIVATE_KEY_PEM, KEY_ID)

const COMMENT_TOKEN_COOKIE = '__comment_tokens'

/**
 * Core's `Set-Cookie` lines carrying the visitor token jar. The reply
 * procedure issues/refreshes the whole jar as one
 * `Set-Cookie: __comment_tokens=<serialized jar>` header (the response
 * body carries no token); the frontend replays it into the visitor's
 * first-party cookie verbatim.
 */
function extractCommentTokenCookies(res: Response): string[] {
  const lines =
    typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') ?? '']
  return lines.filter((line) => line.startsWith(`${COMMENT_TOKEN_COOKIE}=`))
}

/** Visitor comment-token jar, kept in the frontend's own cookie. */
function readVisitorJar(cookieHeader: string | null): ReturnType<typeof parseCommentTokenHeader> {
  const jar = parseCommentTokenHeader(cookieHeader)
  return jar
}

/**
 * Proxy one comment submit:
 *  1. resolve the visitor token for the page (issued by core on the
 *     first submit, stored in the frontend's first-party cookie)
 *  2. sign the frontend JWT
 *  3. forward with the contract header family
 */
export async function proxyCommentSubmit(input: {
  pageKey: string
  name: string
  email: string
  body: unknown
  visitorTokenCookie: string | null
  visitorIp: string | null
  visitorUserAgent: string | null
}): Promise<Response> {
  const jar = readVisitorJar(input.visitorTokenCookie)
  const commentToken = pickCommentToken(jar, input.pageKey)

  const headers = buildProxyHeaders({
    jwt: signer.sign({ scope: ['content:write'] }),
    commentToken,
    forwardedFor: input.visitorIp,
    forwardedUserAgent: input.visitorUserAgent,
  })

  const res = await fetch(`${CORE_API}/api/content/v1/comments/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ page_key: input.pageKey, name: input.name, email: input.email, body: input.body }),
  })

  if (res.ok) {
    // Core issues/refreshes the visitor token jar as its own
    // `Set-Cookie: __comment_tokens=…` response header (the body carries
    // no token). Replay it into the visitor's first-party cookie: the
    // value is already the complete refreshed jar and the attributes
    // (Path, SameSite, HttpOnly, Max-Age) are host-only, so they land on
    // the frontend domain untouched. When the runtime relays `Set-Cookie`
    // verbatim (Node's fetch does), the re-emit is a harmless duplicate;
    // runtimes that strip response headers still get the jar.
    for (const cookie of extractCommentTokenCookies(res)) {
      res.headers.append('Set-Cookie', cookie)
    }
  }
  return res
}
