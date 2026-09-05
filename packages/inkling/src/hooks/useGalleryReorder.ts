import React from 'react'

import type { GalleryImage } from '@/types/gallery'
import type { DraggableInfo, DroppablePosition, DropResolution } from '@/utils/draggable/DragDropContainer'

import useDropTarget from '@/hooks/useDropTarget'
import { pick } from '@/utils'
import { isGalleryImageDrag, resolveGalleryDrop, resolveGallerySourceRemoval } from '@/utils/draggable/gallery-drop'
import { createReorderGeometry, resolveDrop, resolveReorder } from '@/utils/draggable/reorder-rules'

export type { GalleryImage }

interface UseGalleryReorderOptions {
  images: GalleryImage[]
  updateImages: (images: GalleryImage[]) => void
  isSelected?: boolean
  maxImages?: number
  disabled?: boolean
}

export interface UseGalleryReorderResult {
  setContainerRef: React.Dispatch<React.SetStateAction<HTMLElement | null>>
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
    // do not allow dropping of non-images
    if (!isGalleryImageDrag(draggableInfo)) {
      return false
    }

    // insertIndex was derived by getIndicatorPosition (resolveReorder) and
    // arrives as the resolution argument; an empty gallery has no droppables
    // to derive one from (the drop is container-level, resolution null) —
    // the gallery-drop module lands the first image at slot 0
    const insertIndex: number = dropResolution?.insertIndex ?? 0

    const resolution = resolveDrop(
      createReorderGeometry(containerElement, '[data-image]'),
      draggableInfo.element,
      insertIndex,
    )
    if (!resolution) {
      return false
    }

    // the application half (external add / internal reorder) is the pure
    // gallery-drop module; the natural-size read is its probe port
    const img = draggableInfo.element?.querySelector<HTMLImageElement>('img')
    const updatedImages = resolveGalleryDrop(images, draggableInfo, resolution.draggableIndex, insertIndex, {
      naturalSize: img ? { width: img.naturalWidth, height: img.naturalHeight } : null,
    })
    if (!updatedImages) {
      return false
    }

    updateImages(updatedImages)
    container.refresh()

    // this gallery consumed the drop itself — onDropEnd must not remove it
    return { success: true, sourceHandled: true }
  }

  // if an image is dragged out of a gallery we need to remove it
  const onDropEnd = (draggableInfo: DraggableInfo, success: boolean, sourceHandled: boolean) => {
    if (sourceHandled || !success) {
      return
    }

    // positional lookup, same ordinal as the drop path: the dragged element's
    // slot among the gallery's droppables (a src-value find would grab the
    // wrong instance on duplicate or still-undefined preview srcs)
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
    // do not allow dropping of non-images
    if (draggableInfo.type !== 'image' && draggableInfo.cardName !== 'image') {
      return false
    }

    if (!droppableElem.closest('[data-row]')) {
      return false
    }

    // the single insertIndex derivation of this drag — the handler hands it
    // back to onDrop above as the resolution argument
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
    // re-register when the image set changes so the container re-scans the
    // gallery's draggable/droppable markers (callbacks are ref-forwarded and
    // would see fresh images either way)
    reRegisterKey: images,
    draggableSelector: '[data-image]',
    droppableSelector: '[data-image]',
    getDraggableInfo,
    getIndicatorPosition,
    onDrop,
    onDropEnd,
    // hover policy: any drag entering the gallery lights it up
    canDrop: () => true,
    // enablement policy: enable dropping when an image is dragged in from
    // outside of this card — other drags leave enablement untouched
    adjustEnableOnDragStart: (draggableInfo) => {
      const isImageDrag = draggableInfo.type === 'image' || draggableInfo.cardName === 'image'
      return isImageDrag && draggableInfo.dataset.src && images.length !== maxImages ? true : undefined
    },
  })
  const container = dropTarget.container
  const containerElement = dropTarget.containerElement

  return { setContainerRef: dropTarget.setRef, isDraggedOver: dropTarget.isDraggedOver }
}
