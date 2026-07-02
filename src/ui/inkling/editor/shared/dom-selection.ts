/** Narrowly-typed window.getSelection() accessor. Avoids the unsafe
 *  `(window as unknown as {...}).getSelection?.()` pattern that triggers
 *  oxlint no-unsafe-type-assertion in every file that queries the DOM
 *  selection bounding rect. */

export function getWindowSelection(): Selection | null {
  return window.getSelection()
}

export function getSelectionRect(el?: HTMLElement | null): DOMRect | null {
  const sel = getWindowSelection()
  if (sel === null || sel.rangeCount === 0) {
    return null
  }
  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  if (el) {
    const rootRect = el.getBoundingClientRect()
    return {
      top: rect.top - rootRect.top,
      left: rect.left - rootRect.left,
      bottom: rect.bottom - rootRect.top,
      right: rect.right - rootRect.left,
      width: rect.width,
      height: rect.height,
      x: rect.x - rootRect.left,
      y: rect.y - rootRect.top,
      toJSON() {
        return this
      },
    } as DOMRect
  }
  return rect
}

export function getAnchorTextBeforeCaret(): string | null {
  const sel = getWindowSelection()
  if (sel === null) {
    return null
  }
  const { anchorNode, anchorOffset } = sel
  if (anchorNode === null || anchorNode.nodeType !== Node.TEXT_NODE) {
    return null
  }
  return (anchorNode.textContent ?? '').slice(0, anchorOffset)
}

export function isAnchorAfterCaret(char: string): boolean {
  const sel = getWindowSelection()
  if (sel === null) {
    return false
  }
  const { anchorNode, anchorOffset } = sel
  if (anchorNode === null || anchorNode.nodeType !== Node.TEXT_NODE) {
    return false
  }
  return (anchorNode.textContent ?? '')[anchorOffset - 1] === char
}
