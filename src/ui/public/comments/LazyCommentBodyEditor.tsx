import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'

import type { CommentBodyEditorProps } from '@/ui/public/comments/CommentBodyEditor'

import { cn } from '@/ui/lib/cn'

// The comment composer rides a lazy chunk (the inkling island + its CSS) so
// the public post page's static import graph stays editor-free — see the
// header comment in ./CommentBodyEditor.tsx.
const CommentBodyEditor = lazy(() =>
  import('@/ui/public/comments/CommentBodyEditor').then((module) => ({ default: module.CommentBodyEditor })),
)

// Hover-intent prefetch: the browser dedupes this against the lazy boundary's
// own import, so pointerdown activation almost never waits on the network.
const warmEditorChunk = () => void import('@/ui/public/comments/CommentBodyEditor')

export interface LazyCommentBodyEditorProps extends CommentBodyEditorProps {
  /** Mount the real editor immediately (edit forms / admin dialogs — the
   *  click that opened the surface WAS the interaction). Default: wait for
   *  the user to point at or focus the placeholder (the always-visible reply
   *  form). */
  eager?: boolean
}

export function LazyCommentBodyEditor({ eager = false, disabled, className, ...props }: LazyCommentBodyEditorProps) {
  const [active, setActive] = useState(eager)
  // display:contents keeps the wrapper out of the layout box tree while still
  // scoping the contenteditable lookup to THIS editor instance.
  const shellRef = useRef<HTMLDivElement | null>(null)
  const focusOnLoadRef = useRef(false)

  const activate = useCallback(() => {
    if (disabled === true) {
      return
    }
    focusOnLoadRef.current = true
    setActive(true)
  }, [disabled])

  // The activating pointerdown/focus landed on the placeholder, which is gone
  // by the time the editor mounts — hand focus over once the contenteditable
  // exists (a replayed untrusted event would never focus it natively).
  const handleEditorMounted = useCallback(() => {
    if (!focusOnLoadRef.current) {
      return
    }
    focusOnLoadRef.current = false
    shellRef.current?.querySelector<HTMLElement>('[contenteditable]')?.focus()
  }, [])

  if (!active) {
    return <EditorPlaceholder disabled={disabled} className={className} onActivate={activate} />
  }

  return (
    <div ref={shellRef} className="contents">
      <Suspense fallback={<EditorPlaceholder disabled={disabled} className={className} />}>
        <MountedEditor {...props} disabled={disabled} className={className} onMounted={handleEditorMounted} />
      </Suspense>
    </div>
  )
}

function MountedEditor({ onMounted, ...props }: CommentBodyEditorProps & { onMounted: () => void }) {
  useEffect(() => {
    onMounted()
  }, [onMounted])
  return <CommentBodyEditor {...props} />
}

interface EditorPlaceholderProps {
  disabled?: boolean
  className?: string
  onActivate?: () => void
}

/** SSR/hydration-stable stand-in for the unloaded composer: the same shell
 *  chrome and the same canvas box (the 96px min-height + canvas padding that
 *  `inkling-comment-editor.css` puts on the real contentEditable, duplicated
 *  here because that stylesheet rides the lazy chunk). */
function EditorPlaceholder({ disabled, className, onActivate }: EditorPlaceholderProps) {
  const interactive = onActivate !== undefined && disabled !== true
  return (
    <div
      className={cn('kobato-comment-editor rounded-md border border-line bg-transparent', className)}
      {...(interactive
        ? {
            role: 'textbox',
            'aria-multiline': true,
            'aria-label': '评论内容',
            tabIndex: 0,
            onPointerEnter: warmEditorChunk,
            // preventDefault keeps the browser from focusing a node that is
            // about to unmount; focus is handed over after the editor mounts.
            onPointerDown: (event: React.PointerEvent) => {
              event.preventDefault()
              onActivate()
            },
            onFocus: onActivate,
          }
        : { 'aria-disabled': disabled === true || undefined })}
    >
      <div className="min-h-24 px-[8.8px] pt-[6.6px] pb-[22px]" />
    </div>
  )
}
