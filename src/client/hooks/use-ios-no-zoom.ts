import { useEffect, useLayoutEffect, useRef } from 'react'

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// iOS Safari zooms into focused controls with `font-size < 16px`; lock
// viewport scaling while one is focused, restore on blur. Mount ONCE —
// duplicate installs race the same `<meta>` rewrite. iOS/iPadOS only.
export function useIosNoZoomOnFocus(): void {
  const originalContentRef = useRef<string | null>(null)

  useBrowserLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (!isIos()) {
      return
    }

    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (!meta) {
      return
    }

    const isFormControl = (target: EventTarget | null): target is HTMLElement => {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      const tag = target.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }

    const onFocusIn = (event: FocusEvent) => {
      if (!isFormControl(event.target)) {
        return
      }
      if (originalContentRef.current !== null) {
        return
      }
      originalContentRef.current = meta.getAttribute('content')
      meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    }

    const onFocusOut = (event: FocusEvent) => {
      if (!isFormControl(event.target)) {
        return
      }
      // Keep the lock while focus moves between form controls — restoring
      // mid-tab would let Safari re-zoom on every keystroke.
      if (isFormControl(event.relatedTarget)) {
        return
      }
      const original = originalContentRef.current
      if (original !== null) {
        meta.setAttribute('content', original)
      }
      originalContentRef.current = null
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      // Restore the original meta if a control is still focused at unmount.
      if (originalContentRef.current !== null) {
        meta.setAttribute('content', originalContentRef.current)
        originalContentRef.current = null
      }
    }
  }, [])
}

function isIos(): boolean {
  const ua = window.navigator.userAgent
  // iPhone / iPod / classic iPad UA strings.
  if (/iPad|iPhone|iPod/.test(ua)) {
    return true
  }
  // iPadOS 13+ identifies as Macintosh; disambiguate via touch support.
  return ua.includes('Macintosh') && navigator.maxTouchPoints > 1
}
