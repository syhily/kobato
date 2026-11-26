import type { Env } from '@sayaka/server/hono-env'

import { ORPCError } from '@orpc/contract'
import { getLogger } from '@sayaka/server/logger'
import { createRelayClient } from '@sayaka/server/relay-client'
import { createMiddleware } from 'hono/factory'

const log = getLogger('webmention.receive')

const MAX_FORM_BODY_BYTES = 16 * 1024

const ERROR_STATUS_BY_CODE: Record<string, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function jsonAnswer(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function translatedError(error: unknown): Response {
  if (!(error instanceof ORPCError)) {
    return new Response('Bad Gateway', { status: 502 })
  }
  const code = typeof error.code === 'string' ? error.code : 'UNKNOWN'
  const message = typeof error.message === 'string' ? error.message : 'Request failed'
  const wireStatus = typeof error.status === 'number' ? error.status : 500
  const status = ERROR_STATUS_BY_CODE[code] ?? wireStatus
  const errorBody: Record<string, unknown> = { code, message }
  const data: unknown = error.data
  if (isRecord(data) && 'descriptor' in data) {
    errorBody.descriptor = data.descriptor
    if ('issues' in data) {
      errorBody.issues = data.issues
    }
  }
  return jsonAnswer({ error: errorBody }, status)
}

async function readFormBody(raw: Request): Promise<{ body: string; oversized: boolean }> {
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
      if (received > MAX_FORM_BODY_BYTES) {
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

export const webmentionReceive = createMiddleware<Env>(async (c, next) => {
  if (c.req.method !== 'POST' || c.req.path !== '/webmention') {
    return next()
  }

  const declared = Number(c.req.header('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_FORM_BODY_BYTES) {
    return jsonAnswer({ error: { message: 'Payload too large' } }, 413)
  }

  const { body, oversized } = await readFormBody(c.req.raw)
  if (oversized) {
    return jsonAnswer({ error: { message: 'Payload too large' } }, 413)
  }

  const form = new URLSearchParams(body)
  try {
    const answer = await createRelayClient(c).public.webmentions.receive({
      source: form.get('source') ?? '',
      target: form.get('target') ?? '',
    })
    if (answer.kind === 'accepted') {
      return jsonAnswer({ status: 'pending' }, 202)
    }
    return jsonAnswer({ error: { message: answer.message } }, answer.kind === 'invalid' ? 400 : 410)
  } catch (error) {
    if (error instanceof ORPCError) {
      return translatedError(error)
    }
    log.error('kobato unreachable for the webmention receive', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Bad Gateway', { status: 502 })
  }
})
