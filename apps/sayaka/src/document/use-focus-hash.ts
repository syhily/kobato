import { flashCommentTarget } from '@sayaka/ui/comments/comment-item/comment-flash'
import { useEffect } from 'react'
import { useLocation } from 'react-router'

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
      const target = document.getElementById(hash.slice(1))
      if (target === null) {
        return false
      }

      const rect = target.getBoundingClientRect()
      const targetTop = rect.top + window.scrollY
      const distance = Math.abs(targetTop - window.scrollY)

      const fire = () => {
        clearScrollListeners()
        if (isCommentHash) {
          flashCommentTarget(hash.slice('#user-comment-'.length))
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
