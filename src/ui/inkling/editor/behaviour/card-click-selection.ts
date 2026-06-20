import type { LexicalEditor, LexicalNode } from 'lexical'

import { $getNodeByKey, $getNearestNodeFromDOMNode, $getSelection, $isNodeSelection } from 'lexical'

import { $isBlockCardNode, $selectNode } from '@/ui/inkling/editor/behaviour/card-helpers'
import { readEditor } from '@/ui/inkling/editor/shared/read-editor'

/**
 * Register a `mousedown` listener on the editor root that selects a
 * block-level card when the user clicks on it. If the card is already
 * selected, the click passes through to internal controls (INPUT/TEXTAREA).
 * If the target is an input-like element, `preventDefault` is NOT called so
 * the input gets focus. Mirrors Koenig's `KoenigCardWrapper.handleMousedown`.
 *
 * `event.preventDefault()` on non-input targets is the key defence: it keeps
 * the browser from changing the DOM selection, which in turn prevents
 * Lexical's `selectionchange` listener from overwriting the NodeSelection
 * we just set.
 *
 * Returns a cleanup function that removes the listener.
 */
export function registerCardClickSelection(editor: LexicalEditor): () => void {
  const rootElement = editor.getRootElement()

  const handleCardMousedown = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Node) || rootElement === null || !rootElement.contains(target)) {
      return
    }
    // Find the nearest Lexical node for the mousedown target, then walk up
    // to see if any ancestor is a block-level card.
    let targetCardKey: string | null = null
    editor.read(() => {
      const lexicalNode = $getNearestNodeFromDOMNode(target)
      if (lexicalNode === null) {
        return
      }
      let current: LexicalNode | null = lexicalNode
      while (current !== null) {
        if ($isBlockCardNode(current)) {
          targetCardKey = current.getKey()
          return
        }
        current = current.getParent()
      }
    })
    if (targetCardKey === null) {
      // Not a card — let Lexical default behaviour handle it.
      return
    }

    // Check whether this card is already selected.
    const alreadySelected = readEditor(editor, () => {
      const selection = $getSelection()
      if (!$isNodeSelection(selection)) {
        return false
      }
      return selection.getNodes().some((n) => n.getKey() === targetCardKey)
    })
    if (alreadySelected) {
      // Card is already selected — allow the click to pass through so
      // internal controls (inputs, buttons) work normally.
      return
    }

    // Select the card via a NodeSelection. Use `history-merge` so the
    // selection itself doesn't push an undo entry.
    const cardKey = targetCardKey
    editor.update(
      () => {
        const node = $getNodeByKey(cardKey)
        if (node !== null) {
          $selectNode(node)
        }
      },
      { tag: 'history-merge' },
    )

    // Focus-passthrough: if the user clicked on an interactive form control
    // (input, textarea, button, select) or inside a
    // `[data-inkling-allow-clickthrough]` element, don't preventDefault —
    // let the browser handle focus and the subsequent click event naturally.
    // Without this, clicking a <button> inside an unselected card would
    // require two clicks: one to select the card (mousedown prevented the
    // click), another to actually trigger the button.
    if (!(target instanceof HTMLElement)) {
      return
    }
    const isInteractive =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'SELECT'
    // `data-inkling-allow-clickthrough` is an extension point for non-standard
    // interactive regions (currently unused — no card sets this attribute).
    const allowClickthrough = target.closest('[data-inkling-allow-clickthrough]') !== null
    if (!isInteractive && !allowClickthrough) {
      event.preventDefault()
    }
  }

  rootElement?.addEventListener('mousedown', handleCardMousedown, false)
  return () => {
    rootElement?.removeEventListener('mousedown', handleCardMousedown, false)
  }
}
