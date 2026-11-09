/**
 * Refcounted iOS viewport zoom lock.
 *
 * iOS Safari zooms into a focused control whose font-size is under 16px —
 * the comment composer's contenteditable canvas included. The zoom decision
 * reads the viewport meta at focus time, so the lock must be held across
 * every activation that ends in a focus (placeholder tap → chunk load →
 * mount → focus handoff), and it must be released only after the editable
 * has actually taken focus — pinch-zoom stays available the rest of the
 * time.
 *
 * Refcounting lets independent holders overlap — the document-level form
 * control tracker (`useIosNoZoomOnFocus`) and the comment composer's
 * activation handoff — without racing the same `<meta>` rewrite. Duplicate
 * installs remain banned for the same reason: one module, refcounted.
 * iOS/iPadOS WebKit only; every other platform no-ops.
 */

const LOCKED_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'

let holders = 0
let lockedMeta: HTMLMetaElement | null = null
let originalContent: string | null = null

export function isIosWebKit(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const ua = window.navigator.userAgent
  // iPhone / iPod / classic iPad UA strings.
  if (/iPad|iPhone|iPod/.test(ua)) {
    return true
  }
  // iPadOS 13+ identifies as Macintosh; disambiguate via touch support.
  return ua.includes('Macintosh') && navigator.maxTouchPoints > 1
}

/** Freeze viewport scaling (no-op off iOS or without a viewport meta). */
export function acquireViewportZoomLock(): void {
  if (typeof document === 'undefined' || !isIosWebKit()) {
    return
  }
  holders += 1
  if (holders > 1) {
    return
  }
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!meta) {
    return
  }
  lockedMeta = meta
  originalContent = meta.getAttribute('content')
  meta.setAttribute('content', LOCKED_VIEWPORT)
}

/** Drop one hold; the meta is restored only when the last holder leaves. */
export function releaseViewportZoomLock(): void {
  if (holders === 0) {
    return
  }
  holders -= 1
  if (holders > 0) {
    return
  }
  if (lockedMeta !== null && originalContent !== null) {
    lockedMeta.setAttribute('content', originalContent)
  }
  lockedMeta = null
  originalContent = null
}
