import type { Context, MiddlewareHandler } from 'hono'

import { HTTPException } from 'hono/http-exception'

import type { Env } from '@/server/http/context'

type OnError = (c: Context) => Response | Promise<Response>

interface DynamicBodyLimitOptions {
  maxSize: number | (() => number)
  onError?: OnError
}

const DEFAULT_ERROR_MESSAGE = 'Payload Too Large'

export function dynamicBodyLimit(options: DynamicBodyLimitOptions): MiddlewareHandler<Env> {
  const onError: OnError =
    options.onError ||
    (() => {
      const res = new Response(DEFAULT_ERROR_MESSAGE, { status: 413 })
      throw new HTTPException(413, { res })
    })

  function resolveMaxSize(): number {
    return typeof options.maxSize === 'function' ? options.maxSize() : options.maxSize
  }

  return async function dynamicBodyLimitMiddleware(c, next) {
    if (!c.req.raw.body) {
      return next()
    }

    const maxSize = resolveMaxSize()

    const hasTransferEncoding = c.req.raw.headers.has('transfer-encoding')
    const hasContentLength = c.req.raw.headers.has('content-length')

    if (hasContentLength && !hasTransferEncoding) {
      // Only Content-Length present — we can trust it
      const contentLength = parseInt(c.req.raw.headers.get('content-length') || '0', 10)
      if (Number.isNaN(contentLength) || contentLength > maxSize) {
        return onError(c)
      }
      return next()
    }

    // Chunked or no length headers: stream through a byte-counting passthrough
    // (Transfer-Encoding wins per RFC 7230) — never buffer the whole payload.
    let size = 0
    const rawReader = c.req.raw.body.getReader()

    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await rawReader.read()
        if (done) {
          controller.close()
          return
        }
        size += value.byteLength
        if (size > maxSize) {
          // Cancel the upstream reader first — an un-cancelled chunked body can
          // trickle forever; the catch swallows cancel-on-errored-stream rejections.
          void rawReader.cancel().catch(() => {})
          // An `HTTPException` lets Hono's handler emit 413 — a plain Error would 500.
          controller.error(new HTTPException(413, { message: DEFAULT_ERROR_MESSAGE }))
          return
        }
        controller.enqueue(value)
      },
      cancel(reason) {
        void rawReader.cancel(reason)
      },
    })

    c.req.raw = new Request(c.req.raw, { body, duplex: 'half' } as RequestInit)

    return next()
  }
}
