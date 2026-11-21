import type { LexicalEditor } from 'lexical'

export const FOCUS_MODE_CLASS = 'inkling-focus-mode'
export const FOCUS_ACTIVE_ATTRIBUTE = 'data-inkling-focus-active'

export function getFocusedBlockElement(rootElement: HTMLElement): HTMLElement | null {
  const nativeSelection = window.getSelection()
  if (!nativeSelection || nativeSelection.rangeCount === 0) {
    return null
  }
  const { anchorNode, anchorOffset } = nativeSelection
  if (anchorNode === null || !rootElement.contains(anchorNode)) {
    return null
  }
  if (anchorNode === rootElement) {
    const child = rootElement.children[Math.min(anchorOffset, rootElement.children.length - 1)]
    return child instanceof HTMLElement ? child : null
  }
  let element: Node | null = anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentNode : anchorNode
  while (element !== null && element.parentNode !== rootElement) {
    element = element.parentNode
  }
  return element instanceof HTMLElement ? element : null
}

export function registerFocusMode(editor: LexicalEditor): () => void {
  let detachRoot: (() => void) | null = null
  const attach = (rootElement: HTMLElement) => {
    let focusedElement: HTMLElement | null = null
    const sync = () => {
      const next = getFocusedBlockElement(rootElement)
      if (next === focusedElement) {
        return
      }
      focusedElement?.removeAttribute(FOCUS_ACTIVE_ATTRIBUTE)
      next?.setAttribute(FOCUS_ACTIVE_ATTRIBUTE, '')
      focusedElement = next
    }

    rootElement.classList.add(FOCUS_MODE_CLASS)
    sync()
    const unregisterUpdateListener = editor.registerUpdateListener(sync)
    document.addEventListener('selectionchange', sync)

    detachRoot = () => {
      document.removeEventListener('selectionchange', sync)
      unregisterUpdateListener()
      focusedElement?.removeAttribute(FOCUS_ACTIVE_ATTRIBUTE)
      rootElement.classList.remove(FOCUS_MODE_CLASS)
      detachRoot = null
    }
  }

  const unregisterRootListener = editor.registerRootListener((rootElement) => {
    detachRoot?.()
    if (rootElement !== null) {
      attach(rootElement)
    }
  })

  return () => {
    unregisterRootListener()
    detachRoot?.()
  }
}
