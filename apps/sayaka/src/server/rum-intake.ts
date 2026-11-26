import type { RumIntakeOutput } from '@kobato/api/contracts/public/observability'
import type { Env } from '@sayaka/server/hono-env'

import { RUM_INTAKE_PATH } from '@kobato/api/contracts/public/observability'
import { getLogger } from '@sayaka/server/logger'
import { createRelayClient } from '@sayaka/server/relay-client'
import { createMiddleware } from 'hono/factory'

const log = getLogger('rum.intake')

const MAX_BATCH_BYTES = 1024 * 1024

async function readBatchBody(raw: Request): Promise<{ body: string; oversized: boolean }> {
  const stream = raw.body
  if (stream === null) {
    return { body: '', oversized: false }
  }
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      received += value.byteLength
      if (received > MAX_BATCH_BYTES) {
        try {
          await reader.cancel()
        } catch {}
        return { body: '', oversized: true }
      }
      chunks.push(decoder.decode(value, { stream: true }))
    }
  } finally {
    reader.releaseLock()
  }
  chunks.push(decoder.decode())
  return { body: chunks.join(''), oversized: false }
}

function intakeResponse(answer: RumIntakeOutput): Response {
  if (answer.kind === 'accepted') {
    return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } })
  }
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json' })
  if (answer.retryAfterSeconds !== undefined) {
    headers.set('Retry-After', String(answer.retryAfterSeconds))
  }
  return new Response(JSON.stringify({ error: { message: answer.message } }), {
    status: answer.status,
    headers,
  })
}

export const rumIntakeRelay = createMiddleware<Env>(async (c, next) => {
  if (c.req.method !== 'POST' || !c.req.path.startsWith(`${RUM_INTAKE_PATH}/`)) {
    return next()
  }

  const noStore = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } as const

  const declared = Number(c.req.header('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_BATCH_BYTES) {
    return new Response(JSON.stringify({ error: { message: 'Batch too large' } }), {
      status: 413,
      headers: noStore,
    })
  }

  const contentEncoding = c.req.header('content-encoding')
  if (contentEncoding !== undefined && contentEncoding.trim().toLowerCase() !== 'identity') {
    return new Response(JSON.stringify({ error: { message: 'Compressed RUM batches are not accepted' } }), {
      status: 415,
      headers: noStore,
    })
  }

  const { body, oversized } = await readBatchBody(c.req.raw)
  if (oversized) {
    return new Response(JSON.stringify({ error: { message: 'Batch too large' } }), {
      status: 413,
      headers: noStore,
    })
  }

  try {
    const answer = await createRelayClient(c).public.observability.rumIntake({
      track: c.req.path.slice(RUM_INTAKE_PATH.length),
      query: c.req.url.split('?', 2)[1] ?? '',
      body,
      contentType: c.req.header('content-type') ?? null,
    })
    return intakeResponse(answer)
  } catch (error) {
    log.error('RUM intake relay failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Bad Gateway', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
})
