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
      // GET or HEAD request
      return next()
    }

    const maxSize = resolveMaxSize()

    const hasTransferEncoding = c.req.raw.headers.has('transfer-encoding')
    const hasContentLength = c.req.raw.headers.has('content-length')

    if (hasContentLength && !hasTransferEncoding) {
      // Only Content-Length present — we can trust it
      const contentLength = parseInt(c.req.raw.headers.get('content-length') || '0', 10)
      return contentLength > maxSize ? onError(c) : next()
    }

    // Transfer-Encoding present (chunked) or no length headers.
    // Per RFC 7230, when both are present Transfer-Encoding takes precedence
    // and Content-Length is ignored. Read the body up-front so the size check
    // is final before the handler runs, regardless of how (or whether) the
    // handler reads the body.
    let size = 0
    const chunks: Uint8Array[] = []
    const rawReader = c.req.raw.body.getReader()
    for (;;) {
      const { done, value } = await rawReader.read()
      if (done) {
        break
      }
      size += value.length
      if (size > maxSize) {
        return onError(c)
      }
      chunks.push(value)
    }

    const requestInit: RequestInit & { duplex: 'half' } = {
      body: new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk)
          }
          controller.close()
        },
      }),
      duplex: 'half',
    }
    c.req.raw = new Request(c.req.raw, requestInit as RequestInit)

    return next()
  }
}
