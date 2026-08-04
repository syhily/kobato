import type { LexicalCommentEditorProps } from '@kobato/editor/comments-editor/lexical/LexicalCommentEditor'

import { cn } from '@kobato/ui/lib/cn'
import { Suspense, lazy } from 'react'

const LexicalCommentEditorImpl = lazy(() =>
  import('@kobato/editor/comments-editor/lexical/LexicalCommentEditor').then((m) => ({
    default: m.LexicalCommentEditor,
  })),
)

export function LazyCommentBodyEditor(props: LexicalCommentEditorProps) {
  return (
    <Suspense
      fallback={
        <div className={cn('min-h-[6rem] animate-pulse rounded-md border border-line bg-surface', props.className)} />
      }
    >
      <LexicalCommentEditorImpl {...props} />
    </Suspense>
  )
}
