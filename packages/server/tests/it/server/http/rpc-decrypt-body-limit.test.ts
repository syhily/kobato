import type { Env } from '@kobato/server/http/hono-env'

import { getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context'
import { makeSession } from '@kobato/server/tests/utils/session'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

const db = getTestDb()
const CSRF = 'decrypt-body-limit-csrf'

const { onErrorHandler } = await import('@kobato/server/http/errors')
const { createApiApp } = await import('@kobato/server/http/app')

const DECRYPT_RPC_PATH = '/rpc/admin/backup/uploadRestoreDecrypt'

function makeApiApp() {
  const rc = makeRequestContext({ db, session: makeSession({ csrfToken: CSRF }) })
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', rc as unknown as Env['Variables']['requestContext'])
    await next()
  })
  app.route('/', createApiApp())
  app.onError(onErrorHandler)
  return app
}

function oversizePayload(): string {
  return JSON.stringify({ json: { token: 'tok', password: 'x'.repeat(70 * 1024) } })
}

describe('64 KiB body cap on the canonical decrypt RPC path (real HTTP)', () => {
  it('rejects a content-length body over the cap with 413 payloadTooLarge', async () => {
    const app = makeApiApp()
    const body = oversizePayload()
    const res = await app.request(DECRYPT_RPC_PATH, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': CSRF,
        'content-length': String(body.length),
      },
      body,
    })
    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE', descriptor: { messageKey: 'error.api.payloadTooLarge' } },
    })
  })

  it('rejects a chunked body over the cap (no content-length) with 413', async () => {
    const app = makeApiApp()
    const payload = oversizePayload()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload))
        controller.close()
      },
    })
    const res = await app.request(DECRYPT_RPC_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF },
      body: stream,
      // @ts-expect-error — Node.js fetch requires duplex when sending a stream body
      duplex: 'half',
    })
    expect(res.status).toBe(413)
    await expect(res.json()).resolves.toMatchObject({
      error: { descriptor: { messageKey: 'error.api.payloadTooLarge' } },
    })
  })

  it('passes bodies under the cap through to the procedure guards', async () => {
    const app = makeApiApp()
    const res = await app.request(DECRYPT_RPC_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF },
      body: JSON.stringify({ json: { token: 'tok', password: 'pw' } }),
    })
    expect(res.status).not.toBe(413)
    expect(res.status).toBe(401)
  })
})
