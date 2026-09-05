import { type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React from 'react'

import type { GalleryNode } from '@/nodes/GalleryNode'
import type { GalleryImage } from '@/types/gallery'

import { CardActionToolbar } from '@/components/ui/CardActionToolbar'
import { GalleryCard } from '@/components/ui/cards/GalleryCard'
import { useCardIsSelected } from '@/context/CardSelectionStoreContext'
import { useInklingHostEssentials } from '@/context/InklingHostIntegrationContext'
import { useGalleryImages } from '@/hooks/useGalleryImages'
import useGalleryReorder from '@/hooks/useGalleryReorder'
import { useMediaCardUpload } from '@/hooks/useMediaCardUpload'
import { $isGalleryNode, recalculateImageRows } from '@/nodes/GalleryNode'
import { galleryUploadIntent } from '@/nodes/upload-intent'
import { createPreviewLeasePool } from '@/utils/preview-lease'

export interface GalleryNodeComponentProps {
  nodeKey: NodeKey
  captionEditor: LexicalEditor | null
  captionEditorInitialState: EditorState | undefined
  triggerFileDialog?: boolean
}

export function GalleryNodeComponent({
  nodeKey,
  captionEditor,
  captionEditorInitialState,
  triggerFileDialog,
}: GalleryNodeComponentProps) {
  const { fileUploader } = useInklingHostEssentials()
  const isSelected = useCardIsSelected(nodeKey)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const { images, setImages, setPreviewImages } = useGalleryImages(nodeKey)
  const [previewPool] = React.useState(() => createPreviewLeasePool())

  const galleryReorder = useGalleryReorder({ images, updateImages: reorderImages, isSelected })

  const {
    uploader: imageUploader,
    fileInputRef,
    dragHandler: imageFilesDropper,
    onFileChange,
  } = useMediaCardUpload({
    kind: 'image',
    nodeKey,
    guard: $isGalleryNode,
    triggerFileDialog,
    onFiles: (files, upload) =>
      galleryUploadIntent({
        upload,
        files: files ?? [],
        images,
        previews: previewPool,
        setImages,
        setPreviewImages,
        setErrorMessage,
      }),
  })

  function reorderImages(newImages: GalleryImage[]): void {
    recalculateImageRows(newImages)
    setImages(newImages)
  }

  const deleteImage = (imageToDelete: GalleryImage): void => {
    previewPool.release(imageToDelete.previewSrc)

    const newImages = images.filter((image) => image.fileName !== imageToDelete.fileName)
    recalculateImageRows(newImages)
    setImages(newImages)
  }

  React.useEffect(() => {
    return () => {
      previewPool.releaseAll()
    }
  }, [previewPool])

  function handleToolbarAdd(event: React.MouseEvent): void {
    event.preventDefault()
    fileInputRef.current?.click()
  }

  const clearErrorMessage = (): void => {
    setErrorMessage(null)
  }

  return (
    <>
      <GalleryCard
        captionEditor={captionEditor}
        captionEditorInitialState={captionEditorInitialState}
        clearErrorMessage={clearErrorMessage}
        deleteImage={deleteImage}
        errorMessage={errorMessage ?? undefined}
        fileInputRef={fileInputRef}
        filesDropper={imageFilesDropper}
        imageMimeTypes={fileUploader.fileTypes?.image?.mimeTypes}
        images={images}
        isSelected={isSelected}
        reorderHandler={galleryReorder}
        uploader={imageUploader}
        onFileChange={onFileChange}
      />

      <CardActionToolbar
        hideWhileEditing={false}
        items={[
          {
            kind: 'custom',
            dataTestId: 'add-gallery-image',
            icon: 'add',
            label: 'Add images',
            onClick: handleToolbarAdd,
          },
          { kind: 'separator' },
          { kind: 'snippet' },
        ]}
        nodeKey={nodeKey}
        visibleWhen={!imageFilesDropper.isDraggedOver && !galleryReorder.isDraggedOver && images.length > 0}
      />
    </>
  )
}

/**
 * Gallery's decorate render — the React-bearing half of its decorate-target,
 * paired with the declaration by `@/nodes/cards/card-decorate`.
 */
export function renderGalleryCard(node: GalleryNode) {
  return (
    <GalleryNodeComponent
      captionEditor={node.__captionEditor}
      captionEditorInitialState={node.__captionEditorInitialState}
      nodeKey={node.getKey()}
      triggerFileDialog={node.__triggerFileDialog}
    />
  )
}
