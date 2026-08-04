import { useEffect, useRef } from 'react'

export interface UseSyncScrollOptions {
  editorRef: React.RefObject<HTMLElement | null>
  previewRef: React.RefObject<HTMLElement | null>
  enabled: boolean
}

type ActiveSource = 'editor' | 'preview' | null

function applyRatio(source: HTMLElement, target: HTMLElement) {
  const sourceMax = source.scrollHeight - source.clientHeight
  const targetMax = target.scrollHeight - target.clientHeight
  if (sourceMax <= 0 || targetMax <= 0) {
    return
  }
  const ratio = source.scrollTop / sourceMax
  const nextTargetTop = ratio * targetMax
  if (Math.abs(target.scrollTop - nextTargetTop) > 1) {
    target.scrollTop = nextTargetTop
  }
}

/**
 * Bidirectional ratio-based scroll sync between the editor canvas and the
 * live-preview pane. The pane the user last interacted with becomes the
 * active source; the other pane follows via scroll-ratio mapping.
 *
 * `scrollTop / (scrollHeight - clientHeight)` is mapped onto the target's
 * equivalent range. This is the same strategy VS Code and GitHub use for
 * markdown preview sync — simple, robust to content changes, and good enough
 * because both panes share the same `prose-blog` stylesheet so block heights
 * stay roughly proportional.
 */
export function useSyncScroll({ editorRef, previewRef, enabled }: UseSyncScrollOptions): void {
  const activeSourceRef = useRef<ActiveSource>(null)
  const isSyncingRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      activeSourceRef.current = null
      isSyncingRef.current = false
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    const editor = editorRef.current
    const preview = previewRef.current
    if (editor === null || preview === null) {
      return
    }

    function onEditorScroll() {
      if (isSyncingRef.current) {
        return
      }
      activeSourceRef.current = 'editor'
      isSyncingRef.current = true
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const src = editorRef.current
        const tgt = previewRef.current
        if (src !== null && tgt !== null) {
          applyRatio(src, tgt)
        }
        isSyncingRef.current = false
      })
    }

    function onPreviewScroll() {
      if (isSyncingRef.current) {
        return
      }
      activeSourceRef.current = 'preview'
      isSyncingRef.current = true
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const src = previewRef.current
        const tgt = editorRef.current
        if (src !== null && tgt !== null) {
          applyRatio(src, tgt)
        }
        isSyncingRef.current = false
      })
    }

    editor.addEventListener('scroll', onEditorScroll, { passive: true })
    preview.addEventListener('scroll', onPreviewScroll, { passive: true })

    return () => {
      editor.removeEventListener('scroll', onEditorScroll)
      preview.removeEventListener('scroll', onPreviewScroll)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [enabled, editorRef, previewRef])
}
