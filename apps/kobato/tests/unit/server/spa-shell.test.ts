import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { type SpaShellEnv, createSpaShellHandler } from '@/server/spa-shell'

const DOCUMENT = [
  '<html>',
  '<head>',
  '<script>var a = 1</script>',
  '<script src="/admin/assets/entry.js"></script>',
  '<script>var b = 2</script>',
  '</head>',
  '<body><div id="root"></div></body>',
  '</html>',
].join('')

function shellApp(document: string, isHttps = false): Hono<SpaShellEnv> {
  const app = new Hono<SpaShellEnv>()
  app.on(
    ['GET', 'HEAD'],
    '*',
    createSpaShellHandler({
      loadHtml: () => document,
      buildCsp: (nonce) => `default-src 'self'; script-src 'self' 'nonce-${nonce}'`,
      isHttps: () => isHttps,
    }),
  )
  return app
}

function cspNonce(csp: string): string {
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
  expect(nonce).toBeDefined()
  return nonce ?? ''
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

describe('createSpaShellHandler', () => {
  it('stamps the CSP nonce onto every inline script and answers with the pinned headers', async () => {
    const res = await shellApp(DOCUMENT).request('/admin/signin')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('no-store')

    const nonce = cspNonce(res.headers.get('Content-Security-Policy') ?? '')
    expect(nonce).not.toBe('')
    const text = await res.text()
    expect(text.match(/<script/gu)).toHaveLength(3)
    expect(countOccurrences(text, `nonce="${nonce}"`)).toBe(3)
  })

  it('never touches a script tag that already carries a nonce', async () => {
    const document = '<html><head><script nonce="keep-me">var a = 1</script><script>var b = 2</script></head></html>'
    const res = await shellApp(document).request('/admin/signin')
    const nonce = cspNonce(res.headers.get('Content-Security-Policy') ?? '')
    const text = await res.text()
    expect(text).toContain('<script nonce="keep-me">var a = 1</script>')
    expect(text).toContain(`<script nonce="${nonce}">var b = 2</script>`)
    expect(text.match(/nonce=/gu)).toHaveLength(2)
  })

  it('answers HEAD with the same headers and no body', async () => {
    const res = await shellApp(DOCUMENT).request('/admin/signin', { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Security-Policy')).toContain('nonce-')
    expect(await res.text()).toBe('')
  })

  it('answers 404 for methods other than GET and HEAD', async () => {
    for (const method of ['POST', 'PUT', 'DELETE'] as const) {
      const res = await shellApp(DOCUMENT).request('/admin/signin', { method })
      expect(res.status, method).toBe(404)
    }
  })

  it('keeps a valid CSP for a document with zero inline scripts', async () => {
    const res = await shellApp('<html><head></head><body><p>ready</p></body></html>').request('/admin')
    const csp = res.headers.get('Content-Security-Policy') ?? ''
    const nonce = cspNonce(csp)
    expect(csp).toBe(`default-src 'self'; script-src 'self' 'nonce-${nonce}'`)
    expect(await res.text()).toBe('<html><head></head><body><p>ready</p></body></html>')
  })

  it('sends the HSTS header only when the site is https', async () => {
    const http = await shellApp(DOCUMENT).request('/admin')
    expect(http.headers.get('Strict-Transport-Security')).toBeNull()

    const https = await shellApp(DOCUMENT, true).request('/admin')
    expect(https.headers.get('Strict-Transport-Security')).toBe('max-age=15552000; includeSubDomains')
  })

  it('mints a fresh nonce per request', async () => {
    const app = shellApp(DOCUMENT)
    const first = cspNonce((await app.request('/admin')).headers.get('Content-Security-Policy') ?? '')
    const second = cspNonce((await app.request('/admin')).headers.get('Content-Security-Policy') ?? '')
    expect(first).not.toBe(second)
  })
})
