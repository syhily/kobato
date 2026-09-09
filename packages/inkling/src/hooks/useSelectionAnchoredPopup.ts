import { type LexicalEditor } from 'lexical'
import React from 'react'

import { getScrollAncestor } from '@/utils/scroll-ancestor'
import { resolveAnchoredPopupPlacement, type PopupAnchor, type PopupRectLike } from '@/utils/selection-anchored-popup'

interface UseSelectionAnchoredPopupOptions {
  editor: LexicalEditor
  popupRef: React.RefObject<HTMLElement | null>
  /** Anchor-rect adapter (node element or selection range); resolved inside an editor update. */
  anchor: PopupAnchor
  /** Fixed mode: rect the popup spans horizontally. Absolute mode: the positioning parent's rect. */
  containerRect: () => PopupRectLike | null
  /** Gap above the anchor when the popup flips; defaults to the below gap. */
  aboveGap?: number
  /** 'fixed' (default): viewport coords, container-spanning width. 'absolute': parent-relative offsets at natural width. */
  positioning?: 'fixed' | 'absolute'
  /** Absolute mode: the unflipped popup sits below the anchor or at the anchor's top. */
  absoluteEdge?: 'below' | 'at-anchor'
  /** Absolute mode: 'measured' flips when below overflows the viewport and the popup fits above. */
  absoluteFlip?: 'measured' | 'never'
}

/**
 * React adapter over @/utils/selection-anchored-popup: positions popupRef
 * against its anchor, then keeps it positioned across window resize, container
 * scroll, and popup content mutations. Returns the reposition callback so a
 * consumer can request an extra pass (e.g. after loading content).
 */
export function useSelectionAnchoredPopup({
  editor,
  popupRef,
  anchor,
  containerRect,
  aboveGap,
  positioning = 'fixed',
  absoluteEdge,
  absoluteFlip,
}: UseSelectionAnchoredPopupOptions) {
  const scrollContainer = React.useMemo(() => getScrollAncestor(editor.getRootElement()), [editor])

  const updatePopupPosition = React.useCallback(() => {
    editor.update(() => {
      const popupElement = popupRef.current
      if (!popupElement) {
        return
      }

      const anchorRect = anchor()
      const container = containerRect()
      if (!anchorRect || !container) {
        return
      }

      if (positioning === 'fixed') {
        // Span the container first so the popup height is measured at its final
        // width (wrapping changes with width), then resolve below/flip.
        popupElement.style.left = `${container.left}px`
        popupElement.style.width = `${container.right - container.left}px`
      }

      const placement = resolveAnchoredPopupPlacement({
        anchorRect,
        containerRect: container,
        popupHeight: popupElement.getBoundingClientRect().height,
        scrollTop: scrollContainer.scrollTop,
        scrollHeight: scrollContainer.scrollHeight,
        viewportHeight: window.innerHeight,
        aboveGap,
        positioning,
        absoluteEdge,
        absoluteFlip,
      })

      popupElement.style.top = placement.top === undefined ? '' : `${placement.top}px`
      popupElement.style.bottom = placement.bottom === undefined ? '' : `${placement.bottom}px`
      popupElement.style.left = `${placement.left}px`
      if (placement.width !== undefined) {
        popupElement.style.width = `${placement.width}px`
      }
    })
  }, [editor, popupRef, anchor, containerRect, scrollContainer, aboveGap, positioning, absoluteEdge, absoluteFlip])

  React.useEffect(() => {
    updatePopupPosition()
  }, [updatePopupPosition])

  usePopupRepositionSubscriptions(updatePopupPosition, scrollContainer, popupRef)

  return updatePopupPosition
}

/**
 * The reposition subscription set: window resize, container scroll, and — when
 * observeRef is given — popup content mutations (results arriving/leaving
 * change the popup height, which matters when it is flipped above its anchor).
 */
export function usePopupRepositionSubscriptions(
  update: () => void,
  scrollElement: HTMLElement,
  observeRef?: React.RefObject<HTMLElement | null>,
) {
  // The observed element arrives through a ref, which render must not read —
  // a post-commit effect mirrors the current element into state so a
  // late-mounted popup (its ref goes null → element on the render that mounts
  // it) re-runs the subscription effect and re-attaches the MutationObserver.
  const [observedElement, setObservedElement] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => {
    const element = observeRef?.current ?? null
    if (element !== observedElement) {
      setObservedElement(element)
    }
  })

  React.useEffect(() => {
    const onReposition = () => update()
    window.addEventListener('resize', onReposition)
    scrollElement.addEventListener('scroll', onReposition)

    const observer = observeRef ? new MutationObserver(onReposition) : null
    if (observedElement) {
      observer?.observe(observedElement, { childList: true, subtree: true })
    }

    return () => {
      window.removeEventListener('resize', onReposition)
      scrollElement.removeEventListener('scroll', onReposition)
      observer?.disconnect()
    }
  }, [update, scrollElement, observeRef, observedElement])
}
