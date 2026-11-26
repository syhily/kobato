import { collectRpcMetadata } from '@kobato/api/rpc/metadata'

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

const REQUEST_TIMEOUT_OVERRIDES = collectRpcMetadata((meta, prefix) => {
  if (typeof meta !== 'object' || meta === null || !('requestTimeoutMs' in meta)) {
    return undefined
  }
  return typeof meta.requestTimeoutMs === 'number' ? { prefix, timeoutMs: meta.requestTimeoutMs } : undefined
})

export function requestTimeoutMsForUrl(urlPath: string, defaultMs: number): number {
  let timeoutMs = defaultMs
  for (const override of REQUEST_TIMEOUT_OVERRIDES) {
    const matches = urlPath === override.prefix || urlPath.startsWith(`${override.prefix}/`)
    if (matches && override.timeoutMs > timeoutMs) {
      timeoutMs = override.timeoutMs
    }
  }
  return timeoutMs
}

export function requestTimeoutMsForProcedure(path: readonly string[], defaultMs: number): number {
  return requestTimeoutMsForUrl(`/rpc/${path.join('/')}`, defaultMs)
}

export interface BoundedUpstreamSignal {
  readonly signal: AbortSignal
  readonly timedOut: boolean
  release: () => void
}

export function boundedUpstreamSignal(outer: AbortSignal, timeoutMs: number): BoundedUpstreamSignal {
  const controller = new AbortController()
  const timeout = AbortSignal.timeout(timeoutMs)
  let timedOut = false
  const abortFromTimeout = () => {
    timedOut = true
    controller.abort(timeout.reason)
  }
  const abortFromOuter = () => {
    controller.abort(outer.reason)
  }
  timeout.addEventListener('abort', abortFromTimeout)
  if (outer.aborted) {
    abortFromOuter()
  } else {
    outer.addEventListener('abort', abortFromOuter)
  }
  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut
    },
    release: () => {
      timeout.removeEventListener('abort', abortFromTimeout)
    },
  }
}
