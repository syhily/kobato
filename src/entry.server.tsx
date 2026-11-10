// Zod 4.5 auto-compilation (3–9x parse on objects/unions) must evaluate before any module that constructs schemas.
// Server-only: the browser bundle keeps `jitless` (see `@/shared/zod-config`), under which compile stands down.
import 'zod/compile'
import type { RenderToPipeableStreamOptions } from 'react-dom/server'
import type { EntryContext, RouterContextProvider } from 'react-router'

import { createReadableStreamFromReadable } from '@react-router/node'

import '@/shared/zod-config'

import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { ServerRouter, isRouteErrorResponse } from 'react-router'

import type { AppLocale } from '@/shared/i18n/locales'

import { requestContext } from '@/server/http/request-context'
import { getLogger } from '@/server/infra/logger'
import { startSpan, type Span } from '@/server/infra/trace/facade'
import { recordSsrPhase } from '@/server/infra/trace/metrics'
import { DEFAULT_LOCALE, isSupportedLocale } from '@/shared/i18n/locales'
import { isBot } from '@/shared/utils/is-bot'
import { isRecord } from '@/shared/utils/type-guards'

export const streamTimeout = 5_000

const log = getLogger('entry.server')

/**
 * Must match what the root Layout renders (`rootData.i18n.locale`); a failed root loader has no payload, so
 * the header must not claim the request locale.
 */
function documentLocale(routerContext: EntryContext): AppLocale {
  const loaderData: unknown = routerContext.staticHandlerContext?.loaderData
  const root: unknown = isRecord(loaderData) ? loaderData.root : undefined
  const i18n: unknown = isRecord(root) ? root.i18n : undefined
  if (isRecord(i18n) && typeof i18n.locale === 'string' && isSupportedLocale(i18n.locale)) {
    return i18n.locale
  }
  return DEFAULT_LOCALE
}

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
  // One AppLocale drives `<html lang>`, og:locale, and this header. 304 responses never reach this entry (their
  // headers are rebuilt by RR — see root's `headers` export).
  responseHeaders.set('Content-Language', documentLocale(routerContext))

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
    // `ssr.shell` covers the initial render until shell/all-ready; `ssr.stream` covers only the post-shell stream.
    // Both are manual spans because their boundaries are React callbacks, not one call site.
    const shellStartedAt = performance.now()
    const shellSpan: Span = startSpan('ssr.shell', { attributes: { 'ssr.phase': 'shell' } })
    let shellEnded = false
    let streamSpan: Span | null = null
    let streamStartedAt = 0
    let streamEnded = false
    let streamOutcome: 'completed' | 'aborted' | 'error' = 'aborted'

    const finishShell = (outcome: 'ok' | 'error'): void => {
      if (shellEnded) {
        return
      }
      shellEnded = true
      shellSpan.end()
      recordSsrPhase('shell', outcome, performance.now() - shellStartedAt)
    }

    const finishStream = () => {
      if (streamSpan === null || streamEnded) {
        return
      }
      streamEnded = true
      streamSpan.setAttribute('ssr.outcome', streamOutcome)
      if (streamOutcome !== 'error') {
        streamSpan.setStatus('ok')
      }
      streamSpan.end()
      recordSsrPhase('stream', streamOutcome, performance.now() - streamStartedAt)
    }

    let shellRendered = false
    let statusCode = responseStatusCode
    const userAgent = request.headers.get('user-agent')

    // Bots and SPA-mode renders must wait for all content before responding.
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    const readyOption: keyof RenderToPipeableStreamOptions =
      isBot(userAgent) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady'

    // Abort after `streamTimeout` so rejected boundaries have time to flush.
    // `abort` is a no-op until the renderer exists; the synchronous-throw path
    // below clears this timer.
    let pipe: (destination: PassThrough) => void = () => undefined
    let abort: () => void = () => undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => abort(), streamTimeout + 1000)

    try {
      const renderer = renderToPipeableStream(
        <ServerRouter context={routerContext} url={request.url} nonce={serverRouterNonce} />,
        {
          nonce,
          [readyOption]() {
            shellRendered = true
            shellSpan.setStatus('ok')
            finishShell('ok')
            streamStartedAt = performance.now()
            streamSpan = startSpan('ssr.stream', { attributes: { 'ssr.phase': 'stream' } })
            const body = new PassThrough({
              final(callback) {
                // Clear the timeout to prevent retaining the closure and memory leak
                clearTimeout(timeoutId)
                timeoutId = undefined
                // A boundary error may already have marked this stream; keep it.
                if (streamOutcome !== 'error') {
                  streamOutcome = 'completed'
                }
                finishStream()
                callback()
              },
            })
            body.once('error', (error: unknown) => {
              streamOutcome = 'error'
              streamSpan?.recordError(error)
              streamSpan?.setStatus('error')
              finishStream()
            })
            body.once('close', () => {
              // A client abort destroys the stream without the `final` callback.
              if (!streamEnded) {
                streamOutcome = 'aborted'
                finishStream()
              }
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
            shellSpan.recordError(error)
            shellSpan.setStatus('error')
            finishShell('error')
            finishStream()
            reject(error)
          },
          onError(error: unknown) {
            statusCode = 500
            // Log post-shell streaming errors; the initial shell render rejects via `onShellError`.
            if (shellRendered) {
              streamOutcome = 'error'
              streamSpan?.recordError(error)
              streamSpan?.setStatus('error')
              log.error('SSR streaming error', { error: error instanceof Error ? error.message : String(error) })
            } else {
              // A boundary may still recover and render the shell; `onShellError`
              // ends the span with an error status if it does not.
              shellSpan.recordError(error)
            }
          },
        },
      )
      pipe = renderer.pipe
      abort = renderer.abort
    } catch (error) {
      // A synchronous renderer throw must not leak the shell span or its timer.
      clearTimeout(timeoutId)
      timeoutId = undefined
      shellSpan.recordError(error)
      shellSpan.setStatus('error')
      finishShell('error')
      finishStream()
      reject(error)
    }
  })
}
