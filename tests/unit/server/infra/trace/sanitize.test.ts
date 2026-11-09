import { ORPCError } from '@orpc/server'
import { describe, expect, it } from 'vitest'

import { projectError, sanitizeSpanAttribute, sanitizeSpanAttributes } from '@/server/infra/trace/sanitize'

describe('trace sanitize — span attribute allowlist', () => {
  it('keeps allowlisted technical attributes', () => {
    expect(sanitizeSpanAttribute('http.route', '/posts/:slug')).toEqual(['http.route', '/posts/:slug'])
    expect(sanitizeSpanAttribute('http.response.status_code', 304)).toEqual(['http.response.status_code', 304])
    expect(sanitizeSpanAttribute('orpc.transport', 'in_process')).toEqual(['orpc.transport', 'in_process'])
  })

  it('drops any attribute outside the allowlist', () => {
    expect(sanitizeSpanAttribute('http.url', 'http://localhost/posts/secret?token=x')).toBeNull()
    expect(sanitizeSpanAttribute('http.request.header.cookie', 'session=1')).toBeNull()
    expect(sanitizeSpanAttribute('user.id', '42')).toBeNull()
    expect(sanitizeSpanAttribute('db.query.text', 'SELECT 1')).toBeNull()
  })

  it('keeps the bounded redacted statement but rejects non-allowlisted telemetry vocabularies', () => {
    expect(sanitizeSpanAttribute('db.statement', 'SELECT * FROM t WHERE a = ?')).toEqual([
      'db.statement',
      'SELECT * FROM t WHERE a = ?',
    ])
    expect(sanitizeSpanAttribute('db.operation', 'select')).toEqual(['db.operation', 'select'])
    expect(sanitizeSpanAttribute('db.operation', 'SELECT secret FROM t')).toBeNull()
    expect(sanitizeSpanAttribute('cache.bucket', 'feed')).toEqual(['cache.bucket', 'feed'])
    expect(sanitizeSpanAttribute('cache.bucket', 'unknown')).toBeNull()
    expect(sanitizeSpanAttribute('cache.coalesced', 'true')).toBeNull()
    expect(sanitizeSpanAttribute('http.client.operation', 'music.asset')).toEqual([
      'http.client.operation',
      'music.asset',
    ])
    expect(sanitizeSpanAttribute('http.client.operation', 'https://example.com/x')).toBeNull()
  })

  it('rejects raw URLs in route templates and non-finite status codes', () => {
    expect(sanitizeSpanAttribute('http.route', 'https://localhost/private?token=x')).toBeNull()
    expect(sanitizeSpanAttribute('http.response.status_code', 99)).toBeNull()
    expect(sanitizeSpanAttribute('http.response.status_code', 600)).toBeNull()
  })

  it('never lets a non-string impersonate a closed string attribute', () => {
    expect(sanitizeSpanAttribute('http.route', 42 as never)).toBeNull()
    expect(sanitizeSpanAttribute('db.operation', true as never)).toBeNull()
    expect(sanitizeSpanAttribute('image.operation', 7 as never)).toBeNull()
    expect(sanitizeSpanAttribute('cache.bucket', false as never)).toBeNull()
  })

  it('drops null/undefined/non-finite values and empty strings', () => {
    expect(sanitizeSpanAttribute('http.route', null)).toBeNull()
    expect(sanitizeSpanAttribute('http.route', undefined)).toBeNull()
    expect(sanitizeSpanAttribute('http.response.status_code', Number.NaN)).toBeNull()
    expect(sanitizeSpanAttribute('http.route', '')).toBeNull()
  })

  it('strips control characters and caps string length', () => {
    expect(sanitizeSpanAttribute('http.route', '/a\u0000b\nc')).toEqual(['http.route', '/abc'])
    const long = '/'.padEnd(500, 'x')
    const projected = sanitizeSpanAttribute('http.route', long)
    expect(projected?.[1]).toBe('/'.padEnd(128, 'x'))
  })

  it('projects a whole bag through the allowlist', () => {
    expect(
      sanitizeSpanAttributes({
        'http.request.method': 'GET',
        'http.route': '/tags/:slug',
        'http.url': 'http://localhost/tags/x?q=secret',
        'http.response.status_code': 200,
        'error.category': 'orpc_not_found',
      }),
    ).toEqual({
      'http.request.method': 'GET',
      'http.route': '/tags/:slug',
      'http.response.status_code': 200,
      'error.category': 'orpc_not_found',
    })
  })
})

describe('trace sanitize — error projection', () => {
  it('projects a plain Error to its name and an unknown category without reading message/stack', () => {
    const error = new Error('secret message at http://localhost/private?token=abc')
    const projection = projectError(error)

    expect(projection).toEqual({ type: 'Error', category: 'unknown' })
    expect(JSON.stringify(projection)).not.toContain('secret')
    expect(JSON.stringify(projection)).not.toContain('localhost')
  })

  it('never touches a hostile message getter', () => {
    const hostile = {
      name: 'Error',
      get message(): string {
        throw new Error('message getter must not run')
      },
      get stack(): string {
        throw new Error('stack getter must not run')
      },
    }

    expect(projectError(hostile)).toEqual({ type: 'Error', category: 'unknown' })
  })

  it('maps ORPCError codes to a stable orpc category', () => {
    // The real class leaves `name` as the generic 'Error'; its stable
    // code + HTTP status pair identifies it without reading the message.
    expect(projectError(new ORPCError('FORBIDDEN', { message: 'secret' }))).toEqual({
      type: 'ORPCError',
      category: 'orpc_forbidden',
    })
  })

  it('maps a thrown Response to its status without reading the body', () => {
    expect(projectError(new Response(null, { status: 304 }))).toEqual({
      type: 'Response',
      category: 'http_304',
    })
  })

  it('maps abort/timeout errors to an aborted category', () => {
    expect(projectError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toEqual({
      type: 'AbortError',
      category: 'aborted',
    })
  })

  it('does not echo unknown error class names', () => {
    expect(projectError(Object.assign(new Error('x'), { name: 'UserContentError' }))).toEqual({
      type: 'Error',
      category: 'unknown',
    })
    expect(projectError('a string throw')).toEqual({ type: 'NonError', category: 'unknown' })
  })
})
