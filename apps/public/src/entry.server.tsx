import type { RenderToPipeableStreamOptions } from 'react-dom/server'
import type { EntryContext, RouterContextProvider } from 'react-router'

import { isBot } from '@kobato/shared/utils/is-bot'
import '@kobato/shared/zod-config'
import { createReadableStreamFromReadable } from '@react-router/node'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { ServerRouter, isRouteErrorResponse } from 'react-router'

import { frontendContext } from '@/lib/frontend-context'
import { getLogger } from '@/lib/logger'

export const streamTimeout = 5_000

const log = getLogger('entry.server')

// Server-side error reporting hook called by the React Router runtime for
// loader/action errors (and shell-rendering failures rejected upstream).
// Without this export RR falls back to a default handler that writes a bare
// `console.error`, bypassing the structured pino pipeline. The runtime only
// calls this for non-Response errors (and RouteErrorResponses carrying an
// `error`), so deliberately thrown 4xx/5xx Responses stay silent. Streaming
// errors after the shell are NOT routed here — they are logged in the
// `onError` callback of `renderToPipeableStream` below.
export function handleError(error: unknown, { request }: { request: Request }) {
  // Client-aborted requests (cancelled navigation, closed tab) are not
  // server faults — skip them.
  if (request.signal.aborted) {
    return
  }
  // Mirror the runtime's default handler: unwrap RouteErrorResponses that
  // carry the original error before extracting the message, so the log
  // never degrades to "[object Object]". The runtime only forwards
  // RouteErrorResponses when their `.error` is set (always an Error), but
  // the field is `private` in RR's type declarations — hence the `in`
  // narrowing instead of direct property access.
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

  // The frontend's own per-request nonce (see `src/lib/frontend-context` —
  // there is no shared session on the frontend).
  const nonce = loadContext.get(frontendContext).cspNonce

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
