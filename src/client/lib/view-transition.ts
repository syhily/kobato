/**
 * Run a DOM-mutating update inside a View Transition when supported (SSR,
 * missing API, or reduced motion fall back to a plain synchronous update).
 * The update MUST apply its DOM changes synchronously — wrap in `flushSync`.
 */
export function transitionViewIfSupported(update: () => void): void {
  if (
    typeof document === 'undefined' ||
    typeof document.startViewTransition !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    update()
    return
  }
  document.startViewTransition(update)
}
