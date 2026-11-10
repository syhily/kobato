import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'

import type { InklingLabelsInput } from '@/inkling'
import type { AppLocale } from '@/shared/i18n/locales'
import type { CommentBodyEditorProps } from '@/ui/public/comments/CommentBodyEditor'

import { loadInklingLabels, useKobatoInklingLabels } from '@/client/editor/inkling-labels'
import { acquireViewportZoomLock, releaseViewportZoomLock } from '@/client/lib/viewport-zoom-lock'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

// The composer rides a lazy chunk (inkling island + CSS) so the public post page's
// static import graph stays editor-free.
const CommentBodyEditor = lazy(() =>
  import('@/ui/public/comments/CommentBodyEditor').then((module) => ({ default: module.CommentBodyEditor })),
)

// Hover-intent prefetch; the browser dedupes this against the lazy boundary's own import.
const warmEditorChunk = () => void import('@/ui/public/comments/CommentBodyEditor')

/** Intent prefetch for surfaces that mount the composer on a click: warms the composer
 *  chunk and the active locale's label table, so the eager mount lands ready for input. */
export function warmCommentEditorChunks(locale: AppLocale): void {
  warmEditorChunk()
  void loadInklingLabels(locale).catch(() => null)
}

export interface LazyCommentBodyEditorProps extends Omit<CommentBodyEditorProps, 'labels'> {
  /** Mount the real editor immediately (edit forms, admin dialogs). Default: wait for the
   *  user to point at or focus the placeholder (the always-visible reply form). */
  eager?: boolean
  /** Hand focus to the contenteditable once the editor mounts (inline reply / edit
   *  forms). Evaluated at mount; remount the surface to focus again. */
  focusOnMount?: boolean
}

export function LazyCommentBodyEditor({
  eager = false,
  focusOnMount = false,
  disabled,
  className,
  ...props
}: LazyCommentBodyEditorProps) {
  const { locale } = useI18n()
  const [active, setActive] = useState(eager)
  // Workspace documents ship the table in the root payload; public documents load only
  // the active locale's chunk after the interaction that mounts the composer.
  const payloadLabels = useKobatoInklingLabels()
  const [labels, setLabels] = useState<InklingLabelsInput | undefined>(payloadLabels)
  const labelsReady = payloadLabels !== undefined || labels !== undefined
  // display:contents keeps the wrapper out of the layout box tree while scoping the
  // contenteditable lookup to this editor instance.
  const shellRef = useRef<HTMLDivElement | null>(null)
  const focusOnLoadRef = useRef(focusOnMount)
  // iOS decides the input auto-zoom when focus lands, so the viewport stays locked from
  // the activation intent until the contenteditable has actually taken focus.
  const zoomLockHeldRef = useRef(false)
  const releaseTimerRef = useRef<number | null>(null)

  const holdZoomLock = useCallback(() => {
    if (!zoomLockHeldRef.current) {
      zoomLockHeldRef.current = true
      acquireViewportZoomLock()
    }
  }, [])

  const dropZoomLock = useCallback(() => {
    if (!zoomLockHeldRef.current) {
      return
    }
    zoomLockHeldRef.current = false
    releaseViewportZoomLock()
  }, [])

  // Release one task after focus() so WebKit's zoom decision already saw the locked
  // viewport; pinch-zoom then returns for the editing session.
  const scheduleZoomLockRelease = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      return
    }
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null
      dropZoomLock()
    }, 0)
  }, [dropZoomLock])

  // Never leak the lock: an unmount before the focus handoff cancels the activation.
  useEffect(
    () => () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current)
        releaseTimerRef.current = null
      }
      dropZoomLock()
    },
    [dropZoomLock],
  )

  // The activating pointerdown/focus landed on the placeholder, which is gone by mount;
  // hand focus over once the contenteditable exists (a replayed event would not).
  const handleEditorMounted = useCallback(() => {
    if (!focusOnLoadRef.current) {
      return
    }
    focusOnLoadRef.current = false
    // The lock must be in place before the focus call: iOS reads the viewport meta
    // when the editable becomes the active element.
    holdZoomLock()
    shellRef.current?.querySelector<HTMLElement>('[contenteditable]')?.focus({ preventScroll: true })
    scheduleZoomLockRelease()
  }, [holdZoomLock, scheduleZoomLockRelease])

  // Prefetch both chunks activation needs: without the label table, a touch device's
  // first tap serializes the composer import behind a second chunk request.
  const warmChunks = useCallback(() => {
    warmEditorChunk()
    if (payloadLabels === undefined) {
      // A failed prefetch is harmless: activation retries and degrades to English defaults.
      void loadInklingLabels(locale).catch(() => null)
    }
  }, [locale, payloadLabels])

  const activate = useCallback(() => {
    if (disabled === true) {
      return
    }
    focusOnLoadRef.current = true
    // Lock zoom from the tap itself: both chunks may still be in flight when the
    // editor mounts and takes focus.
    holdZoomLock()
    warmChunks()
    setActive(true)
  }, [disabled, holdZoomLock, warmChunks])

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
        // The interaction is committed; the placeholder stays inert while the labels
        // chunk resolves.
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

/** SSR/hydration-stable stand-in for the unloaded composer. It duplicates the 96px
 *  min-height and canvas padding that `inkling-comment-editor.css` puts on the real
 *  contentEditable, because that stylesheet rides the lazy chunk. */
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
            // preventDefault keeps the browser from focusing a node about to unmount.
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
