// Minimal `fetch` test double: captures every call and queues per-URL responses. Restores
// the original `fetch` after each test so a suite that forgets `reset()` cannot leak it.

import { afterEach } from 'vitest'

type FetchResponder = (input: Request | URL | string, init?: RequestInit) => Promise<Response>

interface MockFetchHandle {
  fetch: FetchResponder
  calls: { url: string; init?: RequestInit }[]
  enqueue(url: string | RegExp, response: Response | (() => Response | Promise<Response>)): void
  reset(): void
}

export function installFetch(): MockFetchHandle {
  const original = globalThis.fetch
  const queue: {
    matcher: string | RegExp
    response: Response | (() => Response | Promise<Response>)
  }[] = []
  const calls: { url: string; init?: RequestInit }[] = []

  const fetch: FetchResponder = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    calls.push({ url, init })
    const found = queue.findIndex(({ matcher }) => (typeof matcher === 'string' ? matcher === url : matcher.test(url)))
    if (found === -1) {
      return new Response('not mocked', { status: 599 })
    }
    const { response } = queue.splice(found, 1)[0]!
    return typeof response === 'function' ? response() : response
  }

  globalThis.fetch = fetch as unknown as typeof globalThis.fetch

  afterEach(() => {
    globalThis.fetch = original
  })

  return {
    fetch,
    calls,
    enqueue(matcher, response) {
      queue.push({ matcher, response })
    },
    reset() {
      queue.length = 0
      calls.length = 0
      globalThis.fetch = original
    },
  }
}

/** Response carrying an HTML document. A `Response` built from a string
 *  defaults to `text/plain`, which the webmention HTML parsers reject. */
export function htmlResponse(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'text/html; charset=utf-8')
  }
  return new Response(body, { ...init, headers })
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers,
  })
}
