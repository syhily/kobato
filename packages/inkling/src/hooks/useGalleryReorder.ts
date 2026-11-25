import type { GalleryImage } from '@kobato/inkling-internal/types/gallery'
import type {
  DraggableInfo,
  DroppablePosition,
  DropResolution,
} from '@kobato/inkling-internal/utils/draggable/DragDropContainer'
import type { Dispatch, SetStateAction } from 'react'

import useDropTarget from '@kobato/inkling-internal/hooks/useDropTarget'
import { pick } from '@kobato/inkling-internal/utils'
import {
  isGalleryImageDrag,
  resolveGalleryDrop,
  resolveGallerySourceRemoval,
} from '@kobato/inkling-internal/utils/draggable/gallery-drop'
import {
  createReorderGeometry,
  resolveDrop,
  resolveReorder,
} from '@kobato/inkling-internal/utils/draggable/reorder-rules'
export type { GalleryImage }

interface UseGalleryReorderOptions {
  images: GalleryImage[]
  updateImages: (images: GalleryImage[]) => void
  isSelected?: boolean
  maxImages?: number
  disabled?: boolean
}

export interface UseGalleryReorderResult {
  setContainerRef: Dispatch<SetStateAction<HTMLElement | null>>
  isDraggedOver: boolean
}

export default function useGalleryReorder({
  images,
  updateImages,
  isSelected = false,
  maxImages = 9,
  disabled = false,
}: UseGalleryReorderOptions): UseGalleryReorderResult {
  const onDrop = (draggableInfo: DraggableInfo, dropResolution: DropResolution | null) => {
    if (!isGalleryImageDrag(draggableInfo)) {
      return false
    }

    const insertIndex: number = dropResolution?.insertIndex ?? 0

    const resolution = resolveDrop(
      createReorderGeometry(containerElement, '[data-image]'),
      draggableInfo.element,
      insertIndex,
    )
    if (!resolution) {
      return false
    }

    const img = draggableInfo.element?.querySelector<HTMLImageElement>('img')
    const updatedImages = resolveGalleryDrop(images, draggableInfo, resolution.draggableIndex, insertIndex, {
      naturalSize: img ? { width: img.naturalWidth, height: img.naturalHeight } : null,
    })
    if (!updatedImages) {
      return false
    }

    updateImages(updatedImages)
    container.refresh()

    return { success: true, sourceHandled: true }
  }

  const onDropEnd = (draggableInfo: DraggableInfo, success: boolean, sourceHandled: boolean) => {
    if (sourceHandled || !success) {
      return
    }

    const droppables = createReorderGeometry(containerElement, '[data-image]').getDroppables()
    const draggableIndex = draggableInfo.element ? droppables.indexOf(draggableInfo.element) : -1
    const updatedImages = resolveGallerySourceRemoval(images, draggableIndex)
    if (updatedImages) {
      updateImages(updatedImages)
      container.refresh()
    }
  }

  const getDraggableInfo = (draggableElement: HTMLElement | null): DraggableInfo | false => {
    const src = draggableElement?.querySelector('img')?.getAttribute('src')
    const image = images.find((i) => i.src === src) || images.find((i) => i.previewSrc === src)

    if (image) {
      return {
        type: 'image',
        element: draggableElement,
        target: null,
        mousePosition: { x: 0, y: 0 },
        dataset: pick(image, ['fileName', 'src', 'row', 'width', 'height', 'caption']),
      }
    }

    return false
  }

  const getIndicatorPosition = (
    draggableInfo: DraggableInfo,
    droppableElem: HTMLElement,
    position: DroppablePosition,
  ): DropResolution | false => {
    if (!isGalleryImageDrag(draggableInfo)) {
      return false
    }

    if (!droppableElem.closest('[data-row]')) {
      return false
    }

    const resolution = resolveReorder(
      createReorderGeometry(containerElement, '[data-image]'),
      draggableInfo.element,
      droppableElem,
      position,
      'horizontal',
    )

    return resolution ? { insertIndex: resolution.insertIndex } : false
  }

  const dropTarget = useDropTarget({
    enabled: isSelected,
    isDragEnabled: !disabled && images.length > 0,

    reRegisterKey: images,
    draggableSelector: '[data-image]',
    droppableSelector: '[data-image]',
    getDraggableInfo,
    getIndicatorPosition,
    onDrop,
    onDropEnd,

    canDrop: () => true,

    adjustEnableOnDragStart: (draggableInfo) => {
      return isGalleryImageDrag(draggableInfo) && draggableInfo.dataset.src && images.length !== maxImages
        ? true
        : undefined
    },
  })
  const container = dropTarget.container
  const containerElement = dropTarget.containerElement

  return { setContainerRef: dropTarget.setRef, isDraggedOver: dropTarget.isDraggedOver }
}
