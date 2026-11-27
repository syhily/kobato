import type { StaticServer } from '@kobato/font-split/scripts/bench/static-server'

import { startStaticServer } from '@kobato/font-split/scripts/bench/static-server'
import { connect } from 'node:http2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

interface Reply {
  status: number | undefined
  body: string
  cacheControl: string | undefined
}

let server: StaticServer

beforeAll(async () => {
  server = await startStaticServer(
    new Map([['/static/font.woff2', { body: Buffer.from('face'), type: 'font/woff2' }]]),
    (url) => (url === '/page/1.html' ? { body: Buffer.from('<p>page</p>'), type: 'text/html; charset=utf-8' } : null),
  )
})

afterAll(async () => {
  await server.close()
})

function viaHttp2(path: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const session = connect(server.h2Origin, { rejectUnauthorized: false })
    session.on('error', reject)
    const stream = session.request({ ':path': path })
    const chunks: Buffer[] = []
    let reply: Reply = { status: undefined, body: '', cacheControl: undefined }
    stream.on('response', (headers) => {
      reply = {
        status: headers[':status'] as number | undefined,
        body: '',
        cacheControl: headers['cache-control'] as string | undefined,
      }
    })
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => {
      session.close()
      resolve({ ...reply, body: Buffer.concat(chunks).toString() })
    })
  })
}

describe('bench static server', () => {
  it('serves static and dynamic routes over HTTP/1.1 with immutable caching', async () => {
    const face = await fetch(`${server.h1Origin}/static/font.woff2`)
    expect(face.status).toBe(200)
    expect(face.headers.get('content-type')).toBe('font/woff2')
    expect(face.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(await face.text()).toBe('face')
    const page = await fetch(`${server.h1Origin}/page/1.html`)
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await page.text()).toBe('<p>page</p>')
  })

  it('answers 404 for unknown routes and ignores query strings', async () => {
    expect((await fetch(`${server.h1Origin}/missing`)).status).toBe(404)
    expect((await fetch(`${server.h1Origin}/static/font.woff2?v=1`)).status).toBe(200)
  })

  it('serves the same routes over TLS HTTP/2', async () => {
    const response = await viaHttp2('/static/font.woff2')
    expect(response.status).toBe(200)
    expect(response.body).toBe('face')
    expect(response.cacheControl).toBe('public, max-age=31536000, immutable')
    expect((await viaHttp2('/missing')).status).toBe(404)
  })
})
