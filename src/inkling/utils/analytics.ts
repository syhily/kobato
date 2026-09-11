/**
 * One telemetry event (CONTEXT.md: "host config"). The shape mirrors what
 * the default adapter emits, so a host handler can treat it as the
 * plausible/posthog event it replaces.
 */
export type TelemetryHandler = (eventName: string, props: Record<string, unknown>) => void

// The telemetry channel (CONTEXT.md: "host config"): call sites track
// events through this one function; the handler behind it is a port. The
// DEFAULT adapter is the historical plausible/posthog fan-out — including
// the window queue stub plausible expects before its script loads — kept
// verbatim for hosts that don't configure their own. A host's handler
// (CardConfig.telemetry) replaces the default for the whole page:
// analytics is page-global by nature (the vendors it abstracts are window
// globals), so the channel is per-page, not per-composer.

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

// Every live registration, most recent last. Multiple composers can share a
// page, so unmounting one must not clobber the others: the active handler is
// always the latest registration that has not been torn down yet.
const handlerStack: TelemetryHandler[] = []

/**
 * Registers the host's telemetry handler (undefined registers the default
 * plausible/posthog adapter). Returns a teardown that unregisters it again,
 * restoring whichever handler was active before it — registrations unwind in
 * any order, and the channel falls back to the default once none are left.
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
