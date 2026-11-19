import { useHydrated } from '@kobato/inkling-internal/hooks/useHydrated'
import React from 'react'

export function LazyCardEditor({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) {
  const hydrated = useHydrated()
  if (!hydrated) {
    return <>{fallback}</>
  }
  return <React.Suspense fallback={fallback}>{children}</React.Suspense>
}
