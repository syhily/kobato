import type { EditorState, LexicalEditor } from 'lexical'

import React from 'react'

import type {
  DragHandlerLike,
  FileChangeEvent,
  FileInputRef,
  FileUploaderLike,
} from '@/ui/inkling-editor/components/ui/cards/AudioCard'

import WandIcon from '@/ui/inkling-editor/assets/icons/inkling-wand.svg?react'
import { CardCaptionEditor } from '@/ui/inkling-editor/components/ui/CardCaptionEditor'
import { IconButton } from '@/ui/inkling-editor/components/ui/IconButton'
import ImageUploadForm from '@/ui/inkling-editor/components/ui/ImageUploadForm'
import { CardText, MediaPlaceholder } from '@/ui/inkling-editor/components/ui/MediaPlaceholder'
import { ProgressBar } from '@/ui/inkling-editor/components/ui/ProgressBar'
import { isGif } from '@/ui/inkling-editor/utils/isGif'
import { openFileSelection } from '@/ui/inkling-editor/utils/openFileSelection'

interface PopulatedImageCardProps {
  src: string
  alt?: string
  previewSrc?: string | null
  imageUploader: FileUploaderLike
  imageCardDragHandler?: DragHandlerLike
  imageFileDragHandler?: DragHandlerLike
  isPinturaEnabled?: boolean
  openImageEditor?: (options: { image: string; handleSave: (blob: Blob) => void }) => void
  onFileChange: (e: FileChangeEvent) => void
}

interface EmptyImageCardProps {
  onFileChange: (e: FileChangeEvent) => void
  setFileInputRef: (ref: FileInputRef) => void
  imageFileDragHandler?: DragHandlerLike
  errors?: Error[] | { message?: string }[]
}

interface ImageHolderProps {
  src?: string
  altText?: string
  previewSrc?: string | null
  imageUploader: FileUploaderLike
  onFileChange: (e: FileChangeEvent) => void
  setFileInputRef: (ref: FileInputRef) => void
  imageCardDragHandler?: DragHandlerLike
  imageFileDragHandler?: DragHandlerLike
  isPinturaEnabled?: boolean
  openImageEditor?: (options: { image: string; handleSave: (blob: Blob) => void }) => void
}

export interface ImageCardProps {
  isSelected?: boolean
  src?: string
  onFileChange: (e: FileChangeEvent) => void
  captionEditor: LexicalEditor | null
  captionEditorInitialState?: EditorState
  altText?: string
  setAltText: (value: string) => void
  setFigureRef?: (ref: FileInputRef) => void
  fileInputRef?: FileInputRef
  cardWidth?: string
  previewSrc?: string | null
  imageUploader: FileUploaderLike
  imageCardDragHandler?: DragHandlerLike
  imageFileDragHandler?: DragHandlerLike
  isPinturaEnabled?: boolean
  openImageEditor?: (options: { image: string; handleSave: (blob: Blob) => void }) => void
}

function PopulatedImageCard({
  src,
  alt,
  previewSrc,
  imageUploader,
  imageCardDragHandler,
  imageFileDragHandler,
  isPinturaEnabled,
  openImageEditor,
  onFileChange,
}: PopulatedImageCardProps) {
  const progressStyle = {
    width: `${imageUploader.progress?.toFixed(0)}%`,
  }

  const progressAlt =
    imageUploader.progress && imageUploader.progress.toFixed(0) < '100'
      ? `upload in progress, ${imageUploader.progress}`
      : ''

  function setRef(element: HTMLElement | null) {
    imageFileDragHandler?.setRef?.(element)
    imageCardDragHandler?.setRef?.(element)
  }

  return (
    <div ref={setRef} className="not-inkling-prose group/image relative">
      <img
        alt={alt ? alt : progressAlt}
        className={`mx-auto block ${previewSrc ? 'opacity-40' : ''}`}
        data-testid={imageUploader.isLoading ? 'image-card-loading' : 'image-card-populated'}
        src={previewSrc ? previewSrc : src}
      />
      {imageUploader.isLoading ? (
        <div
          className="absolute inset-0 flex min-w-full items-center justify-center overflow-hidden bg-white/50"
          data-testid="upload-progress"
        >
          <ProgressBar style={progressStyle} />
        </div>
      ) : (
        <></>
      )}
      {imageCardDragHandler?.isDraggedOver ? (
        <div
          className={`absolute inset-0 flex items-center justify-center border border-grey/20 bg-black/80 dark:border-grey/10 dark:bg-grey-950`}
        >
          <CardText text="Drop to convert to a gallery" />
        </div>
      ) : null}
      {imageFileDragHandler?.isDraggedOver ? (
        <div
          className={`absolute inset-0 flex items-center justify-center border border-grey/20 bg-black/80 dark:border-grey/10 dark:bg-grey-950`}
          data-testid="drag-overlay"
        >
          <CardText text="Drop to replace image" />
        </div>
      ) : null}
      {isPinturaEnabled && !isGif(src) && (
        <div
          className={`pointer-events-none invisible absolute inset-0 bg-gradient-to-t from-black/0 via-black/5 to-black/30 p-3 opacity-0 transition-all group-hover/image:visible group-hover/image:opacity-100`}
        >
          <div className="flex flex-row-reverse">
            <IconButton
              Icon={WandIcon}
              label="Edit"
              onClick={() =>
                openImageEditor?.({
                  image: src,
                  handleSave: (editedImage: Blob) => {
                    const file =
                      editedImage instanceof File
                        ? editedImage
                        : new File([editedImage], 'image', { type: editedImage.type || 'image/png' })
                    onFileChange({
                      target: {
                        files: [file],
                      },
                    })
                  },
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyImageCard({ onFileChange, setFileInputRef, imageFileDragHandler, errors }: EmptyImageCardProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const onFileInputRef = (element: HTMLInputElement | null) => {
    fileInputRef.current = element
    setFileInputRef(fileInputRef)
  }

  return (
    <>
      <MediaPlaceholder
        desc="Click to select an image"
        errors={errors}
        filePicker={() => openFileSelection({ fileInputRef })}
        icon="image"
        isDraggedOver={imageFileDragHandler?.isDraggedOver}
        placeholderRef={imageFileDragHandler?.setRef}
        size="small"
      />
      <ImageUploadForm fileInputRef={onFileInputRef} onFileChange={onFileChange} />
    </>
  )
}

const ImageHolder = ({
  src,
  altText,
  previewSrc,
  imageUploader,
  onFileChange,
  setFileInputRef,
  imageCardDragHandler,
  imageFileDragHandler,
  isPinturaEnabled,
  openImageEditor,
}: ImageHolderProps) => {
  if (previewSrc || src) {
    return (
      <PopulatedImageCard
        alt={altText}
        imageCardDragHandler={imageCardDragHandler}
        imageFileDragHandler={imageFileDragHandler}
        imageUploader={imageUploader}
        isPinturaEnabled={isPinturaEnabled}
        openImageEditor={openImageEditor}
        previewSrc={previewSrc}
        src={src!}
        onFileChange={onFileChange}
      />
    )
  } else {
    return (
      <EmptyImageCard
        errors={imageUploader.errors}
        imageFileDragHandler={imageFileDragHandler}
        setFileInputRef={setFileInputRef}
        onFileChange={onFileChange}
      />
    )
  }
}

export function ImageCard({
  isSelected,
  src,
  onFileChange,
  captionEditor,
  captionEditorInitialState,
  altText,
  setAltText,
  setFigureRef,
  fileInputRef,
  cardWidth,
  previewSrc,
  imageUploader,
  imageCardDragHandler,
  imageFileDragHandler,
  isPinturaEnabled,
  openImageEditor,
}: ImageCardProps) {
  const figureRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (setFigureRef) {
      setFigureRef(figureRef as FileInputRef)
    }
  }, [figureRef, setFigureRef])

  const setFileInputRef = (ref: FileInputRef) => {
    if (fileInputRef) {
      fileInputRef.current = ref.current
    }
  }
  return (
    <>
      <figure ref={figureRef} data-inkling-card-width={cardWidth}>
        <ImageHolder
          altText={altText}
          imageCardDragHandler={imageCardDragHandler}
          imageFileDragHandler={imageFileDragHandler}
          imageUploader={imageUploader}
          isPinturaEnabled={isPinturaEnabled}
          openImageEditor={openImageEditor}
          previewSrc={previewSrc}
          setFileInputRef={setFileInputRef}
          src={src}
          onFileChange={onFileChange}
        />
        <CardCaptionEditor
          altText={altText || ''}
          altTextPlaceholder="Type alt text for image (optional)"
          captionEditor={captionEditor}
          captionEditorInitialState={captionEditorInitialState}
          captionPlaceholder="Type caption for image (optional)"
          dataTestId="image-caption-editor"
          isSelected={isSelected}
          readOnly={!isSelected}
          setAltText={setAltText}
        />
      </figure>
    </>
  )
}
