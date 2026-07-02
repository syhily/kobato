import pick from 'lodash/pick'
import React from 'react'

import type { GalleryImage } from '@/ui/inkling-editor/types/gallery'
import type { DraggableInfo, DroppablePosition } from '@/ui/inkling-editor/utils/draggable/DragDropContainer'

import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { getImageFilenameFromSrc } from '@/ui/inkling-editor/utils/getImageFilenameFromSrc'

export type { GalleryImage }

interface UseGalleryReorderOptions {
  images: GalleryImage[]
  updateImages: (images: GalleryImage[]) => void
  isSelected?: boolean
  maxImages?: number
  disabled?: boolean
}

interface UseGalleryReorderResult {
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
  const inkling = React.useContext(InklingComposerContext)

  const [containerRef, setContainerRef] = React.useState<HTMLElement | null>(null)
  const [isDraggedOver, setIsDraggedOver] = React.useState<boolean>(false)
  const dragDropContainer = React.useRef<{
    enableDrag: () => void
    disableDrag: () => void
    refresh: () => void
    destroy: () => void
  } | null>(null)
  const skipOnDragEndRef = React.useRef<boolean>(false)

  const onDragStart = (draggableInfo: DraggableInfo) => {
    // enable dropping when an image is dragged in from outside of this card
    const isImageDrag = draggableInfo.type === 'image' || draggableInfo.cardName === 'image'
    if (isImageDrag && draggableInfo.dataset.src && images.length !== maxImages) {
      dragDropContainer.current?.enableDrag()
    }
  }

  const onDragEnd = () => {
    setIsDraggedOver(false)
  }

  const onDragEnterContainer = () => {
    setIsDraggedOver(true)
  }

  const onDragLeaveContainer = () => {
    setIsDraggedOver(false)
  }

  const onDrop = (draggableInfo: DraggableInfo) => {
    // do not allow dropping of non-images
    if (draggableInfo.type !== 'image' && draggableInfo.cardName !== 'image') {
      return false
    }

    const updatedImages: GalleryImage[] = [...images]
    let insertIndex: number = draggableInfo.insertIndex ?? 0
    const droppables = Array.from(containerRef?.querySelectorAll('[data-image]') ?? []) as HTMLElement[]
    const draggableIndex = draggableInfo.element ? droppables.indexOf(draggableInfo.element) : -1

    if (!updatedImages.length) {
      insertIndex = 0
    }

    if (isDropAllowed(draggableIndex, insertIndex)) {
      if (draggableIndex === -1) {
        // external image being added
        const { dataset } = draggableInfo
        const img = draggableInfo.element?.querySelector(`img[src="${dataset.src}"]`)

        // image card datasets may not have all of the details we need but we can fill them in
        dataset.width = dataset.width || (img as HTMLImageElement)?.naturalWidth
        dataset.height = dataset.height || (img as HTMLImageElement)?.naturalHeight
        dataset.fileName = (dataset?.fileName as string) || getImageFilenameFromSrc(dataset.src as string)

        const newImage: GalleryImage = {
          src: String(dataset.src),
          fileName: dataset.fileName as string | undefined,
          row: dataset.row as number | undefined,
          width: dataset.width as number | undefined,
          height: dataset.height as number | undefined,
          caption: dataset.caption as string | undefined,
        }

        updatedImages.splice(insertIndex, 0, newImage)
      } else {
        // internal image being re-ordered
        const draggedImage = updatedImages.find((i) => i.src === draggableInfo.dataset.src)
        const accountForRemoval = draggableIndex < insertIndex && insertIndex ? -1 : 0
        const filtered = updatedImages.filter((i) => i !== draggedImage)
        filtered.splice(insertIndex + accountForRemoval, 0, draggedImage as GalleryImage)
        updateImages(filtered)
        dragDropContainer.current?.refresh()

        skipOnDragEndRef.current = true
        return true
      }

      updateImages(updatedImages)
      dragDropContainer.current?.refresh()

      skipOnDragEndRef.current = true
      return true
    }

    return false
  }

  // if an image is dragged out of a gallery we need to remove it
  const onDropEnd = (draggableInfo: DraggableInfo, success: boolean) => {
    if (skipOnDragEndRef.current || !success) {
      skipOnDragEndRef.current = false
      return
    }

    const image = images.find((i) => i.src === draggableInfo.dataset.src)
    if (image) {
      const updatedImages = images.filter((i) => i !== image)
      updateImages(updatedImages)
      dragDropContainer.current?.refresh()
    }
  }

  const getDraggableInfo = (draggableElement: HTMLElement | null): DraggableInfo | false => {
    let src = draggableElement?.querySelector('img')?.getAttribute('src')
    let image = images.find((i) => i.src === src) || images.find((i) => i.previewSrc === src)
    const dataset = (
      image ? pick(image, ['fileName', 'src', 'row', 'width', 'height', 'caption']) : {}
    ) as DraggableInfo['dataset']

    if (image) {
      return {
        type: 'image',
        element: draggableElement,
        target: null,
        source: null,
        mousePosition: { x: 0, y: 0 },
        dataset,
      }
    }

    return false
  }

  // returns {
  //   direction: 'horizontal' TODO: use a constant?
  //   position: 'left'/'right' TODO: use constants?
  //   beforeElems: array of elems to left of indicator
  //   afterElems: array of elems to right of indicator
  //   droppableIndex:
  // }
  const getIndicatorPosition = (
    draggableInfo: DraggableInfo,
    droppableElem: HTMLElement | null,
    position: DroppablePosition,
  ): { insertIndex: number; element: HTMLElement } | false => {
    // do not allow dropping of non-images
    if (draggableInfo.type !== 'image' && draggableInfo.cardName !== 'image') {
      return false
    }

    if (!droppableElem) {
      return false
    }

    const row = droppableElem.closest('[data-row]')
    const droppables = Array.from(containerRef?.querySelectorAll('[data-image]') ?? []) as HTMLElement[]
    const draggableIndex = draggableInfo.element ? droppables.indexOf(draggableInfo.element) : -1
    const droppableIndex = droppables.indexOf(droppableElem)

    if (row && isDropAllowed(draggableIndex, droppableIndex, position)) {
      const rowImages = Array.from(row.querySelectorAll('[data-image]')) as HTMLElement[]
      const rowDroppableIndex = rowImages.indexOf(droppableElem)
      let insertIndex = droppableIndex
      const beforeElems: HTMLElement[] = []
      const afterElems: HTMLElement[] = []

      rowImages.forEach((image, index) => {
        if (index < rowDroppableIndex) {
          beforeElems.push(image)
        }

        if (index === rowDroppableIndex) {
          if (position.match(/left/)) {
            afterElems.push(image)
          } else {
            beforeElems.push(image)
          }
        }

        if (index > rowDroppableIndex) {
          afterElems.push(image)
        }
      })

      if (position.match(/right/)) {
        insertIndex += 1
      }

      return {
        insertIndex,
        element: droppableElem,
      }
    } else {
      return false
    }
  }

  // we don't allow an image to be dropped where it would end up in the
  // same position within the gallery
  const isDropAllowed = (draggableIndex: number, droppableIndex: number, position = ''): boolean => {
    // external images can always be dropped
    if (draggableIndex === -1) {
      return true
    }

    // can't drop on itself or when droppableIndex doesn't exist
    if (draggableIndex === droppableIndex || typeof droppableIndex === 'undefined') {
      return false
    }

    // account for dropping at beginning or end of a row
    let adjustedDroppableIndex = droppableIndex
    if (position.match(/left/)) {
      adjustedDroppableIndex -= 1
    }

    if (position.match(/right/)) {
      adjustedDroppableIndex += 1
    }

    return adjustedDroppableIndex !== draggableIndex
  }

  React.useEffect(() => {
    if (isSelected) {
      dragDropContainer.current?.enableDrag()
    } else {
      dragDropContainer.current?.disableDrag()
    }
  }, [isSelected, containerRef])

  React.useEffect(() => {
    const galleryElem = containerRef

    if (!galleryElem || !inkling?.dragDropHandler) {
      return
    }

    const container = inkling.dragDropHandler.registerContainer(galleryElem, {
      draggableSelector: '[data-image]',
      droppableSelector: '[data-image]',
      isDragEnabled: !disabled && images.length > 0,
      onDragStart,
      onDragEnd,
      onDragEnterContainer,
      onDragLeaveContainer,
      onDragEnterDroppable: () => {},
      onDragOverDroppable: () => {},
      onDragLeaveDroppable: () => {},
      getDraggableInfo,
      getIndicatorPosition,
      onDrop,
      onDropEnd,
    })
    dragDropContainer.current = container

    return () => {
      if (dragDropContainer.current) {
        dragDropContainer.current.destroy()
        dragDropContainer.current = null
      }
    }

    // we want to be specific about when we want the drag/drop handler to
    // be set up or refreshed so we disable the exhaustive-deps rule here
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, images, inkling.dragDropHandler])

  return { setContainerRef, isDraggedOver }
}
