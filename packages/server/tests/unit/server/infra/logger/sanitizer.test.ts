import { resBindings, sanitizeReqHeaders } from '@kobato/server/infra/logger/sanitizer'
import { describe, expect, it } from 'vitest'

describe('sanitizeReqHeaders', () => {
  it('redacts L5 headers (authorization, cookie) entirely', () => {
    const result = sanitizeReqHeaders({
      Authorization: 'Bearer secret123',
      Cookie: 'session=abc123',
    })
    expect(result.Authorization).toBe('[REDACTED]')
    expect(result.Cookie).toBe('[REDACTED]')
  })

  it('redacts proxy credentials and CSRF tokens (audit P0-9)', () => {
    const result = sanitizeReqHeaders({
      'Proxy-Authorization': 'Basic cHJveHk6c2VjcmV0',
      'X-CSRF-Token': 'csrf-secret',
    })
    expect(result['Proxy-Authorization']).toBe('[REDACTED]')
    expect(result['X-CSRF-Token']).toBe('[REDACTED]')
  })

  it('redacts L5 headers case-insensitively', () => {
    const result = sanitizeReqHeaders({ authorization: 'Bearer secret123', cookie: 'sid=xyz' })
    expect(result.authorization).toBe('[REDACTED]')
    expect(result.cookie).toBe('[REDACTED]')
  })

  it('tags L3 headers with {E}…{/E} markers', () => {
    const result = sanitizeReqHeaders({
      'User-Agent': 'Mozilla/5.0',
      'X-Forwarded-For': '1.2.3.4',
    })
    expect(result['User-Agent']).toBe('{E}Mozilla/5.0{/E}')
    expect(result['X-Forwarded-For']).toBe('{E}1.2.3.4{/E}')
  })

  it('tags all known L3 headers', () => {
    const headers = {
      'cf-connecting-ip': '1.2.3.4',
      'true-client-ip': '5.6.7.8',
      'x-real-ip': '9.10.11.12',
      forwarded: 'for=13.14.15.16',
    }
    const result = sanitizeReqHeaders(headers)
    for (const value of Object.values(result)) {
      expect(value).toMatch(/^\{E\}.+\{\/E\}$/)
    }
  })

  it('passes through non-sensitive headers unchanged', () => {
    const result = sanitizeReqHeaders({
      'Content-Type': 'application/json',
      Accept: 'text/html',
      'Accept-Language': 'en-US',
    })
    expect(result['Content-Type']).toBe('application/json')
    expect(result.Accept).toBe('text/html')
    expect(result['Accept-Language']).toBe('en-US')
  })

  it('preserves undefined values for non-sensitive headers', () => {
    const result = sanitizeReqHeaders({ 'X-Custom': undefined })
    expect(result['X-Custom']).toBeUndefined()
  })

  it('handles empty input', () => {
    const result = sanitizeReqHeaders({})
    expect(result).toEqual({})
  })

  it('handles mixed L5, L3, and neutral headers', () => {
    const result = sanitizeReqHeaders({
      Authorization: 'Bearer tok',
      Cookie: 'sid=123',
      'Content-Type': 'text/html',
    })
    expect(result.Authorization).toBe('[REDACTED]')
    expect(result.Cookie).toBe('[REDACTED]')
    expect(result['Content-Type']).toBe('text/html')
  })
})

describe('resBindings', () => {
  function mockContext(headers: Record<string, string>, status = 200) {
    const headersObj = new Headers()
    for (const [key, value] of Object.entries(headers)) {
      headersObj.set(key, value)
    }
    return {
      res: { status, headers: headersObj },
      var: { requestId: 'req-test-id' },
    } as any
  }

  it('redacts set-cookie headers entirely', () => {
    const c = mockContext({ 'set-cookie': '__session=abc123; Path=/' })
    const result = resBindings(c)
    expect(result.res.headers['set-cookie']).toBe('[REDACTED]')
  })

  it('passes through non-cookie response headers unchanged', () => {
    const c = mockContext({ 'content-type': 'application/json', 'x-custom': 'value' })
    const result = resBindings(c)
    expect(result.res.headers['content-type']).toBe('application/json')
    expect(result.res.headers['x-custom']).toBe('value')
  })

  it('captures response status', () => {
    const c = mockContext({}, 404)
    const result = resBindings(c)
    expect(result.res.status).toBe(404)
  })

  it('handles empty headers', () => {
    const c = mockContext({})
    const result = resBindings(c)
    expect(result.res.headers).toEqual({})
    expect(result.res.status).toBe(200)
  })

  it('binds the request id at the top level for log correlation', () => {
    const c = mockContext({})
    const result = resBindings(c)
    expect(result.requestId).toBe('req-test-id')
  })
})
