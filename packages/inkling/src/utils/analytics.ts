/** One telemetry event, shaped like the default adapter's calls. */
export type TelemetryHandler = (eventName: string, props: Record<string, unknown>) => void

// The telemetry channel: call sites track events through this one function and the handler
// behind it is a port. The default adapter fans out to plausible/posthog, including the
// window queue stub plausible expects before its script loads. Vendors are window globals,
// so the channel is per-page, not per-composer.

function defaultTelemetryHandler(eventName: string, props: Record<string, unknown>): void {
  if (window.plausible) {
    window.plausible(eventName, { props: props })
  } else {
    const plausibleFn: NonNullable<Window['plausible']> = function (...args: unknown[]) {
      ;(plausibleFn.q = plausibleFn.q || []).push(args)
    }
    window.plausible = plausibleFn
    plausibleFn(eventName, { props: props })
  }
  if (window.posthog) {
    window.posthog.capture(eventName, props)
  }
}

let handler: TelemetryHandler = defaultTelemetryHandler

// Every live registration, most recent last. Multiple composers can share a page, so
// unmounting one must not clobber the others: the active handler is always the latest
// registration that has not been torn down.
const handlerStack: TelemetryHandler[] = []

/**
 * Registers the host's telemetry handler (undefined registers the default plausible/posthog
 * adapter). The teardown restores whichever handler was active before; once none are left
 * the channel falls back to the default.
 */
export function setTelemetryHandler(custom: TelemetryHandler | undefined): () => void {
  const registered = custom ?? defaultTelemetryHandler
  handlerStack.push(registered)
  handler = registered
  return () => {
    const index = handlerStack.lastIndexOf(registered)
    if (index !== -1) {
      handlerStack.splice(index, 1)
    }
    handler = handlerStack.length > 0 ? handlerStack[handlerStack.length - 1] : defaultTelemetryHandler
  }
}

export default function trackEvent(eventName: string, props: Record<string, unknown> = {}): void {
  handler(eventName, props)
}
