// Zod 4.5 auto-compilation (3–9x parse on objects/unions) must evaluate before any module that constructs schemas.
// Server-only: the browser bundle keeps `jitless` (see `@/zod-config`), under which compile stands down.
import 'zod/compile'
import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { RenderToPipeableStreamOptions } from 'react-dom/server'
import type { EntryContext, RouterContextProvider } from 'react-router'

import '@/zod-config.ts'
import { DEFAULT_LOCALE, isSupportedLocale } from '@kobato/i18n/locales.ts'
import { requestContext } from '@kobato/server/http/request-context.ts'
import { isBot } from '@kobato/server/infra/http/is-bot.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { startSpan, type Span } from '@kobato/server/infra/trace/facade.ts'
import { recordSsrPhase } from '@kobato/server/infra/trace/metrics.ts'
import { isRecord } from '@kobato/utils/type-guards.ts'
import { createReadableStreamFromReadable } from '@react-router/node'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { ServerRouter, isRouteErrorResponse } from 'react-router'

export const streamTimeout = 5_000

const log = getLogger('entry.server')

function documentLocale(routerContext: EntryContext): AppLocale {
  const loaderData: unknown = routerContext.staticHandlerContext?.loaderData
  const root: unknown = isRecord(loaderData) ? loaderData.root : undefined
  const i18n: unknown = isRecord(root) ? root.i18n : undefined
  if (isRecord(i18n) && typeof i18n.locale === 'string' && isSupportedLocale(i18n.locale)) {
    return i18n.locale
  }
  return DEFAULT_LOCALE
}

export function handleError(error: unknown, { request }: { request: Request }) {
  if (request.signal.aborted) {
    return
  }
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
                clearTimeout(timeoutId)
                timeoutId = undefined
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

            if (shellRendered) {
              streamOutcome = 'error'
              streamSpan?.recordError(error)
              streamSpan?.setStatus('error')
              log.error('SSR streaming error', { error: error instanceof Error ? error.message : String(error) })
            } else {
              shellSpan.recordError(error)
            }
          },
        },
      )
      pipe = renderer.pipe
      abort = renderer.abort
    } catch (error) {
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
