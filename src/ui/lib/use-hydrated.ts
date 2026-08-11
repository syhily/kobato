import { useSyncExternalStore } from 'react'

// No-op subscription — the store's snapshot flips on its own once hydration commits.
const emptySubscribe = () => () => undefined

/**
 * Hydration gate for lazy `<Suspense>` boundaries whose fallback differs from
 * the resolved content. Returns `false` during SSR and the first client
 * render (so server markup and hydrating markup are byte-identical), then
 * `true` after hydration commits, when the lazy content may mount.
 *
 * Without this gate, a lazy chunk still loading at hydration time makes the
 * client render the boundary's fallback against the server's streamed
 * (resolved) markup — a whole-tree structural mismatch surfacing as React
 * error #418 (root AGENTS.md defensive constraints).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}
