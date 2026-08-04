import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '#/_helpers/e2e-client'
import { callE2eRpc } from '#/_helpers/e2e-rpc'
import { lexBody, lexCommentBody, lexParagraphNode } from '#/_helpers/lexical-body'

import { generateKeyPairSync } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Headless e2e — the third-party frontend chain against the live core
// (plan 0.6 验证门 / 阶段 3): the `examples/frontend-proxy` reference
// implementation is the test bed. The journey proves the full model:
//
//   1. a frontend registers its Ed25519 PUBLIC key (admin, session-auth);
//   2. anonymous reads go DIRECT from the browser to core's `/api`
//      Content API (CORS face — no key needed);
//   3. write interactions go through the frontend's own server-side
//      proxy, which signs the short-lived JWT and attaches the contract
//      header family (`X-Forwarded-*`, visitor token jar) — core honours
//      them and the comment lands as the visitor's.

const env = e2eEnv()

let frontendKey: { privateKeyPem: string; keyId: string }

describe('headless third-party frontend chain (examples/frontend-proxy as the test bed)', () => {
  beforeAll(async () => {
    const client = new E2eClient(env.baseUrl)
    const { res } = await loginAdmin(client, env)
    expect(res.status).toBe(302)
    const csrfToken = await getAdminCsrfToken(client)

    // The frontend generates its own key pair; core only ever holds the
    // public half.
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

    const registered = await callE2eRpc<{ id: string }>(
      client,
      '/admin/apikey/register',
      { name: 'e2e-third-party-frontend', publicKeyPem },
      csrfToken,
    )
    expect(registered.status).toBe(200)
    frontendKey = { privateKeyPem, keyId: registered.json.id }

    // A published post to comment on (admin write path over oRPC).
    const created = await callE2eRpc<{ post: { id: string | number } }>(
      client,
      '/admin/posts/upsertMeta',
      { title: 'Headless E2E', slug: 'headless-e2e', published: true, publishedAt: new Date().toISOString() },
      csrfToken,
    )
    expect(created.status).toBe(200)
    const published = await callE2eRpc(
      client,
      '/admin/posts/publishLatest',
      { id: String(created.json.post.id), body: lexBody([lexParagraphNode('Headless E2E 正文')]) },
      csrfToken,
    )
    expect(published.status).toBe(200)
  })

  afterAll(() => {
    delete process.env.KOBATO_FRONTEND_PRIVATE_KEY
    delete process.env.KOBATO_FRONTEND_KEY_ID
    delete process.env.KOBATO_CORE_API
  })

  it('serves anonymous reads over /api (browser direct, no key)', async () => {
    const client = new E2eClient(env.baseUrl)

    const home = await client.get('/api/content/v1/home')
    expect(home.status).toBe(200)
    expect(home.headers.get('content-type')).toContain('application/json')

    const detail = await client.get('/api/content/v1/posts/headless-e2e')
    expect(detail.status).toBe(200)
  })

  it('lands a comment through the frontend-proxy reference implementation (JWT + trust headers)', async () => {
    // The example module reads its credentials from the environment at
    // import time — set them before the dynamic import.
    process.env.KOBATO_FRONTEND_PRIVATE_KEY = frontendKey.privateKeyPem
    process.env.KOBATO_FRONTEND_KEY_ID = frontendKey.keyId
    process.env.KOBATO_CORE_API = env.baseUrl
    const { proxyCommentSubmit } = await import('../../../examples/frontend-proxy/src/proxy-example')

    const client = new E2eClient(env.baseUrl)
    const detail = await client.get('/api/content/v1/posts/headless-e2e')
    const detailJson = (await detail.json()) as { detail: { commentKey: string } }
    expect(detailJson.detail.commentKey).toBeTruthy()

    // Visitor submits from THEIR browser to the third-party frontend; the
    // frontend proxies to core with the contract header family.
    const proxied = await proxyCommentSubmit({
      pageKey: detailJson.detail.commentKey,
      name: 'Headless Visitor',
      email: 'headless-visitor@example.com',
      body: lexCommentBody('代理提交的评论'),
      visitorTokenCookie: null,
      visitorIp: '203.0.113.9',
      visitorUserAgent: 'headless-e2e-ua',
    })
    expect(proxied.status).toBe(200)

    // Core's fresh visitor-token jar came back as a Set-Cookie on the
    // frontend's response — relayed verbatim to the visitor's browser.
    const setCookie = proxied.headers.get('Set-Cookie')
    expect(setCookie).toContain('__comment_tokens=')

    // The comment is visible on the public feed under the same page key
    // (the write went through, and the key-flow holds end to end).
    const list = await client.get(
      `/api/content/v1/comments/list?page_key=${encodeURIComponent(detailJson.detail.commentKey)}&offset=0`,
    )
    expect(list.status).toBe(200)
    const listJson = (await list.json()) as { comments: { name: string }[] }
    expect(listJson.comments.some((c) => c.name === 'Headless Visitor')).toBe(true)
  })
})
