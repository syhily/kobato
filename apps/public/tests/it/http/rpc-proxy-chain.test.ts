import type { ApiRouter } from '@kobato/server/http/api-router.types'
import type { Env } from '@kobato/server/http/context'
import type { RouterClient } from '@orpc/server'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { seedMetric } from '#/_helpers/db'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexCommentBody } from '#/_helpers/lexical-body'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'

import { serve, type ServerType } from '@hono/node-server'
import { canonicalizeLexicalCommentBodyShape } from '@kobato/editor/lexical-core/comment-canonicalize'
import { createKeyAuthSigner } from '@kobato/sdk/signer'
import { establishLoginSession } from '@kobato/server/domains/auth/primitives'
import { getRequestSession } from '@kobato/server/domains/auth/session-storage'
import { createApiApp } from '@kobato/server/http/app'
import { adminApiKeyRouter } from '@kobato/server/http/controllers/admin/apikey.controller'
import { requestContextMiddleware } from '@kobato/server/http/middlewares/request-context'
import { comment as commentTable } from '@kobato/server/infra/db/schema/comment'
import { metric } from '@kobato/server/infra/db/schema/metric'
import { user } from '@kobato/server/infra/db/schema/user'
import { parseCommentTokensCookie } from '@kobato/shared/utils/comment-token'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { generateKeyPairSync, type KeyObject } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createRpcProxy } from '@/lib/http/rpc-proxy'

// The stage-3 write-proxy chain, end to end over REAL HTTP:
//
//   browser oRPC POST ──▶ frontend /rpc proxy ──▶ core /rpc (real server)
//                        (JWT + token jar +    (frontendKeyAuth verifies,
//                         X-Forwarded-*)        CSRF no-cookie pass)
//
// The core app is the real `createApiApp` + `requestContextMiddleware`
// served by @hono/node-server on an ephemeral port; the frontend proxy is
// the production module with a real registered Ed25519 key. The test
// proves the full loop the headless deployment needs:
//
//   1. an anonymous guest comment lands in the DB through the proxy,
//      with core recording the FORWARDED visitor IP/UA (JWT trust chain);
//   2. core's fresh `__comment_tokens` Set-Cookie is relayed to the
//      browser;
//   3. the browser presents the cookie back; the proxy mirrors it onto
//      `X-Kobato-Comment-Token`; core merges it behind the JWT and the
//      guest edits their own comment (token continuity across domains).

const db = getTestDb()

const COMMENT_BODY = lexCommentBody('proxy-chain 评论')
const EDITED_BODY = lexCommentBody('proxy-chain 编辑后')

let coreServer: ServerType
let coreUrl: string
let frontendApp: Hono

// The @hono/node-server listen callback does not fire reliably inside the
// vitest worker, so the bound port is polled via `server.address()`.
async function waitForPort(server: ServerType): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const addr = server.address()
    if (addr !== null && typeof addr === 'object') {
      return `http://127.0.0.1:${addr.port}`
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('core test server never bound a port')
}

beforeAll(async () => {
  // ── core: real perimeter + real API over HTTP on an ephemeral port ──
  const coreApp = new Hono<Env>()
  coreApp.use('*', requestContextMiddleware)
  coreApp.route('/', createApiApp())
  coreServer = serve({ fetch: coreApp.fetch.bind(coreApp), port: 0 })
  coreUrl = await waitForPort(coreServer)
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    coreServer.close((err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
})

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)

  // ── a real registered frontend key (the admin registers the PUBLIC key;
  //    the frontend holds the private key) ──
  const { publicKeyPem, privateKey } = makeKeyPair()
  const registered = await call(
    adminApiKeyRouter.register,
    { name: 'it-proxy-frontend', publicKeyPem },
    { context: makeAuthedCtx({ db, role: 'admin' }) },
  )
  const signer = createKeyAuthSigner(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), registered.id)
  void signer

  // ── the frontend app: the production proxy module, pointed at core ──
  frontendApp = new Hono()
  frontendApp.use(
    '/rpc/*',
    createRpcProxy({
      coreApiUrl: coreUrl,
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      keyId: registered.id,
    }),
  )

  // ── a comment target (the metric row `replyComment` resolves) ──
  await db.insert(metric).values(seedMetric({ type: 'post', ownerId: 1, publicId: 'pk-proxy-chain' }))
})

function makeKeyPair(): { publicKeyPem: string; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return { publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKey }
}

// The frontend's direct peer in the test env: a remote socket, so the
// proxy forwards the HONEST socket address (not the browser-supplied
// X-Forwarded-For, which a visitor can forge at will).
const FRONTEND_ENV = { incoming: { socket: { remoteAddress: '203.0.113.7' } } }

const BROWSER_HEADERS = {
  'Content-Type': 'application/json',
  Origin: 'http://localhost',
  'User-Agent': 'it-e2e-browser',
}

interface CommentReplyJson {
  comment: { id: string; isPending: boolean | null }
}

describe('frontend write-proxy chain (real HTTP core)', () => {
  it('creates a comment through the proxy and records the forwarded visitor identity', async () => {
    const res = await frontendApp.request(
      '/rpc/comments/replyComment',
      {
        method: 'POST',
        headers: BROWSER_HEADERS,
        body: JSON.stringify({
          json: {
            page_key: 'pk-proxy-chain',
            name: 'Proxy Guest',
            email: 'proxy-guest@example.com',
            body: COMMENT_BODY,
          },
        }),
      },
      FRONTEND_ENV,
    )

    expect(res.status).toBe(200)
    const { json } = (await res.json()) as { json: CommentReplyJson }
    expect(json.comment.id).toBeTruthy()
    expect(json.comment.isPending).toBe(true)

    // The comment landed in core's DB with the FORWARDED visitor
    // identity — the JWT trust chain (proxy key → core verify →
    // X-Forwarded-For / X-Forwarded-User-Agent) held over real HTTP.
    const rows = await db
      .select({ ip: commentTable.ip, ua: commentTable.ua })
      .from(commentTable)
      .where(eq(commentTable.id, idFromWire(json.comment.id)))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ip).toBe('203.0.113.7')
    expect(rows[0]!.ua).toBe('it-e2e-browser')

    // Core issued the fresh guest token; the proxy relayed the Set-Cookie
    // so it lands on the frontend domain.
    const setCookie = res.headers.get('Set-Cookie')
    expect(setCookie).toContain('__comment_tokens=')
    const jar = parseCommentTokensCookie(setCookie)
    expect(Object.keys(jar)).toContain('pk-proxy-chain')
  })

  it('bridges the guest token across domains: cookie in → header out → edit succeeds', async () => {
    // First leg: create, and keep the token jar core issued.
    const created = await frontendApp.request(
      '/rpc/comments/replyComment',
      {
        method: 'POST',
        headers: BROWSER_HEADERS,
        body: JSON.stringify({
          json: {
            page_key: 'pk-proxy-chain',
            name: 'Proxy Guest',
            email: 'proxy-guest@example.com',
            body: COMMENT_BODY,
          },
        }),
      },
      FRONTEND_ENV,
    )
    expect(created.status).toBe(200)
    const { json } = (await created.json()) as { json: CommentReplyJson }
    const commentId = json.comment.id
    const setCookie = created.headers.get('Set-Cookie')
    expect(setCookie).not.toBeNull()

    // Second leg: the browser presents its first-party cookie; the proxy
    // mirrors it onto X-Kobato-Comment-Token and core verifies ownership.
    const edited = await frontendApp.request(
      '/rpc/comments/edit',
      {
        method: 'POST',
        headers: { ...BROWSER_HEADERS, Cookie: setCookie! },
        body: JSON.stringify({ json: { rid: commentId, body: EDITED_BODY } }),
      },
      FRONTEND_ENV,
    )
    expect(edited.status).toBe(200)
    const editedJson = (await edited.json()) as { json: { comment: { id: string } } }
    expect(editedJson.json.comment.id).toBe(commentId)

    const rows = await db
      .select({ body: commentTable.body })
      .from(commentTable)
      .where(eq(commentTable.id, idFromWire(commentId)))
    // Stored comment bodies are canonical Lexical since R5a; the edit
    // input was canonical Lexical too, so expect the canonicalized form.
    expect(rows[0]!.body).toEqual(canonicalizeLexicalCommentBodyShape(EDITED_BODY))
  })

  it('refuses the guest-token bridge without the frontend JWT (header ignored)', async () => {
    // A frontend WITHOUT a registered key still forwards anonymously —
    // comment creation works, but the token header is not honoured by
    // core, so a guest cannot edit through an unkeyed proxy.
    const anonymousFrontend = new Hono()
    anonymousFrontend.use('/rpc/*', createRpcProxy({ coreApiUrl: coreUrl, privateKeyPem: null, keyId: null }))

    const created = await anonymousFrontend.request(
      '/rpc/comments/replyComment',
      {
        method: 'POST',
        headers: BROWSER_HEADERS,
        body: JSON.stringify({
          json: {
            page_key: 'pk-proxy-chain',
            name: 'Proxy Guest',
            email: 'proxy-guest@example.com',
            body: COMMENT_BODY,
          },
        }),
      },
      FRONTEND_ENV,
    )
    expect(created.status).toBe(200)
    const { json } = (await created.json()) as { json: CommentReplyJson }
    const setCookie = created.headers.get('Set-Cookie')
    expect(setCookie).not.toBeNull()

    const edited = await anonymousFrontend.request(
      '/rpc/comments/edit',
      {
        method: 'POST',
        headers: { ...BROWSER_HEADERS, Cookie: setCookie! },
        body: JSON.stringify({ json: { rid: json.comment.id, body: EDITED_BODY } }),
      },
      FRONTEND_ENV,
    )
    // No JWT → core ignores X-Kobato-Comment-Token → no token in the jar
    // → the anonymous editor cannot prove ownership.
    expect(edited.status).toBe(403)
  })

  it('bridges the member session across domains: __session cookie → X-Kobato-Session-Token → authed read succeeds', async () => {
    // A member logs in on the CORE domain (admin app) and the frontend
    // mirrored the signed cookie into its own domain. The proxy relays it
    // as X-Kobato-Session-Token and core resolves the session behind the
    // frontend JWT — the authed `load-mine` read passes (without the
    // bridge it would 401: no cookie reaches core).
    const [u] = await db
      .insert(user)
      .values({ name: 'Chain Member', email: 'chain-member@example.com', password: 'h', role: 'visitor' })
      .returning()
    const anonymousSession = await getRequestSession(new Request('http://localhost/'))
    const login = await establishLoginSession(
      db,
      anonymousSession,
      u as never,
      new Request('http://localhost/'),
      '127.0.0.1',
    )
    const cookieValue = login.setCookie.split(';')[0]!.slice('__session='.length)

    const memberClient: RouterClient<ApiRouter> = createORPCClient(
      new RPCLink({
        url: () => 'http://localhost/rpc',
        // The browser's request to the frontend: same-origin /rpc + the
        // frontend-domain `__session` cookie.
        fetch: async (request) => {
          const headers = new Headers(request.headers)
          headers.set('Cookie', `__session=${cookieValue}`)
          return frontendApp.request(request.url, {
            method: request.method,
            headers,
            body: await request.text(),
          })
        },
      }),
    )

    const res = await memberClient.comments.loadMine({ offset: 0 })
    expect(res.total).toBe(0)
    expect(res.items).toEqual([])
  })

  it('refuses the member bridge through an unkeyed proxy (authed read 401s)', async () => {
    const [u] = await db
      .insert(user)
      .values({ name: 'Unkeyed Member', email: 'unkeyed-member@example.com', password: 'h', role: 'visitor' })
      .returning()
    const anonymousSession = await getRequestSession(new Request('http://localhost/'))
    const login = await establishLoginSession(
      db,
      anonymousSession,
      u as never,
      new Request('http://localhost/'),
      '127.0.0.1',
    )
    const cookieValue = login.setCookie.split(';')[0]!.slice('__session='.length)

    // A frontend WITHOUT a registered key: the proxy must not relay the
    // member session (core would ignore it anyway), so the authed read
    // fails with UNAUTHORIZED — the member bridge is key-gated end to end.
    const unkeyedFrontend = new Hono()
    unkeyedFrontend.use('/rpc/*', createRpcProxy({ coreApiUrl: coreUrl, privateKeyPem: null, keyId: null }))

    const memberClient: RouterClient<ApiRouter> = createORPCClient(
      new RPCLink({
        url: () => 'http://localhost/rpc',
        fetch: async (request) => {
          const headers = new Headers(request.headers)
          headers.set('Cookie', `__session=${cookieValue}`)
          return unkeyedFrontend.request(request.url, {
            method: request.method,
            headers,
            body: await request.text(),
          })
        },
      }),
    )

    await expect(memberClient.comments.loadMine({ offset: 0 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

/** The wire comment id is the string form; the table key is numeric. */
function idFromWire(id: string): number {
  return Number(id)
}
