import type { LexicalEditor } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getNearestNodeFromDOMNode,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isNodeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
} from 'lexical'
import { useEffect } from 'react'

/**
 * Enables drag-and-drop and keyboard reordering of block-level
 * DecoratorNodes (cards).  Keyboard: Alt+ArrowUp / Alt+ArrowDown moves
 * the currently selected card one position.  Mouse: HTML5 drag API with
 * drop indicator.
 *
 * A card must have `draggable="true"` and a `data-inkling-card-key`
 * attribute on its DOM wrapper.  The CardShell in card-shell.tsx
 * sets `data-inkling-card-selected`.
 */
export function useInklingDragDropReorder(editor: LexicalEditor | null): void {
  useEffect(() => {
    if (editor === null) {
      return undefined
    }
    const rootEl = editor.getRootElement()
    if (rootEl === null) {
      return undefined
    }
    let dragKey: string | null = null
    let dropIndicator: HTMLDivElement | null = null

    const createIndicator = (): HTMLDivElement => {
      const el = document.createElement('div')
      el.className = 'inkling-drop-indicator bg-brand'
      el.style.cssText = 'height:3px;margin:2px 0;border-radius:1.5px;pointer-events:none'
      el.setAttribute('data-inkling-drop-indicator', 'true')
      return el
    }

    const removeIndicator = () => {
      if (dropIndicator !== null) {
        dropIndicator.remove()
        dropIndicator = null
      }
    }

    const onDragStart = (e: DragEvent) => {
      const target = e.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      const card = target.closest('[data-kg-card-selected]') ?? target.closest('[data-kg-card]')
      if (!(card instanceof HTMLElement)) {
        return
      }
      const editorRoot = editor.getRootElement()
      if (editorRoot === null || !editorRoot.contains(card)) {
        return
      }

      // Find the card's node key from the Lexical DOM
      editor.getEditorState().read(() => {
        const node = $getNearestNodeFromDOMNode(card)
        if (node !== null && $isDecoratorNode(node) && !node.isInline()) {
          dragKey = node.getKey()
          if (e.dataTransfer !== null) {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', dragKey)
          }
        }
      })
    }

    const onDragOver = (e: DragEvent) => {
      if (dragKey === null) {
        return
      }
      e.preventDefault()
      if (e.dataTransfer !== null) {
        e.dataTransfer.dropEffect = 'move'
      }

      // Show indicator at the nearest drop position
      const target = e.target
      const card = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-kg-card]') : null
      if (card === null) {
        removeIndicator()
        return
      }
      if (dropIndicator === null) {
        dropIndicator = createIndicator()
      }

      const rect = card.getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      if (e.clientY < midY) {
        card.parentNode?.insertBefore(dropIndicator, card)
      } else {
        card.parentNode?.insertBefore(dropIndicator, card.nextSibling)
      }
    }

    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      removeIndicator()
      if (dragKey === null) {
        return
      }

      const target = e.target
      const card = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-kg-card]') : null
      if (card === null) {
        dragKey = null
        return
      }

      editor.update(() => {
        const targetNode = $getNearestNodeFromDOMNode(card)
        if (targetNode === null || dragKey === targetNode.getKey()) {
          return
        }

        const root = $getRoot()
        const children = root.getChildren()
        const dragChild = children.find((c) => c.getKey() === dragKey)
        const targetChild = children.find((c) => c.getKey() === targetNode.getKey())
        if (dragChild === undefined || targetChild === undefined) {
          return
        }

        const dragIdx = children.indexOf(dragChild)
        const targetIdx = children.indexOf(targetChild)

        // Move dragChild before or after targetChild
        if (dragIdx < targetIdx) {
          targetChild.insertAfter(dragChild)
        } else {
          targetChild.insertBefore(dragChild)
        }
      })

      dragKey = null
    }

    const onDragEnd = () => {
      removeIndicator()
      dragKey = null
    }

    // Keyboard reorder: Alt+ArrowUp / Alt+ArrowDown moves the currently
    // selected card one position within the root children.
    const unregisterArrowUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event: KeyboardEvent) => {
        if (!event.altKey) {
          return false
        }
        const selection = $getSelection()
        if (!$isNodeSelection(selection)) {
          return false
        }
        const selectedNodes = selection.getNodes()
        if (selectedNodes.length !== 1) {
          return false
        }
        const node = selectedNodes[0]
        if (!node || !$isDecoratorNode(node) || node.isInline()) {
          return false
        }
        const prev = node.getPreviousSibling()
        if (prev === null) {
          return true
        }
        prev.insertBefore(node)
        event.preventDefault()
        return true
      },
      COMMAND_PRIORITY_LOW,
    )

    const unregisterArrowDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        if (!event.altKey) {
          return false
        }
        const selection = $getSelection()
        if (!$isNodeSelection(selection)) {
          return false
        }
        const selectedNodes = selection.getNodes()
        if (selectedNodes.length !== 1) {
          return false
        }
        const node = selectedNodes[0]
        if (!node || !$isDecoratorNode(node) || node.isInline()) {
          return false
        }
        const next = node.getNextSibling()
        if (next === null) {
          return true
        }
        next.insertAfter(node)
        event.preventDefault()
        return true
      },
      COMMAND_PRIORITY_LOW,
    )

    rootEl.addEventListener('dragstart', onDragStart)
    rootEl.addEventListener('dragover', onDragOver)
    rootEl.addEventListener('drop', onDrop)
    rootEl.addEventListener('dragend', onDragEnd)

    return () => {
      unregisterArrowUp()
      unregisterArrowDown()
      rootEl.removeEventListener('dragstart', onDragStart)
      rootEl.removeEventListener('dragover', onDragOver)
      rootEl.removeEventListener('drop', onDrop)
      rootEl.removeEventListener('dragend', onDragEnd)
      removeIndicator()
    }
  }, [editor])
}

/** React component to mount the drag-drop reorder hook. */
export function InklingDragDropReorder() {
  const [editor] = useLexicalComposerContext()
  useInklingDragDropReorder(editor)
  return null
}
