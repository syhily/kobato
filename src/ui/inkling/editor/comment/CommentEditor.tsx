import type { InklingDocument } from '@/shared/inkling/schema'

import { cn } from '@/ui/lib/cn'

/**
 * Temporary stub while the hand-rolled editor is replaced by the vendored
 * inkling source (docs/superpowers/plans/2026-07-02-inkling-vendor-migration.md,
 * Task 1). Renders a disabled placeholder and intentionally does NOT render
 * `children` — `CommentInsertActions` reads the Lexical composer context,
 * which the stub does not provide. Replaced by the real integration in Task 7.
 */
export interface CommentInklingEditorProps {
  document: InklingDocument
  onChange: (document: InklingDocument) => void
  editable?: boolean
  placeholder?: string
  className?: string
  contentClassName?: string
  children?: React.ReactNode
}

export function CommentInklingEditor({ className, contentClassName, placeholder }: CommentInklingEditorProps) {
  return (
    <div className={cn('relative', className)}>
      <div className={cn('text-ink-4', contentClassName)} aria-disabled="true">
        {placeholder ?? '评论编辑器迁移中，暂不可用'}
      </div>
    </div>
  )
}
