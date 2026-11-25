import { useHydrated } from '@kobato/inkling-internal/hooks/useHydrated'
import { type ReactNode, Suspense } from 'react'
export function LazyCardEditor({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const hydrated = useHydrated()
  if (!hydrated) {
    return <>{fallback}</>
  }
  return <Suspense fallback={fallback}>{children}</Suspense>
}
