// Zod 4.5 auto-compilation (3–9x parse on objects/unions) — must evaluate
// before any module that constructs schemas. Server-only: the browser bundle
// keeps `jitless` (see `@/shared/zod-config`), under which compile stands down.
import 'zod/compile'
import type { RenderToPipeableStreamOptions } from 'react-dom/server'
import type { EntryContext, RouterContextProvider } from 'react-router'

import { createReadableStreamFromReadable } from '@react-router/node'

import '@/shared/zod-config'

import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { ServerRouter, isRouteErrorResponse } from 'react-router'

import { requestContext } from '@/server/http/request-context'
import { getLogger } from '@/server/infra/logger'
import { isBot } from '@/shared/utils/is-bot'

export const streamTimeout = 5_000

const log = getLogger('entry.server')

// Required export — RR would otherwise log errors via bare console.error, bypassing pino.
// Only non-Response errors route here; post-shell streaming errors go to `onError` below.
export function handleError(error: unknown, { request }: { request: Request }) {
  // Client-aborted requests are not server faults — skip them.
  if (request.signal.aborted) {
    return
  }
  // Unwrap RouteErrorResponses carrying the original error so the log never degrades to "[object Object]".
  const cause = isRouteErrorResponse(error) && 'error' in error && error.error instanceof Error ? error.error : error
  log.error('Router request error', {
    error: cause instanceof Error ? cause.message : String(cause),
    url: request.url,
  })
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    })
  }

  const nonce = loadContext.get(requestContext).cspNonce

  // WORKAROUND: omit the FrameworkContext nonce in dev so server/client render the CSS <link> identically.
  // https://github.com/remix-run/react-router/issues/14666
  const serverRouterNonce = import.meta.env.DEV ? undefined : nonce

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false
    let statusCode = responseStatusCode
    const userAgent = request.headers.get('user-agent')

    // Bots and SPA-mode renders must wait for all content before responding.
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    const readyOption: keyof RenderToPipeableStreamOptions =
      isBot(userAgent) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady'

    // Abort after `streamTimeout` so rejected boundaries have time to flush.
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => abort(), streamTimeout + 1000)

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={serverRouterNonce} />,
      {
        nonce,
        [readyOption]() {
          shellRendered = true
          const body = new PassThrough({
            final(callback) {
              // Clear the timeout to prevent retaining the closure and memory leak
              clearTimeout(timeoutId)
              timeoutId = undefined
              callback()
            },
          })
          const stream = createReadableStreamFromReadable(body)

          responseHeaders.set('Content-Type', 'text/html')

          pipe(body)

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: statusCode,
            }),
          )
        },
        onShellError(error: unknown) {
          reject(error)
        },
        onError(error: unknown) {
          statusCode = 500
          // Log post-shell streaming errors; the initial shell render rejects via `onShellError`.
          if (shellRendered) {
            log.error('SSR streaming error', { error: error instanceof Error ? error.message : String(error) })
          }
        },
      },
    )
  })
}
