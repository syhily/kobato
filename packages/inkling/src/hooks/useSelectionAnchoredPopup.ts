import { getScrollAncestor } from '@kobato/inkling-internal/utils/scroll-ancestor'
import {
  resolveAnchoredPopupPlacement,
  type PopupAnchor,
  type PopupRectLike,
} from '@kobato/inkling-internal/utils/selection-anchored-popup'
import { type LexicalEditor } from 'lexical'
import React from 'react'

interface UseSelectionAnchoredPopupOptions {
  editor: LexicalEditor
  popupRef: React.RefObject<HTMLElement | null>
  anchor: PopupAnchor
  containerRect: () => PopupRectLike | null
  aboveGap?: number
  positioning?: 'fixed' | 'absolute'
  coordinateScale?: () => number
  absoluteEdge?: 'below' | 'at-anchor'
  absoluteFlip?: 'measured' | 'never'
}

export function useSelectionAnchoredPopup({
  editor,
  popupRef,
  anchor,
  containerRect,
  aboveGap,
  positioning = 'fixed',
  coordinateScale,
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
        coordinateScale: coordinateScale?.(),
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
  }, [
    editor,
    popupRef,
    anchor,
    containerRect,
    scrollContainer,
    aboveGap,
    positioning,
    coordinateScale,
    absoluteEdge,
    absoluteFlip,
  ])

  React.useEffect(() => {
    updatePopupPosition()
  }, [updatePopupPosition])

  usePopupRepositionSubscriptions(updatePopupPosition, scrollContainer, popupRef)

  return updatePopupPosition
}

export function usePopupRepositionSubscriptions(
  update: () => void,
  scrollElement: HTMLElement,
  observeRef?: React.RefObject<HTMLElement | null>,
) {
  const [observedElement, setObservedElement] = React.useState<HTMLElement | null>(null)
  // oxlint-disable-next-line react-hooks/exhaustive-deps
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
