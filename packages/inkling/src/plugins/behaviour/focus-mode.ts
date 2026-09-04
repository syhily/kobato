// Writing-focus mode — the mechanism half of the focus feature (tiptap
// extension-focus parity, delivered as a real UX: tiptap's `tiptap-focus-node`
// class had no CSS consumer and was dead config). While registered, the
// editor root carries FOCUS_MODE_CLASS and the top-level block element holding
// the native selection carries FOCUS_ACTIVE_ATTRIBUTE; host CSS dims every
// other top-level block. This module owns only the DOM bookkeeping — the
// visual rules live in the host stylesheet.
//
// The walk is DOM-based (not editor-state-based) on purpose: card nested
// editors (captions, footnote content, cell text) are separate LexicalEditor
// instances whose selections never touch this editor's state, but their
// contenteditable DOM sits INSIDE the card's top-level element — walking the
// native selection up to a direct child of the root makes "editing inside a
// card focuses the card" fall out for free. The document-level
// selectionchange listener is what sees those nested-editor selections; this
// editor's own updates (which apply the native selection synchronously at
// commit time) are covered by the update listener.

import type { LexicalEditor } from 'lexical'

/** Mode class the plugin toggles on the editor root element. */
export const FOCUS_MODE_CLASS = 'inkling-focus-mode'
/** Data attribute marking the top-level block element that holds the selection. */
export const FOCUS_ACTIVE_ATTRIBUTE = 'data-inkling-focus-active'

// The top-level block element the native selection is anchored in: the
// anchor's ancestor that is a direct child of the root. A root-anchored
// selection (Lexical's node-selection shape, e.g. a selected card) resolves
// to the child at the anchor offset. Null when the selection sits outside
// this root — unfocused renders every block normally.
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

// Attach focus mode to the editor: FOCUS_MODE_CLASS on the root element and
// FOCUS_ACTIVE_ATTRIBUTE tracking the selected top-level block, until the
// returned cleanup runs (which removes both). Safe to call before the root
// element exists — attachment follows the root listener.
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
