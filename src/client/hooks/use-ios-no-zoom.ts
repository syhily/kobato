import { useEffect, useLayoutEffect, useRef } from 'react'

import { acquireViewportZoomLock, isIosWebKit, releaseViewportZoomLock } from '@/client/lib/viewport-zoom-lock'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// A tap that never focuses (drag away, cancelled touch) must not hold the
// viewport hostage — focus follows touchend within a couple of hundred ms.
const FOCUS_SAFETY_MS = 500

// iOS Safari zooms into focused controls with `font-size < 16px`. The zoom
// is decided when the TAP'S DEFAULT ACTION focuses the target — rewriting
// the viewport meta from `focusin` is already too late. The lock is
// therefore taken at `pointerdown` in the capture phase, before any default
// action can run. Form controls keep the lock for their whole focused
// session (the keyboard's "next" hop focuses the next control with no
// pointerdown to relock it); a contenteditable canvas releases on the task
// after its focus lands, so pinch-zoom returns while typing. The lock is
// the shared refcounted one (`@/client/lib/viewport-zoom-lock`), also held
// by the comment composer's activation handoff. Mount ONCE at the document
// root — duplicate installs race the same `<meta>` rewrite. iOS/iPadOS only.
export function useIosNoZoomOnFocus(): void {
  const holdsLockRef = useRef(false)

  useBrowserLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (!isIosWebKit()) {
      return
    }

    let releaseTimer: number | null = null
    let safetyTimer: number | null = null

    const clearReleaseTimer = () => {
      if (releaseTimer !== null) {
        window.clearTimeout(releaseTimer)
        releaseTimer = null
      }
    }

    const lock = () => {
      clearReleaseTimer()
      if (!holdsLockRef.current) {
        holdsLockRef.current = true
        acquireViewportZoomLock()
      }
    }

    const release = () => {
      clearReleaseTimer()
      if (safetyTimer !== null) {
        window.clearTimeout(safetyTimer)
        safetyTimer = null
      }
      if (!holdsLockRef.current) {
        return
      }
      holdsLockRef.current = false
      releaseViewportZoomLock()
    }

    const releaseNextTask = () => {
      if (releaseTimer !== null || !holdsLockRef.current) {
        return
      }
      releaseTimer = window.setTimeout(() => {
        releaseTimer = null
        release()
      }, 0)
    }

    const isFormControl = (target: EventTarget | null): target is HTMLElement => {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }
    // True for the contenteditable itself and for any node tapped inside it.
    const isEditableCanvas = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement && target.isContentEditable
    const isZoomSensitive = (target: EventTarget | null): boolean => isFormControl(target) || isEditableCanvas(target)

    const onPointerDown = (event: PointerEvent) => {
      if (!isZoomSensitive(event.target)) {
        return
      }
      lock()
      if (safetyTimer !== null) {
        window.clearTimeout(safetyTimer)
      }
      safetyTimer = window.setTimeout(release, FOCUS_SAFETY_MS)
    }

    const onFocusIn = (event: FocusEvent) => {
      if (safetyTimer !== null) {
        window.clearTimeout(safetyTimer)
        safetyTimer = null
      }
      if (isEditableCanvas(event.target)) {
        // The activation is what must stay zoom-free, not the whole editing
        // session — hand pinch-zoom back once the focus (and its zoom
        // decision) has landed.
        releaseNextTask()
      }
    }

    const onFocusOut = (event: FocusEvent) => {
      if (safetyTimer !== null) {
        window.clearTimeout(safetyTimer)
        safetyTimer = null
      }
      if (!isZoomSensitive(event.target)) {
        return
      }
      // Keep the lock while focus hops between zoom-sensitive controls — the
      // "next" key focuses the next input with no pointerdown to relock it.
      if (isZoomSensitive(event.relatedTarget)) {
        return
      }
      releaseNextTask()
    }

    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, { capture: true })
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      // Release the lock if a control is still focused at unmount.
      release()
    }
  }, [])
}
