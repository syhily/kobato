import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => undefined

/**
 * Hydration gate for lazy `<Suspense>` boundaries whose fallback differs from the resolved
 * content: `false` through SSR and the first client render (byte-identical markup), `true`
 * after hydration commits. Without the gate a chunk still loading at hydration renders the
 * fallback against the server's resolved markup — a whole-tree mismatch (React error #418).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}
