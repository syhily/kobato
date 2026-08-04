import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { seedMetric } from '#/_helpers/db'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexCommentBody } from '#/_helpers/lexical-body'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'

import { createKeyAuthSigner } from '@kobato/sdk/signer'
import { contentSurface, createApiApp } from '@kobato/server/http/app'
import { adminApiKeyRouter } from '@kobato/server/http/controllers/admin/apikey.controller'
import { contentPublicRouter } from '@kobato/server/http/controllers/content-public.controller'
import { requestContextMiddleware } from '@kobato/server/http/middlewares/request-context'
import { serverConfig } from '@kobato/server/infra/config'
import { content } from '@kobato/server/infra/db/schema/content'
import { metric } from '@kobato/server/infra/db/schema/metric'
import { post as postTable } from '@kobato/server/infra/db/schema/post'
import { OpenAPIGenerator } from '@orpc/openapi'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { call } from '@orpc/server'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { generateKeyPairSync } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

async function seedPost(slug: string): Promise<void> {
  const rows = await db
    .insert(postTable)
    .values({
      slug,
      title: slug,
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      deletedAt: null,
      visible: true,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const rev = await db
    .insert(content)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: content.id })
  await db.update(postTable).set({ publishedRevisionId: rev[0]!.id }).where(eq(postTable.id, postId))
  await db.insert(metric).values(seedMetric({ type: 'post', ownerId: postId }))
}

describe('openapi face (/api) vs rpc face (/rpc)', () => {
  it('serves the same home payload over REST and RPC', async () => {
    await seedPost('rest-post')

    const handler = new OpenAPIHandler(contentSurface)
    const result = await handler.handle(new Request('http://localhost/api/content/v1/home'), {
      prefix: '/api',
      context: makePublicCtx({ db }),
    })
    expect(result.matched).toBe(true)
    if (result.response === undefined) {
      throw new Error('expected a response')
    }
    expect(result.response.status).toBe(200)
    const body = (await result.response.json()) as { resolvedPosts: unknown[] }
    expect(Array.isArray(body.resolvedPosts)).toBe(true)
    expect(body.resolvedPosts.length).toBe(1)

    const rpc = await call(contentPublicRouter.home, {}, { context: makePublicCtx({ db }) })
    if ('redirectTo' in rpc) {
      throw new Error('expected home data')
    }
    expect(rpc.resolvedPosts.length).toBe(1)
  })

  it('exposes the generated OpenAPI document with the v1 paths', async () => {
    const generator = new OpenAPIGenerator({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    })
    const spec = (await generator.generate(contentSurface, {
      info: { title: 'Kobato Content API', version: '1' },
    })) as {
      paths: Record<string, { get?: Record<string, unknown>; post?: Record<string, unknown> }>
    }
    expect(spec.paths['/content/v1/home']).toBeDefined()
    expect(spec.paths['/content/v1/posts/:slug']).toBeDefined()
    expect(spec.paths['/content/v1/comments/tree']).toBeDefined()
  })

  it('generates query parameters for GET procedures from the input schema', async () => {
    const generator = new OpenAPIGenerator({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    })
    const spec = (await generator.generate(contentSurface, {
      info: { title: 'Kobato Content API', version: '1' },
    })) as {
      paths: Record<string, { get?: { parameters?: unknown[]; requestBody?: unknown } }>
    }

    const listParams = spec.paths['/content/v1/comments/list']?.get?.parameters
    expect(listParams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'page_key', in: 'query', required: true }),
        expect.objectContaining({ name: 'offset', in: 'query', required: true }),
      ]),
    )

    const searchParams = spec.paths['/content/v1/search']?.get?.parameters
    expect(searchParams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'keyword', in: 'query', required: true }),
        expect.objectContaining({ name: 'num', in: 'query', required: false }),
      ]),
    )

    const pageParams = spec.paths['/content/v1/pages/:slug']?.get?.parameters
    expect(pageParams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'slug', in: 'query', required: true }),
        expect.objectContaining({ name: 'wantsDraftPreview', in: 'query', required: false }),
      ]),
    )

    // GET procedures never carry a requestBody.
    expect(spec.paths['/content/v1/comments/list']?.get?.requestBody).toBeUndefined()
  })

  it('generates a requestBody for POST procedures', async () => {
    const generator = new OpenAPIGenerator({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    })
    const spec = (await generator.generate(contentSurface, {
      info: { title: 'Kobato Content API', version: '1' },
    })) as { paths: Record<string, { post?: { requestBody?: unknown; parameters?: unknown[] } }> }

    const reply = spec.paths['/content/v1/comments/reply']?.post
    expect(reply?.requestBody).toBeDefined()
    expect(reply?.parameters).toBeUndefined()
  })

  // GET query strings arrive as raw strings over REST — the input schema
  // must coerce them (z.coerce.number / the boolean union), same as it
  // accepts JSON numbers over the RPC wire.
  it('accepts string-typed query params on GET over REST', async () => {
    await seedPost('rest-post')

    const handler = new OpenAPIHandler(contentSurface)
    const result = await handler.handle(
      new Request(
        'http://localhost/api/content/v1/comments/list?page_key=00000000-0000-0000-0000-000000000001&offset=0',
      ),
      { prefix: '/api', context: makePublicCtx({ db }) },
    )
    expect(result.matched).toBe(true)
    // Validation passed; an empty comment thread answers 200 (not 400).
    expect(result.response?.status).toBe(200)
    if (result.response === undefined) {
      throw new Error('expected a response')
    }
    const body = (await result.response.json()) as { comments: unknown[]; next: boolean }
    expect(body.comments).toEqual([])
    expect(body.next).toBe(false)
  })

  it('coerces wantsDraftPreview boolean strings on GET over REST', async () => {
    const handler = new OpenAPIHandler(contentSurface)
    // The page does not exist, so the request must fail with NOT_FOUND —
    // a 400 would mean validation rejected the "true"/"false" strings.
    const result = await handler.handle(
      new Request('http://localhost/api/content/v1/pages/no-such-page?wantsDraftPreview=false'),
      { prefix: '/api', context: makePublicCtx({ db }) },
    )
    expect(result.response?.status).toBe(404)
  })
})

describe('rest face (/api) per-procedure response headers', () => {
  // The `/api` Hono bridge must merge the procedures' `responseHeaders`
  // channel onto the final response, same as the `/rpc` bridge — the
  // guest comment-token `Set-Cookie` and the rate-limit `Retry-After`
  // ride it (the example proxy replays the Set-Cookie into the visitor's
  // first-party cookie).
  it('relays the comment-token Set-Cookie issued by the reply procedure', async () => {
    await seedPost('rest-post')

    const app = new Hono()
    app.use('*', requestContextMiddleware)
    app.route('/', createApiApp())

    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const registered = await call(
      adminApiKeyRouter.register,
      { name: 'it-rest-reply', publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() },
      { context: makeAuthedCtx({ db, role: 'admin' }) },
    )
    const signer = createKeyAuthSigner(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), registered.id)

    const res = await app.request('/api/content/v1/comments/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${signer.sign({ scope: ['content:write'] })}`,
      },
      body: JSON.stringify({
        page_key: '00000000-0000-0000-0000-000000000001',
        name: 'Rest Guest',
        email: 'rest-guest@example.com',
        body: lexCommentBody('rest 评论'),
      }),
    })

    if (res.status !== 200) {
      console.error('BODY:', await res.clone().text())
    }
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).not.toBeNull()
    expect(setCookie).toContain('__comment_tokens=')
  })
})

describe('rest face (/api) CORS perimeter', () => {
  // Regression: `apiFaceMiddleware` is registered BEFORE the OpenAPI
  // handler (the handler answers matched routes directly and would
  // otherwise skip the face), and the bridge folds the face's prepared
  // headers into the response — anonymous browser reads must actually
  // answer `Access-Control-Allow-Origin: *` and the read rate limit must
  // run.

  function buildApp(): Hono {
    const app = new Hono()
    app.use('*', requestContextMiddleware)
    app.route('/', createApiApp())
    return app
  }

  it('answers anonymous GETs with open CORS', async () => {
    const res = await buildApp().request('/api/content/v1/home', {
      method: 'GET',
      headers: { Origin: 'https://third-party.example' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('rejects cross-origin writes with the error envelope', async () => {
    const res = await buildApp().request('/api/content/v1/comments/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: '{}',
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { defined: boolean; code: string; status: number }
    expect(body).toMatchObject({ defined: false, code: 'FORBIDDEN', status: 403 })
  })

  it('allows a listed origin on credentialed writes and preflight', async () => {
    const allowedOrigins = serverConfig.api.allowedOrigins
    allowedOrigins.push('https://front.example')
    try {
      const app = buildApp()
      const res = await app.request('/api/content/v1/comments/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://front.example' },
        body: '{}',
      })
      // The origin is allowed, so the request passes the CORS gate and
      // fails later on the missing JWT/body — not with the 403 envelope.
      expect(res.status).not.toBe(403)
      expect(res.headers.get('access-control-allow-origin')).toBe('https://front.example')
      expect(res.headers.get('access-control-allow-credentials')).toBe('true')

      const preflight = await app.request('/api/content/v1/comments/reply', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://front.example',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization',
        },
      })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-origin')).toBe('https://front.example')
      expect(preflight.headers.get('access-control-allow-methods')).toContain('POST')
    } finally {
      allowedOrigins.length = 0
    }
  })
})
