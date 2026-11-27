import 'zod/compile'
import type { AppLocale } from '@kobato/i18n/locales'
import type { RenderToPipeableStreamOptions } from 'react-dom/server'
import type { EntryContext, RouterContextProvider } from 'react-router'

import '@sayaka/zod-config'
import { isBot } from '@kobato/api/client/is-bot'
import { isRecord } from '@kobato/base/utils/type-guards'
import { DEFAULT_LOCALE, isSupportedLocale } from '@kobato/i18n/locales'
import { createReadableStreamFromReadable } from '@react-router/node'
import { getLogger } from '@sayaka/server/logger'
import { sayakaRequestContext } from '@sayaka/server/request-context'
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

  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    })
  }

  const nonce = loadContext.get(sayakaRequestContext).cspNonce

  const serverRouterNonce = import.meta.env.DEV ? undefined : nonce

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false
    let statusCode = responseStatusCode
    const userAgent = request.headers.get('user-agent')

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
            const body = new PassThrough({
              final(callback) {
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
            clearTimeout(timeoutId)
            timeoutId = undefined
            reject(error)
          },
          onError(error: unknown) {
            statusCode = 500

            if (shellRendered) {
              log.error('SSR streaming error', { error: error instanceof Error ? error.message : String(error) })
            }
          },
        },
      )
      pipe = renderer.pipe
      abort = renderer.abort
    } catch (error) {
      clearTimeout(timeoutId)
      timeoutId = undefined
      reject(error)
    }
  })
}
