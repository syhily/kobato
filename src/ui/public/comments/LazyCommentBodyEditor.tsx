import { Suspense, lazy } from 'react'

import type { CommentBodyEditorProps } from '@/ui/public/comments/CommentBodyEditor'

import { cn } from '@/ui/lib/cn'
import { useHydrated } from '@/ui/lib/use-hydrated'

const CommentBodyEditorImpl = lazy(() => import('./CommentBodyEditor').then((m) => ({ default: m.CommentBodyEditor })))

function EditorPlaceholder({ className }: { className?: string }) {
  return <div className={cn('min-h-[6rem] animate-pulse rounded-md border border-line bg-surface', className)} />
}

/**
 * The lazy boundary must NOT exist during SSR/hydration: this editor is
 * streamed on public post pages, and a fallback (pulse skeleton) that differs
 * from the resolved editor markup makes the client render the boundary pending
 * against the server's streamed markup on cold visits — a structural mismatch
 * surfacing as React error #418. Render the deterministic placeholder on the
 * server and the first client render (the `useHydrated` gate in
 * `@/ui/lib/use-hydrated`), then mount the lazy editor after hydration.
 */
export function LazyCommentBodyEditor(props: CommentBodyEditorProps) {
  const hydrated = useHydrated()
  if (!hydrated) {
    return <EditorPlaceholder className={props.className} />
  }
  return (
    <Suspense fallback={<EditorPlaceholder className={props.className} />}>
      <CommentBodyEditorImpl {...props} />
    </Suspense>
  )
}
