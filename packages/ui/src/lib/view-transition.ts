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
