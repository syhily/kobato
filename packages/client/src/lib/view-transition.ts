/**
 * Run a DOM-mutating update inside a View Transition when the platform
 * supports it. Falls back to a plain synchronous update when:
 *
 * - SSR (no document),
 * - the browser lacks `document.startViewTransition`, or
 * - the user prefers reduced motion (the CSS animations only exist to be
 *   driven by a transition, so skipping the API disables them entirely).
 *
 * The update MUST apply its DOM changes synchronously (wrap React state
 * updates in `flushSync`) — the new snapshot is captured as soon as the
 * callback returns.
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
