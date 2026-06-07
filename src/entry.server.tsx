import type { RenderToPipeableStreamOptions } from 'react-dom/server'
import type { EntryContext, RouterContextProvider } from 'react-router'

import { createReadableStreamFromReadable } from '@react-router/node'
import { isbot } from 'isbot'

import '@/shared/zod-config'

import { randomBytes } from 'node:crypto'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { ServerRouter } from 'react-router'

import { cspNonceContext } from '@/server/domains/auth/context'
import { getLogger } from '@/server/infra/logger'

export const streamTimeout = 5_000

const log = getLogger('entry.server')

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

  let nonce = loadContext.get(cspNonceContext)
  if (!nonce) {
    log.warn('CSP nonce missing from load context; generating fallback nonce')
    nonce = randomBytes(16).toString('base64')
  }

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false
    let statusCode = responseStatusCode
    const userAgent = request.headers.get('user-agent')

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady'

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => abort(), streamTimeout + 1000)

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
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
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            log.error('SSR streaming error', { error: error instanceof Error ? error.message : String(error) })
          }
        },
      },
    )
  })
}
