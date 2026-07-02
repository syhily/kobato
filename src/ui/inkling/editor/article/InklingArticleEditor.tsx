import { useEffect } from 'react'

import type { InklingArticleEditorProps } from '@/ui/inkling/editor/article/article-editor-types'

/**
 * Temporary stub while the hand-rolled editor is replaced by the vendored
 * inkling source (docs/superpowers/plans/2026-07-02-inkling-vendor-migration.md,
 * Task 1). Renders a disabled placeholder, never emits document changes, and
 * resolves the flush handle to `null` so shells keep their last known body.
 * Replaced by the real integration in Task 6.
 */
export function InklingArticleEditor({ flushHandleRef, floatingActions }: InklingArticleEditorProps) {
  useEffect(() => {
    if (flushHandleRef === undefined) {
      return undefined
    }
    flushHandleRef.current = () => null
    return () => {
      flushHandleRef.current = null
    }
  }, [flushHandleRef])

  return (
    <div className="relative flex min-h-64 flex-1 items-center justify-center" aria-disabled="true">
      <p className="text-sm text-ink-4">编辑器迁移中，暂不可用</p>
      {floatingActions}
    </div>
  )
}
