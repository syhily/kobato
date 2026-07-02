import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createNodeSelection,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $setSelection,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'

import type { CardNode } from '@/ui/inkling-editor/types/lexical-internals'

import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { useInklingSelectedCardContext } from '@/ui/inkling-editor/context/InklingSelectedCardContext'
import { $createImageNode } from '@/ui/inkling-editor/nodes/ImageNode'
import { type DraggableInfo, type DroppablePosition } from '@/ui/inkling-editor/utils/draggable/DragDropContainer'
import { DragDropHandler } from '@/ui/inkling-editor/utils/draggable/DragDropHandler'
import { isCardDropAllowed } from '@/ui/inkling-editor/utils/draggable/draggable-utils'

function preventDefault(event: Event): void {
  event.preventDefault()
}

interface DragPreviewElement extends HTMLDivElement {
  __reactRoot?: Root
}

function useDragDropReorder(editor: LexicalEditor, isEditable: boolean): void {
  const inkling = React.useContext(InklingComposerContext)
  const { setIsDragging, isEditingCard } = useInklingSelectedCardContext()

  const cardContainer = React.useRef<{
    refresh: () => void
    enableDrag: () => void
    disableDrag: () => void
    destroy?: () => void
  } | null>(null)
  const skipOnDropEnd = React.useRef<boolean>(false)

  // useRef because we need stable function references to pass into the drag drop container instance
  const onDragStart = React.useRef(() => {
    cardContainer.current?.refresh()
    setIsDragging(true)
  })

  const onDragEnd = React.useRef(() => {
    setIsDragging(false)
  })

  const getDraggableInfo = React.useRef((draggableElement: HTMLElement | null): DraggableInfo | false => {
    let draggableInfo: DraggableInfo | undefined

    editor.update(() => {
      const cardNode = $getNearestNodeFromDOMNode(draggableElement as Node)

      if (cardNode) {
        draggableInfo = {
          type: 'card',
          nodeKey: cardNode.getKey(),
          cardName: cardNode.getType(),
          element: draggableElement,
          target: null,
          source: null,
          mousePosition: { x: 0, y: 0 },
          dataset: (((cardNode as CardNode).getDataset() as Record<string, string | number | undefined>) ??
            {}) as Record<string, string | number | undefined>,
          Icon: (
            (cardNode as CardNode).getIcon as (() => React.ComponentType<React.SVGProps<SVGSVGElement>>) | undefined
          )?.(),
        }
      }
    })

    return draggableInfo || false
  })

  const createCardDragElement = React.useRef((draggableInfo: DraggableInfo): HTMLElement | undefined => {
    const { cardName } = draggableInfo
    const Icon = draggableInfo.Icon as React.ComponentType<React.SVGProps<SVGSVGElement>> | undefined

    if (!cardName || cardName === 'image') {
      return
    }

    const style = {
      top: '0',
      left: '-100%',
      zIndex: 10001,
      willChange: 'transform',
    }

    const dragPreviewElement: DragPreviewElement = document.createElement('div') as DragPreviewElement
    // classes kept so Tailwind picks up usage
    dragPreviewElement.className =
      'absolute flex size-16 flex-col items-center justify-center rounded bg-white shadow-sm'
    Object.assign(dragPreviewElement.style, style)

    const iconWrapper = document.createElement('div')
    iconWrapper.className = 'flex items-center'
    dragPreviewElement.appendChild(iconWrapper)

    // Icon is a React component — render synchronously via flushSync
    const iconRoot = document.createElement('div')
    iconWrapper.appendChild(iconRoot)
    const reactRoot = createRoot(iconRoot)
    if (Icon) {
      flushSync(() => {
        reactRoot.render(<Icon className="size-8" />)
      })
    }

    // Store the React root so DragDropHandler can unmount it on cleanup
    dragPreviewElement.__reactRoot = reactRoot

    return dragPreviewElement
  })

  const getDropIndicatorPosition = React.useRef(
    (
      draggableInfo: DraggableInfo,
      droppableElem: HTMLElement | null,
      position: DroppablePosition,
    ): { insertIndex: number; element: HTMLElement } | false => {
      const rootElement = editor.getRootElement()
      if (!rootElement) {
        return false
      }
      const droppables = Array.from(rootElement.querySelectorAll<HTMLElement>(':scope > *'))
      const droppableIndex = droppables.indexOf(droppableElem as HTMLElement)
      const draggableIndex = droppables.indexOf(draggableInfo.element as HTMLElement)

      // only allow card and image drops (images can be dragged out of a gallery)
      if (draggableInfo.type !== 'card' && draggableInfo.type !== 'image') {
        return false
      }

      if (isCardDropAllowed(draggableIndex, droppableIndex, position)) {
        let insertIndex = droppableIndex
        if (position.match(/bottom/)) {
          insertIndex += 1
        }

        if (position.match(/bottom/)) {
          droppables.slice(0, droppableIndex + 1)
          droppables.slice(droppableIndex + 1)
        } else {
          droppables.slice(0, droppableIndex)
          droppables.slice(droppableIndex)
        }

        return {
          insertIndex,
          element: (droppables[insertIndex] ?? droppableElem) as HTMLElement,
        }
      }

      return false
    },
  )

  const onCardDrop = React.useRef(
    (draggableInfo: DraggableInfo, droppable: HTMLElement | null, position: DroppablePosition | null): boolean => {
      if (draggableInfo.type !== 'card' && draggableInfo.type !== 'image') {
        return false
      }

      const rootElement = editor.getRootElement()
      if (!rootElement) {
        return false
      }
      const droppables = Array.from(rootElement.querySelectorAll<HTMLElement>(':scope > *'))
      const draggableIndex = droppables.indexOf(draggableInfo.element as HTMLElement)
      const insertIndex = draggableInfo.insertIndex ?? 0

      if (isCardDropAllowed(draggableIndex, insertIndex)) {
        let returnValue = false

        editor.update(() => {
          // change card order on card drops
          if (draggableInfo.type === 'card') {
            const draggedNode = $getNodeByKey(draggableInfo.nodeKey as NodeKey)
            if (!draggedNode) {
              return
            }

            if (insertIndex >= droppables.length) {
              // drop at end of document
              const targetNode = $getNearestNodeFromDOMNode(droppables[droppables.length - 1])
              if (targetNode) {
                targetNode.insertAfter(draggedNode)
              }
            } else {
              const targetNode = $getNearestNodeFromDOMNode(droppables[insertIndex])
              if (targetNode) {
                targetNode.insertBefore(draggedNode)
              }
            }

            // clear selection so we don't show any toolbars immediately and the
            // cursor isn't left stranded somewhere else in the document
            $setSelection(null)

            // skip card removal as we're not moving a card inside another card
            skipOnDropEnd.current = true

            returnValue = true
            return
          }

          // insert new image node on image drops
          if (draggableInfo.type === 'image') {
            const targetNode = $getNearestNodeFromDOMNode(droppables[insertIndex])
            if (targetNode) {
              const imageNode = $createImageNode(draggableInfo.dataset as Parameters<typeof $createImageNode>[0])
              targetNode.insertBefore(imageNode)

              // select the newly inserted image card
              const nodeSelection = $createNodeSelection()
              nodeSelection.add(imageNode.getKey())
              $setSelection(nodeSelection)
            }

            returnValue = true
          }
        })

        return returnValue
      }
      return false
    },
  )

  // a card can be dropped into another card which means we need to remove the original
  const onDropEnd = React.useRef((draggableInfo: DraggableInfo, success: boolean): void => {
    // avoid removing the card if it's just a re-order or no move occurred
    if (skipOnDropEnd.current || !success || draggableInfo.type !== 'card') {
      skipOnDropEnd.current = false
      return
    }

    editor.update(() => {
      const cardNode = $getNodeByKey(draggableInfo.nodeKey as NodeKey)
      if (cardNode) {
        cardNode.remove(false)
      }
    })
  })

  React.useEffect(() => {
    const container = inkling.editorContainerRef?.current
    if (!container) {
      return
    }
    const dndHandler = new DragDropHandler({
      editorContainerElement: container,
    })
    inkling.dragDropHandler = dndHandler

    cardContainer.current = inkling.dragDropHandler.registerContainer(editor.getRootElement() as HTMLElement, {
      draggableSelector: ':scope > div', // cards
      droppableSelector: ':scope > *', // all block elements
      onDragStart: onDragStart.current,
      onDragEnterContainer: () => {},
      onDragEnterDroppable: () => {},
      onDragOverDroppable: () => {},
      onDragLeaveDroppable: () => {},
      onDragLeaveContainer: () => {},
      onDragEnd: onDragEnd.current,
      getDraggableInfo: getDraggableInfo.current,
      createDragPreviewElement: createCardDragElement.current,
      getIndicatorPosition: getDropIndicatorPosition.current,
      onDrop: onCardDrop.current,
      onDropEnd: onDropEnd.current,
    })

    return () => {
      cardContainer.current = null
      inkling.dragDropHandler?.destroy()
      delete inkling.dragDropHandler
    }
  }, [editor, inkling])

  React.useEffect(() => {
    return editor.registerUpdateListener(() => {
      // refresh drag/drop
      // TODO: can be made more performant by only refreshing when droppable
      // order changes or when sections are added/removed
      cardContainer.current?.refresh()
    })
  }, [editor])

  // disable normal drag start events so they don't interfere with our custom drag handling
  React.useEffect(() => {
    return editor.registerRootListener((rootElement, prevRootElement) => {
      rootElement?.addEventListener('dragstart', preventDefault)
      prevRootElement?.removeEventListener('dragstart', preventDefault)
    })
  }, [editor])

  // Disable drag-drop-reorder when editing a card
  React.useEffect(() => {
    if (isEditingCard) {
      cardContainer.current?.disableDrag()
    } else {
      cardContainer.current?.enableDrag()
    }
  }, [isEditingCard])

  // isEditable parameter unused but kept for API consistency
  void isEditable
}

export default function DragDropReorderPlugin(): null {
  const [editor] = useLexicalComposerContext()
  useDragDropReorder(editor, editor._editable)
  return null
}
