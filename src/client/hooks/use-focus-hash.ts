import { useEffect } from 'react'
import { useLocation } from 'react-router'

// Smooth-scroll to the URL hash; flash a comment node for `#user-comment-<id>`.
// The target may stream in late (comments load via `<Suspense>`), so watch DOM
// mutations until it lands or a ceiling elapses.
const TARGET_WAIT_MS = 5000
const SCROLL_SETTLE_FALLBACK_MS = 300
const NO_SCROLL_THRESHOLD_PX = 4

export function useFocusHash(): void {
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) {
      return
    }

    let observer: MutationObserver | undefined
    let targetWaitTimeoutId: number | undefined
    let scrollSettleTimeoutId: number | undefined
    let scrollEndHandler: (() => void) | undefined

    const clearScrollListeners = () => {
      if (scrollSettleTimeoutId !== undefined) {
        window.clearTimeout(scrollSettleTimeoutId)
        scrollSettleTimeoutId = undefined
      }
      if (scrollEndHandler !== undefined) {
        window.removeEventListener('scrollend', scrollEndHandler)
        scrollEndHandler = undefined
      }
    }

    const isCommentHash = hash.startsWith('#user-comment-')

    const focusOnce = (): boolean => {
      const target = document.querySelector<HTMLElement>(hash)
      if (target === null) {
        return false
      }

      const rect = target.getBoundingClientRect()
      const targetTop = rect.top + window.scrollY
      const distance = Math.abs(targetTop - window.scrollY)

      const fire = () => {
        clearScrollListeners()
        if (isCommentHash) {
          flashComment(target)
        }
      }

      if (distance < NO_SCROLL_THRESHOLD_PX) {
        fire()
        return true
      }

      window.scroll({ top: targetTop, left: 0, behavior: 'smooth' })

      scrollEndHandler = fire
      window.addEventListener('scrollend', fire, { once: true })
      scrollSettleTimeoutId = window.setTimeout(fire, SCROLL_SETTLE_FALLBACK_MS)
      return true
    }

    if (!focusOnce()) {
      observer = new MutationObserver(() => {
        if (focusOnce()) {
          observer?.disconnect()
          observer = undefined
          if (targetWaitTimeoutId !== undefined) {
            window.clearTimeout(targetWaitTimeoutId)
            targetWaitTimeoutId = undefined
          }
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      targetWaitTimeoutId = window.setTimeout(() => observer?.disconnect(), TARGET_WAIT_MS)
    }

    return () => {
      observer?.disconnect()
      if (targetWaitTimeoutId !== undefined) {
        window.clearTimeout(targetWaitTimeoutId)
      }
      clearScrollListeners()
    }
  }, [hash])
}

function flashComment(target: HTMLElement): void {
  for (const node of document.querySelectorAll<HTMLElement>('article.comment-body')) {
    node.classList.remove('active')
  }
  // The hash points at `<li id="user-comment-N">`; the flash lives on the
  // `<article>` wrapper inside it.
  const article = target.querySelector<HTMLElement>('article.comment-body')
  if (article === null) {
    return
  }
  // Force a reflow so the CSS animation restarts when re-targeting the same comment.
  void article.offsetWidth
  article.classList.add('active')
}
