import { useCardSelectionState } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { useDragDropHandle, useDragDropHandleState } from '@kobato/inkling-internal/context/DragDropHandleContext'
import { useInklingDragScrollContainerSelector } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { $isInklingCard } from '@kobato/inkling-internal/nodes/base'
import { getCardDragIcon } from '@kobato/inkling-internal/nodes/cards/card-menus'
import {
  $insertDraggedImage,
  $relocateCard,
  $removeDropSource,
  resolveDragMarkerRefresh,
  shouldRemoveDropSource,
} from '@kobato/inkling-internal/plugins/behaviour/drop-surgery'
import {
  type DraggableInfo,
  type DroppablePosition,
  type DropResolution,
  type DropResult,
} from '@kobato/inkling-internal/utils/draggable/DragDropContainer'
import { DragDropHandler } from '@kobato/inkling-internal/utils/draggable/DragDropHandler'
import {
  createReorderGeometry,
  resolveDrop,
  resolveReorder,
} from '@kobato/inkling-internal/utils/draggable/reorder-rules'
import { useDragDropContainer } from '@kobato/inkling-internal/utils/draggable/use-drag-drop-container'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNearestNodeFromDOMNode, type LexicalEditor } from 'lexical'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

function preventDefault(event: Event): void {
  event.preventDefault()
}

function useDragDropReorder(editor: LexicalEditor): void {
  const dragDropHandle = useDragDropHandle()
  const containerElement = useDragDropHandleState((state) => state.containerElement)
  const isEditingCard = useCardSelectionState((state) => state.isEditingCard)

  const cardContainer = useDragDropContainer({
    element: editor.getRootElement(),
    enabled: !isEditingCard,
    draggable: {
      draggableSelector: ':scope > div',
      getDraggableInfo: (draggableElement: HTMLElement | null): DraggableInfo | false => {
        if (!draggableElement) {
          return false
        }

        let draggableInfo: DraggableInfo | undefined

        editor.update(() => {
          const nearestNode = $getNearestNodeFromDOMNode(draggableElement)

          if (nearestNode && $isInklingCard(nearestNode)) {
            const cardNode = nearestNode
            draggableInfo = {
              type: 'card',
              nodeKey: cardNode.getKey(),
              cardName: cardNode.getType(),
              element: draggableElement,
              target: null,
              mousePosition: { x: 0, y: 0 },
              dataset: cardNode.getDataset(),
              Icon: getCardDragIcon(cardNode.getType()),
            }
          }
        })

        return draggableInfo || false
      },
      createDragPreviewElement: (draggableInfo: DraggableInfo) => {
        if (draggableInfo.type !== 'card') {
          return
        }

        const { cardName, Icon } = draggableInfo

        if (cardName === 'image') {
          return
        }

        const style = {
          top: '0',
          left: '-100%',
          zIndex: 10001,
          willChange: 'transform',
        }

        const dragPreviewElement = document.createElement('div')
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

        return {
          element: dragPreviewElement,
          dispose: () => {
            reactRoot.unmount()
          },
        }
      },
    },
    droppable: {
      droppableSelector: ':scope > *',
      getIndicatorPosition: (
        draggableInfo: DraggableInfo,
        droppableElem: HTMLElement,
        position: DroppablePosition,
      ): DropResolution | false => {
        const rootElement = editor.getRootElement()
        if (!rootElement || !draggableInfo.element) {
          return false
        }

        const resolution = resolveReorder(
          createReorderGeometry(rootElement, ':scope > *'),
          draggableInfo.element,
          droppableElem,
          position,
          'vertical',
        )

        return resolution ? { insertIndex: resolution.insertIndex } : false
      },
      onDrop: (draggableInfo: DraggableInfo, dropResolution: DropResolution | null): DropResult => {
        const rootElement = editor.getRootElement()

        if (!rootElement || !draggableInfo.element || !dropResolution) {
          return false
        }
        const insertIndex = dropResolution.insertIndex
        const resolution = resolveDrop(
          createReorderGeometry(rootElement, ':scope > *'),
          draggableInfo.element,
          insertIndex,
        )
        if (!resolution) {
          return false
        }
        const { droppables } = resolution

        let result: DropResult = false

        editor.update(() => {
          if (draggableInfo.type === 'card') {
            if ($relocateCard(draggableInfo.nodeKey, droppables, insertIndex)) {
              result = { success: true, sourceHandled: true }
            }
            return
          }

          result = $insertDraggedImage(draggableInfo.dataset, droppables, insertIndex) !== null
        })

        return result
      },
    },
    lifecycle: {
      onDragStart: () => {
        cardContainer.refresh()
      },
      onDropEnd: (draggableInfo: DraggableInfo, success: boolean, sourceHandled: boolean): void => {
        if (draggableInfo.type !== 'card' || !shouldRemoveDropSource(success, sourceHandled)) {
          return
        }
        editor.update(() => {
          $removeDropSource(draggableInfo.nodeKey)
        })
      },
    },
  })

  const dragScrollContainerSelector = useInklingDragScrollContainerSelector()

  React.useEffect(() => {
    if (!containerElement || !editor.getRootElement()) {
      return
    }
    const dndHandler = new DragDropHandler({
      editorContainerElement: containerElement,

      scrollHandlerOptions: { documentScrollContainerSelector: dragScrollContainerSelector },

      onDraggingChange: (isDragging) => {
        dragDropHandle.setState({ isDragging })
      },
    })
    dragDropHandle.setState({ handler: dndHandler })
    return () => {
      dragDropHandle.setState({ handler: null })
      dndHandler.destroy()
    }
  }, [editor, containerElement, dragDropHandle, dragScrollContainerSelector])
  React.useEffect(() => {
    return editor.registerUpdateListener(({ dirtyElements, editorState }) => {
      if (resolveDragMarkerRefresh(dirtyElements, editorState)) {
        cardContainer.refresh()
      }
    })
  }, [editor, cardContainer])

  React.useEffect(() => {
    return editor.registerRootListener((rootElement, prevRootElement) => {
      rootElement?.addEventListener('dragstart', preventDefault)
      prevRootElement?.removeEventListener('dragstart', preventDefault)
    })
  }, [editor])
}

export default function DragDropReorderPlugin(): null {
  const [editor] = useLexicalComposerContext()
  useDragDropReorder(editor)
  return null
}
