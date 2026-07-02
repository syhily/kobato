// Wrapper function for Plausible event
type PlausibleFn = ((...args: unknown[]) => void) & { q?: unknown[] }

export default function trackEvent(eventName: string, props: Record<string, unknown> = {}): void {
  if (window.plausible) {
    window.plausible(eventName, { props: props })
  } else {
    const plausibleFn = function (...args: unknown[]) {
      ;(plausibleFn.q = plausibleFn.q || []).push(args)
      // oxlint-disable-next-line typescript/no-explicit-any
    } as PlausibleFn
    window.plausible = plausibleFn
    plausibleFn(eventName, { props: props })
  }
  if (window.posthog) {
    window.posthog.capture(eventName, props)
  }
}
