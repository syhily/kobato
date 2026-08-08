import type { RefObject } from 'react'

import { useEffect, useState } from 'react'

// Shared scroll-position observer for floating "back to top" buttons;
// rAF-coalesced so `setState` fires at most once per frame. With
// `scrollRootRef` (admin `<main>`), depth is read from that element instead
// of `window` — the admin shell pins the document and scrolls inside `main`.
export function useShowOnScroll(threshold: number = 300, scrollRootRef?: RefObject<Element | null>): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let rafHandle = 0
    const update = () => {
      rafHandle = 0
      const root = scrollRootRef?.current ?? null
      const top = root !== null ? root.scrollTop : window.scrollY
      setShow(top > threshold)
    }
    const schedule = () => {
      if (rafHandle !== 0) {
        return
      }
      rafHandle = window.requestAnimationFrame(update)
    }
    const root = scrollRootRef?.current ?? null
    const scrollTarget: Window | Element = root ?? window
    scrollTarget.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    update()
    return () => {
      if (rafHandle !== 0) {
        window.cancelAnimationFrame(rafHandle)
      }
      scrollTarget.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [threshold, scrollRootRef])

  return show
}
