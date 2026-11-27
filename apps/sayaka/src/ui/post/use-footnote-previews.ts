import { sanitizeHtml } from '@kobato/base/sanitize/sanitize-html'
import { type RefObject, useEffect } from 'react'

const GAP = 8
const ARROW_HALF = 6

export function useFootnotePreviews(containerRef: RefObject<HTMLElement | null>, bodyHtml: string): void {
  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }

    const anchors = container.querySelectorAll<HTMLAnchorElement>('sup a[href^="#user-content-fn-"]')
    if (anchors.length === 0) {
      return
    }

    const popover = document.createElement('div')
    popover.className = 'footnote-preview'
    popover.setAttribute('role', 'tooltip')
    popover.hidden = true
    document.body.appendChild(popover)

    const show = (anchor: HTMLAnchorElement) => {
      const href = anchor.getAttribute('href')
      if (href === null || !href.startsWith('#')) {
        return
      }
      const target = document.getElementById(href.slice(1))
      if (target === null) {
        return
      }
      const clone = target.cloneNode(true)
      if (!(clone instanceof HTMLElement)) {
        return
      }
      for (const backref of clone.querySelectorAll('[data-footnote-backref]')) {
        backref.remove()
      }
      popover.innerHTML = sanitizeHtml(clone.innerHTML, 'body')

      const rect = anchor.getBoundingClientRect()
      popover.hidden = false
      const width = popover.offsetWidth
      const height = popover.offsetHeight
      const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 8), window.innerWidth - width - 8)
      const above = rect.top - height - GAP >= GAP
      popover.dataset.side = above ? 'top' : 'bottom'
      const top = above ? rect.top - height - GAP : rect.bottom + GAP
      popover.style.left = `${String(left)}px`
      popover.style.top = `${String(top)}px`
      const arrowX = Math.min(Math.max(rect.left + rect.width / 2 - left, ARROW_HALF + 4), width - ARROW_HALF - 4)
      popover.style.setProperty('--footnote-arrow-x', `${String(arrowX)}px`)
    }

    const hide = () => {
      popover.hidden = true
    }

    const listeners: Array<[HTMLAnchorElement, string, EventListener]> = []
    for (const anchor of anchors) {
      const onEnter = () => {
        show(anchor)
      }
      const onLeave = () => {
        hide()
      }
      anchor.addEventListener('mouseenter', onEnter)
      anchor.addEventListener('focus', onEnter)
      anchor.addEventListener('mouseleave', onLeave)
      anchor.addEventListener('blur', onLeave)
      listeners.push(
        [anchor, 'mouseenter', onEnter],
        [anchor, 'focus', onEnter],
        [anchor, 'mouseleave', onLeave],
        [anchor, 'blur', onLeave],
      )
    }
    window.addEventListener('scroll', hide, { passive: true })

    return () => {
      for (const [anchor, event, listener] of listeners) {
        anchor.removeEventListener(event, listener)
      }
      window.removeEventListener('scroll', hide)
      popover.remove()
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [containerRef, bodyHtml])
}
