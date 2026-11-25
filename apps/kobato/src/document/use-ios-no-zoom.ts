import {
  acquireViewportZoomLock,
  isIosWebKit,
  releaseViewportZoomLock,
} from '@kobato/web-public/ui/comments/viewport-zoom-lock'
import { useEffect, useLayoutEffect, useRef } from 'react'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const FOCUS_SAFETY_MS = 500

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
      release()
    }
  }, [])
}
