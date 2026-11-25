import type { AppLocale } from '@kobato/i18n/locales'
import type { InklingLabelsInput } from '@kobato/inkling'
import type { CommentBodyEditorProps } from '@kobato/web-public/ui/comments/CommentBodyEditor'

import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { acquireViewportZoomLock, releaseViewportZoomLock } from '@kobato/web-public/ui/comments/viewport-zoom-lock'
import { loadInklingLabels, useKobatoInklingLabels } from '@kobato/web-public/ui/shared/editor/inkling-labels'
import { type PointerEvent, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
const CommentBodyEditor = lazy(() =>
  import('@kobato/web-public/ui/comments/CommentBodyEditor').then((module) => ({
    default: module.CommentBodyEditor,
  })),
)

const warmEditorChunk = () => void import('@kobato/web-public/ui/comments/CommentBodyEditor')

export function warmCommentEditorChunks(locale: AppLocale): void {
  warmEditorChunk()
  void loadInklingLabels(locale).catch(() => null)
}

export interface LazyCommentBodyEditorProps extends Omit<CommentBodyEditorProps, 'labels'> {
  eager?: boolean
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
  const payloadLabels = useKobatoInklingLabels()
  const [labels, setLabels] = useState<InklingLabelsInput | undefined>(payloadLabels)
  const labelsReady = payloadLabels !== undefined || labels !== undefined
  const shellRef = useRef<HTMLDivElement | null>(null)
  const focusOnLoadRef = useRef(focusOnMount)
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

  const scheduleZoomLockRelease = useCallback(() => {
    if (releaseTimerRef.current !== null) {
      return
    }
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null
      dropZoomLock()
    }, 0)
  }, [dropZoomLock])

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

  const handleEditorMounted = useCallback(() => {
    if (!focusOnLoadRef.current) {
      return
    }
    focusOnLoadRef.current = false
    holdZoomLock()
    shellRef.current?.querySelector<HTMLElement>('[contenteditable]')?.focus({ preventScroll: true })
    scheduleZoomLockRelease()
  }, [holdZoomLock, scheduleZoomLockRelease])

  const warmChunks = useCallback(() => {
    warmEditorChunk()
    if (payloadLabels === undefined) {
      void loadInklingLabels(locale).catch(() => null)
    }
  }, [locale, payloadLabels])

  const activate = useCallback(() => {
    if (disabled === true) {
      return
    }
    focusOnLoadRef.current = true
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
            onPointerDown: (event: PointerEvent) => {
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
