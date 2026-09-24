import React from 'react'

// No-op subscription — the store's snapshot flips on its own once hydration commits.
const emptySubscribe = () => () => undefined

/**
 * Hydration gate for lazy `<Suspense>` boundaries whose fallback differs from
 * the resolved content. Returns `false` during SSR and the first client
 * render (so server markup and hydrating markup are byte-identical), then
 * `true` after hydration commits, when the lazy content may mount. Without
 * the gate, a chunk still loading at hydration time makes the client render
 * the fallback against the server's streamed markup — React error #418.
 * Inkling-local twin of the host's `useHydrated` (the layer cannot import
 * `@/ui/lib/use-hydrated`).
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}
