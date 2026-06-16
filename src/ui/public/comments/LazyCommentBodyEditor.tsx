import { Suspense, lazy } from 'react'

import type { CommentBodyEditorProps } from '@/ui/public/comments/CommentBodyEditor'

import { cn } from '@/ui/lib/cn'

const CommentBodyEditorImpl = lazy(() => import('./CommentBodyEditor').then((m) => ({ default: m.CommentBodyEditor })))

export function LazyCommentBodyEditor(props: CommentBodyEditorProps) {
  return (
    <Suspense
      fallback={
        <div className={cn('min-h-[6rem] animate-pulse rounded-md border border-line bg-surface', props.className)} />
      }
    >
      <CommentBodyEditorImpl {...props} />
    </Suspense>
  )
}
