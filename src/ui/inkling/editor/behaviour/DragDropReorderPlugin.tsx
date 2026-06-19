import type { LexicalEditor } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNearestNodeFromDOMNode, $getRoot, $isDecoratorNode } from 'lexical'
import { useEffect } from 'react'

/**
 * Enables drag-and-drop reordering of block-level DecoratorNodes (cards).
 * Uses HTML5 drag API. A card must have `draggable="true"` and a
 * `data-inkling-card-key` attribute on its DOM wrapper for this plugin
 * to recognise it. The CardShell in card-components already sets
 * `data-inkling-card-selected`.
 */
export function useInklingDragDropReorder(editor: LexicalEditor): void {
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
      el.className = 'inkling-drop-indicator'
      el.style.cssText = 'height:3px;background:var(--brand);margin:2px 0;border-radius:1.5px;pointer-events:none'
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
      if (!(target instanceof HTMLElement)) { return }
      const card = target.closest('[data-inkling-card-selected]') ?? target.closest('.inkling-card')
      if (!(card instanceof HTMLElement)) { return }
      const editorRoot = editor.getRootElement()
      if (editorRoot === null || !editorRoot.contains(card)) { return }

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
      if (dragKey === null) { return }
      e.preventDefault()
      if (e.dataTransfer !== null) { e.dataTransfer.dropEffect = 'move' }

      // Show indicator at the nearest drop position
      const target = e.target as HTMLElement
      const card = target.closest<HTMLElement>('.inkling-card')
      if (card === null) {
        removeIndicator()
        return
      }
      if (dropIndicator === null) { dropIndicator = createIndicator() }

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
      if (dragKey === null) { return }

      const target = e.target as HTMLElement
      const card = target.closest<HTMLElement>('.inkling-card')
      if (card === null) {
        dragKey = null
        return
      }

      editor.update(() => {
        const dragNode = editor.getEditorState().read(() => $getNearestNodeFromDOMNode(card))
        if (dragNode === null) { return }

        const targetNode = $getNearestNodeFromDOMNode(card)
        if (targetNode === null || dragKey === targetNode.getKey()) { return }

        const root = $getRoot()
        const children = root.getChildren()
        const dragChild = children.find((c) => c.getKey() === dragKey)
        const targetChild = children.find((c) => c.getKey() === targetNode.getKey())
        if (dragChild === undefined || targetChild === undefined) { return }

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

    rootEl.addEventListener('dragstart', onDragStart)
    rootEl.addEventListener('dragover', onDragOver)
    rootEl.addEventListener('drop', onDrop)
    rootEl.addEventListener('dragend', onDragEnd)

    return () => {
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
