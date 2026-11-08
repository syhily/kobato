import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'

import type { InklingLabelsInput } from '@/inkling'
import type { CommentBodyEditorProps } from '@/ui/public/comments/CommentBodyEditor'

import { loadInklingLabels, useKobatoInklingLabels } from '@/client/editor/inkling-labels'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

// The comment composer rides a lazy chunk (the inkling island + its CSS) so
// the public post page's static import graph stays editor-free — see the
// header comment in ./CommentBodyEditor.tsx.
const CommentBodyEditor = lazy(() =>
  import('@/ui/public/comments/CommentBodyEditor').then((module) => ({ default: module.CommentBodyEditor })),
)

// Hover-intent prefetch: the browser dedupes this against the lazy boundary's
// own import, so pointerdown activation almost never waits on the network.
const warmEditorChunk = () => void import('@/ui/public/comments/CommentBodyEditor')

export interface LazyCommentBodyEditorProps extends Omit<CommentBodyEditorProps, 'labels'> {
  /** Mount the real editor immediately (edit forms / admin dialogs — the
   *  click that opened the surface WAS the interaction). Default: wait for
   *  the user to point at or focus the placeholder (the always-visible reply
   *  form). */
  eager?: boolean
}

export function LazyCommentBodyEditor({ eager = false, disabled, className, ...props }: LazyCommentBodyEditorProps) {
  const { locale } = useI18n()
  const [active, setActive] = useState(eager)
  // Workspace documents ship the active locale's table in the root payload;
  // public documents do not, and load only the ACTIVE locale's chunk after the
  // interaction that mounts the composer.
  const payloadLabels = useKobatoInklingLabels()
  const [labels, setLabels] = useState<InklingLabelsInput | undefined>(payloadLabels)
  const labelsReady = payloadLabels !== undefined || labels !== undefined
  // display:contents keeps the wrapper out of the layout box tree while still
  // scoping the contenteditable lookup to THIS editor instance.
  const shellRef = useRef<HTMLDivElement | null>(null)
  const focusOnLoadRef = useRef(false)

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

  // Hover-intent prefetch reaches BOTH chunks the activation needs: the
  // composer island and the active locale's label table. Without the label
  // prefetch, a touch device's first tap would serialize the composer import
  // behind a second chunk request before the composer can mount.
  const warmChunks = useCallback(() => {
    warmEditorChunk()
    if (payloadLabels === undefined) {
      // A failed prefetch is harmless — activation retries and degrades to
      // Inkling's English defaults.
      void loadInklingLabels(locale).catch(() => null)
    }
  }, [locale, payloadLabels])

  const activate = useCallback(() => {
    if (disabled === true) {
      return
    }
    focusOnLoadRef.current = true
    // Start both chunks now: the composer chunk and the active locale's label
    // table load in parallel; the composer mounts only once the labels arrive.
    warmChunks()
    setActive(true)
  }, [disabled, warmChunks])

  // Fetch the active locale's table once activated. A failed import degrades to
  // Inkling's English defaults instead of blocking the composer.
  useEffect(() => {
    if (!active || labelsReady) {
      return
    }
    let cancelled = false
    void loadInklingLabels(locale).then(
      (table) => {
        if (!cancelled) {
          setLabels(table)
        }
      },
      () => {
        // English defaults; `labelsReady` follows from `labels !== undefined`.
        if (!cancelled) {
          setLabels({})
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [active, labelsReady, locale])

  if (!active) {
    return <EditorPlaceholder disabled={disabled} className={className} onActivate={activate} onPrefetch={warmChunks} />
  }

  return (
    <div ref={shellRef} className="contents">
      {labelsReady ? (
        <Suspense fallback={<EditorPlaceholder disabled={disabled} className={className} />}>
          <MountedEditor
            {...props}
            labels={labels}
            disabled={disabled}
            className={className}
            onMounted={handleEditorMounted}
          />
        </Suspense>
      ) : (
        // The interaction is already committed; the placeholder stays inert
        // while the labels chunk resolves (the composer chunk loads alongside).
        <EditorPlaceholder disabled={disabled} className={className} />
      )}
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
  onPrefetch?: () => void
}

/** SSR/hydration-stable stand-in for the unloaded composer: the same shell
 *  chrome and the same canvas box (the 96px min-height + canvas padding that
 *  `inkling-comment-editor.css` puts on the real contentEditable, duplicated
 *  here because that stylesheet rides the lazy chunk). */
function EditorPlaceholder({ disabled, className, onActivate, onPrefetch }: EditorPlaceholderProps) {
  const { t } = useI18n()
  const interactive = onActivate !== undefined && disabled !== true
  return (
    <div
      className={cn('kobato-comment-editor rounded-md border border-line bg-transparent', className)}
      {...(interactive
        ? {
            role: 'textbox',
            'aria-multiline': true,
            'aria-label': t('public.comments.editorLabel'),
            tabIndex: 0,
            onPointerEnter: onPrefetch,
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
