export type TelemetryHandler = (eventName: string, props: Record<string, unknown>) => void

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

const handlerStack: TelemetryHandler[] = []

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
