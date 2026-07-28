import type { RenderToPipeableStreamOptions } from 'react-dom/server'
import type { EntryContext, RouterContextProvider } from 'react-router'

import { createReadableStreamFromReadable } from '@react-router/node'

import '@/shared/zod-config'

import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { ServerRouter } from 'react-router'

import { requestContext } from '@/server/http/request-context'
import { getLogger } from '@/server/infra/logger'
import { isBot } from '@/shared/utils/is-bot'

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

  const nonce = loadContext.get(requestContext).cspNonce

  // WORKAROUND: React Router v8's HydratedRouter does not include `nonce` in
  // FrameworkContext on the client, while ServerRouter does on the server. The
  // dev-mode critical CSS `<link>` rendered by `<Links />` therefore ends up
  // with a nonce attribute in the server HTML but not after client hydration,
  // causing a hydration mismatch. In development we omit the FrameworkContext
  // nonce so both sides render the link consistently without a nonce. The
  // `renderToPipeableStream` nonce is kept for React's own inline scripts, and
  // `<Scripts>` / `<ScrollRestoration>` still receive an explicit nonce prop.
  // https://github.com/remix-run/react-router/issues/14666
  const serverRouterNonce = import.meta.env.DEV ? undefined : nonce

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false
    let statusCode = responseStatusCode
    const userAgent = request.headers.get('user-agent')

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    const readyOption: keyof RenderToPipeableStreamOptions =
      isBot(userAgent) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady'

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
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
