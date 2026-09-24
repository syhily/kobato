import React from 'react'

import { useHydrated } from '@/inkling/hooks/useHydrated'

/**
 * Hydration-safe lazy boundary for the CodeMirror-backed card edit surfaces
 * (code block, HTML card): the fallback renders on the server AND on the
 * first client render, then the lazy editor takes over after mount — the
 * `LazyMotionConfig` pattern (root AGENTS.md defensive constraints), so the
 * SSR'd canvas never mismatches a still-loading chunk. The fallback should be
 * a static read-only mirror of the editor's initial state.
 */
export function LazyCardEditor({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) {
  const hydrated = useHydrated()
  if (!hydrated) {
    return <>{fallback}</>
  }
  return <React.Suspense fallback={fallback}>{children}</React.Suspense>
}
