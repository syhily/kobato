import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNearestNodeFromDOMNode, type LexicalEditor } from 'lexical'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import type { ImageNodeDataset } from '@/nodes/ImageNode'

import { useCardSelectionState } from '@/context/CardSelectionStoreContext'
import { useDragDropHandle, useDragDropHandleState } from '@/context/DragDropHandleContext'
import { useInklingDragScrollContainerSelector } from '@/context/InklingHostIntegrationContext'
import { $isInklingCard } from '@/nodes/base'
import { getCardDragIcon } from '@/nodes/cards/card-menus'
import {
  $insertDraggedImage,
  $relocateCard,
  $removeDropSource,
  resolveDragMarkerRefresh,
  shouldRemoveDropSource,
} from '@/plugins/behaviour/drop-surgery'
import {
  type DraggableInfo,
  type DroppablePosition,
  type DropResolution,
  type DropResult,
} from '@/utils/draggable/DragDropContainer'
import { DragDropHandler } from '@/utils/draggable/DragDropHandler'
import { createReorderGeometry, resolveDrop, resolveReorder } from '@/utils/draggable/reorder-rules'
import { useDragDropContainer } from '@/utils/draggable/useDragDropContainer'

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
      draggableSelector: ':scope > div', // cards
      getDraggableInfo: (draggableElement: HTMLElement | null): DraggableInfo | false => {
        if (!draggableElement) {
          return false
        }

        let draggableInfo: DraggableInfo | undefined

        editor.update(() => {
          const nearestNode = $getNearestNodeFromDOMNode(draggableElement)

          // draggableSelector matches top-level <div>s; a consumer-registered
          // node rendering one is not a card — treat it as non-draggable
          // instead of crashing on the missing methods
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
              // what the per-card getIcon() copies returned: the first menu
              // entry's icon, or the declaration's dragIcon for menu-less cards
              Icon: getCardDragIcon(cardNode.getType()),
            }
          }
        })

        return draggableInfo || false
      },
      createDragPreviewElement: (draggableInfo: DraggableInfo) => {
        const { cardName } = draggableInfo
        const { Icon } = draggableInfo

        // cardName always resolves here (the producer above sets it from the
        // card's getType()); image cards fall through to the container's own
        // image preview
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

        // the typed disposal contract: the handler unmounts the React root
        // through dispose() without knowing the preview is React-backed
        return {
          element: dragPreviewElement,
          dispose: () => {
            reactRoot.unmount()
          },
        }
      },
    },
    droppable: {
      droppableSelector: ':scope > *', // all block elements
      getIndicatorPosition: (
        draggableInfo: DraggableInfo,
        droppableElem: HTMLElement,
        position: DroppablePosition,
      ): DropResolution | false => {
        // only allow card and image drops (images can be dragged out of a gallery)
        if (draggableInfo.type !== 'card' && draggableInfo.type !== 'image') {
          return false
        }

        const rootElement = editor.getRootElement()
        if (!rootElement || !draggableInfo.element) {
          return false
        }

        // the single insertIndex derivation of this drag — the handler hands
        // it back to onDrop below as the resolution argument
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
        if (draggableInfo.type !== 'card' && draggableInfo.type !== 'image') {
          return false
        }

        const rootElement = editor.getRootElement()
        // no resolution, no drop: the card container only accepts drops the
        // indicator resolved a slot for
        if (!rootElement || !draggableInfo.element || !dropResolution) {
          return false
        }

        // insertIndex was derived by getIndicatorPosition (resolveReorder) and
        // arrives as the resolution argument — re-verify it against a fresh
        // scan, never re-derive it
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
          // change card order on card drops
          if (draggableInfo.type === 'card') {
            if ($relocateCard(draggableInfo.nodeKey, droppables, insertIndex)) {
              // the card was re-ordered in place, not moved inside another
              // card — onDropEnd must not remove the source
              result = { success: true, sourceHandled: true }
            }
            return
          }

          // insert new image node on image drops — only an actual insert
          // counts as handled; a failed insert reports failure so the source
          // node stays put
          if (draggableInfo.type === 'image') {
            // untyped drag boundary: DraggableInfo.dataset is Record<string,
            // unknown>; an 'image'-type drag carries a gallery-picked image
            // dataset (useGalleryReorder), narrowed here to the closed type
            result = $insertDraggedImage(draggableInfo.dataset as ImageNodeDataset, droppables, insertIndex) !== null
          }
        })

        return result
      },
    },
    lifecycle: {
      onDragStart: () => {
        cardContainer.refresh()
      },
      // a card can be dropped into another card which means we need to remove the original
      onDropEnd: (draggableInfo: DraggableInfo, success: boolean, sourceHandled: boolean): void => {
        // avoid removing the card if it's just a re-order or no move occurred
        if (!shouldRemoveDropSource(draggableInfo.type, success, sourceHandled)) {
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
      // the host's drag auto-scroll container (composer option); absent, the
      // document scrolling element is used as found
      scrollHandlerOptions: { documentScrollContainerSelector: dragScrollContainerSelector },
      // the handler publishes its own isDragging truth straight onto the
      // handle — no lifecycle-callback mirroring in this adapter
      onDraggingChange: (isDragging) => {
        dragDropHandle.setState({ isDragging })
      },
    })
    // publish the handler so the card drag hooks register against it — they
    // subscribe to the handle, so a hook whose registration effect ran before
    // this one registers as soon as the handler appears (no mount-order
    // dependency)
    dragDropHandle.setState({ handler: dndHandler })

    return () => {
      dragDropHandle.setState({ handler: null })
      dndHandler.destroy()
    }
  }, [editor, containerElement, dragDropHandle, dragScrollContainerSelector])

  // the refresh policy (which dirty sets mean a top-level block changed)
  // lives in the drop-surgery module as a synchronous test table
  React.useEffect(() => {
    return editor.registerUpdateListener(({ dirtyElements, editorState }) => {
      if (resolveDragMarkerRefresh(dirtyElements, editorState)) {
        cardContainer.refresh()
      }
    })
  }, [editor, cardContainer])

  // disable normal drag start events so they don't interfere with our custom drag handling
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
