import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React from 'react'

import type { GalleryImage } from '@/ui/inkling-editor/types/gallery'

import { ActionToolbar } from '@/ui/inkling-editor/components/ui/ActionToolbar'
import { GalleryCard } from '@/ui/inkling-editor/components/ui/cards/GalleryCard'
import { SnippetCreateToolbar } from '@/ui/inkling-editor/components/ui/SnippetCreateToolbar'
import { ToolbarMenu, ToolbarMenuItem, ToolbarMenuSeparator } from '@/ui/inkling-editor/components/ui/ToolbarMenu'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import useFileDragAndDrop from '@/ui/inkling-editor/hooks/useFileDragAndDrop'
import useGalleryReorder from '@/ui/inkling-editor/hooks/useGalleryReorder'
import { GeneratedDecoratorNodeBase } from '@/ui/inkling-editor/nodes/base'
import { MAX_IMAGES, recalculateImageRows } from '@/ui/inkling-editor/nodes/GalleryNode'
import { getImageDimensions } from '@/ui/inkling-editor/utils/getImageDimensions'

interface DragHandlerLike {
  isDraggedOver?: boolean
  setRef: (node: HTMLElement | null) => void
}

interface ImageUploaderLike {
  isLoading?: boolean
  upload?: (
    files: FileList | File[],
    options?: { formData?: Record<string, string> },
  ) => Promise<Array<{ url?: string; fileName?: string }> | undefined>
  progress?: number
  errors?: Error[]
}

export interface GalleryNodeComponentProps {
  nodeKey: NodeKey
  captionEditor: LexicalEditor | null
  captionEditorInitialState: EditorState | undefined
}

export function GalleryNodeComponent({ nodeKey, captionEditor, captionEditorInitialState }: GalleryNodeComponentProps) {
  const [editor] = useLexicalComposerContext()
  const { fileUploader, cardConfig } = React.useContext(InklingComposerContext)
  const { isSelected } = React.useContext(CardContext)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [showSnippetToolbar, setShowSnippetToolbar] = React.useState<boolean>(false)
  const [images, setImages] = React.useState<GalleryImage[]>(() => {
    const existingImages = editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey)
      return (node as GeneratedDecoratorNodeBase).images as GalleryImage[] | undefined
    })
    return existingImages ?? []
  })

  const galleryReorder = useGalleryReorder({ images, updateImages: reorderImages, isSelected })
  const imageUploader: ImageUploaderLike = fileUploader.useFileUpload('image')

  const handleImageFilesDrop = async (files: File[] | FileList): Promise<void> => {
    await handleImageUploads(files)
  }

  const imageFilesDropper = useFileDragAndDrop({ handleDrop: handleImageFilesDrop }) as DragHandlerLike

  function reorderImages(newImages: GalleryImage[]): void {
    recalculateImageRows(newImages)
    setImages(newImages)
    setNodeImages(newImages)
  }

  function setNodeImages(newImages: GalleryImage[]): void {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      const galleryNode = node as GeneratedDecoratorNodeBase | null
      if (galleryNode && typeof galleryNode.setImages === 'function') {
        ;(galleryNode.setImages as (images: GalleryImage[]) => void)(newImages)
      }
    })
  }

  const deleteImage = (imageToDelete: GalleryImage): void => {
    const newImages = images.filter((image) => image.fileName !== imageToDelete.fileName)
    recalculateImageRows(newImages)
    setImages(newImages)
    setNodeImages(newImages)
  }

  const handleImageUploads = async (files: FileList | File[]): Promise<void> => {
    const currentCount = images.length
    const allowedCount = MAX_IMAGES - currentCount

    const strippedFiles = Array.prototype.slice.call(files, 0, allowedCount) as File[]
    if (strippedFiles.length < files.length) {
      setErrorMessage('Galleries are limited to 9 images')
    }

    if (strippedFiles.length === 0) {
      return
    }

    const newImages: GalleryImage[] = [...images]

    // create preview images and capture dimensions
    for (const file of strippedFiles) {
      const previewSrc = URL.createObjectURL(file)
      const { width, height } = await getImageDimensions(previewSrc)

      newImages.push({
        fileName: file.name,
        previewSrc,
        width,
        height,
      })
    }

    recalculateImageRows(newImages)

    // show preview images immediately
    setImages(newImages)

    // start uploads
    const uploadResult = await imageUploader.upload?.(strippedFiles)
    const uploadedImages = [...newImages]

    if (!uploadResult) {
      setErrorMessage('Something went wrong while uploading images. Please refresh the page and try again')
      return
    }

    uploadResult.forEach((result) => {
      const image = uploadedImages.find((i) => i.fileName === result.fileName)

      if (image) {
        image.src = result.url
      }
    })

    // update local state
    setImages(newImages)
    setNodeImages(newImages)
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = e.target.files

    if (!files || !files.length) {
      return
    }

    return await handleImageUploads(files)
  }

  function handleToolbarAdd(event: React.MouseEvent): void {
    event.preventDefault()
    fileInputRef.current?.click()
  }

  const clearErrorMessage = (): void => {
    setErrorMessage(null)
  }

  const hideToolbar =
    !isSelected || imageFilesDropper.isDraggedOver || galleryReorder.isDraggedOver || images.length <= 0 // oxlint-disable-next-line typescript/no-explicit-any

  // oxlint-disable-next-line typescript/no-explicit-any

  // oxlint-disable-next-line typescript/no-explicit-any

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

      <ActionToolbar data-inkling-card-toolbar="gallery" isVisible={showSnippetToolbar}>
        <SnippetCreateToolbar nodeKey={nodeKey} onClose={() => setShowSnippetToolbar(false)} />
      </ActionToolbar>

      <ActionToolbar data-inkling-card-toolbar="gallery" isVisible={!hideToolbar}>
        <ToolbarMenu>
          <ToolbarMenuItem
            className={undefined}
            dataTestId="add-gallery-image"
            icon="add"
            isActive={false}
            label="Add images"
            onClick={handleToolbarAdd}
          />
          <ToolbarMenuSeparator hide={!cardConfig.createSnippet} />
          <ToolbarMenuItem
            className={undefined}
            dataTestId="create-snippet"
            hide={!cardConfig.createSnippet}
            icon="snippet"
            isActive={false}
            label="Save as snippet"
            onClick={() => setShowSnippetToolbar(true)}
          />
        </ToolbarMenu>
      </ActionToolbar>
    </>
  )
}
