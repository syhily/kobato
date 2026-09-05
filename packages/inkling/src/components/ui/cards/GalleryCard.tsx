import type { EditorState, LexicalEditor } from 'lexical'

import type { DragHandlerLike, FileUploaderLike, ReorderHandlerLike } from '@/components/ui/cards/card-ui-types'
import type { GalleryImage } from '@/types/gallery'

import DeleteIcon from '@/assets/icons/inkling-trash.svg?react'
import { CardCaptionEditor } from '@/components/ui/CardCaptionEditor'
import { IconButton } from '@/components/ui/IconButton'
import { MediaPlaceholder } from '@/components/ui/MediaPlaceholder'
import { UploadFileInput, UploadingOverlay } from '@/components/ui/UploadChrome'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { interpolateLabel } from '@/labels/inkling-labels'
import { MAX_IMAGES, buildGalleryRows } from '@/nodes/base/nodes/gallery/gallery-rows'

interface GalleryRowProps {
  index: number
  images: GalleryImage[]
  deleteImage: (image: GalleryImage) => void
  isDragging: boolean
}

function GalleryRow({ index, images, deleteImage, isDragging }: GalleryRowProps) {
  const GalleryImages = images.map((image, idx) => {
    const position: 'single' | 'first' | 'middle' | 'last' =
      images.length === 1 ? 'single' : idx === 0 ? 'first' : idx === images.length - 1 ? 'last' : 'middle'

    return (
      <GalleryImage
        key={image.src}
        deleteImage={deleteImage}
        image={image}
        isDragging={isDragging}
        position={position}
      />
    )
  })

  return (
    <div className={`flex flex-row justify-center ${index !== 0 ? 'mt-4' : ''}`} data-row={index}>
      {GalleryImages}
    </div>
  )
}

interface GalleryImageProps {
  image: GalleryImage
  deleteImage: (image: GalleryImage) => void
  position: 'single' | 'first' | 'middle' | 'last'
  isDragging: boolean
}

function GalleryImage({ image, deleteImage, position, isDragging }: GalleryImageProps) {
  const labels = useInklingLabels()
  const aspectRatio = (image.width || 1) / (image.height || 1)
  const style: React.CSSProperties = {
    flex: `${aspectRatio} 1 0%`,
  }

  let classes: string[] = []
  let overlayClasses: string[] = []

  switch (position) {
    case 'first':
      classes = ['pr-2']
      overlayClasses = ['mr-2']
      break
    case 'middle':
      classes = ['pl-2', 'pr-2']
      overlayClasses = ['ml-2', 'mr-2']
      break
    case 'last':
      classes = ['pl-2']
      overlayClasses = ['ml-2']
      break
    default:
  }

  return (
    <div className={`group/image relative ${classes.join(' ')}`} data-testid="gallery-image" style={style} data-image>
      <img
        alt={image.alt ?? ''}
        className="pointer-events-none block size-full"
        height={image.height}
        src={image.previewSrc || image.src}
        width={image.width}
      />

      {isDragging ? null : (
        <div
          className={`pointer-events-none invisible absolute inset-0 bg-gradient-to-t from-black/0 via-black/5 to-black/30 p-3 opacity-0 transition-all group-hover/image:visible group-hover/image:opacity-100 ${overlayClasses.join(' ')}`}
        >
          <div className="flex flex-row-reverse">
            <IconButton
              className={undefined}
              dataTestId={'delete-image'}
              Icon={DeleteIcon}
              label={labels['action.delete']}
              onClick={() => deleteImage(image)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

interface PopulatedGalleryCardProps {
  images: GalleryImage[]
  deleteImage: (image: GalleryImage) => void
  reorderHandler?: ReorderHandlerLike
  isDragging: boolean
}

function PopulatedGalleryCard({ images, deleteImage, reorderHandler, isDragging }: PopulatedGalleryCardProps) {
  const rows = buildGalleryRows(images)

  const GalleryRows = rows.map((rowImages, idx) => {
    return (
      <GalleryRow
        key={rowImages.map((image) => image.src || image.fileName || '').join('-')}
        deleteImage={deleteImage}
        images={rowImages}
        index={idx}
        isDragging={isDragging}
      />
    )
  })

  return (
    <div ref={reorderHandler?.setContainerRef} className="not-inkling-prose flex flex-col" data-gallery>
      {GalleryRows}
    </div>
  )
}

interface EmptyGalleryCardProps {
  openFilePicker: () => void
  isDraggedOver?: boolean
  reorderHandler?: ReorderHandlerLike
}

function EmptyGalleryCard({ openFilePicker, isDraggedOver, reorderHandler }: EmptyGalleryCardProps) {
  const labels = useInklingLabels()

  return (
    <MediaPlaceholder
      desc={interpolateLabel(labels['upload.gallery.desc'], { max: `${MAX_IMAGES}` })}
      filePicker={openFilePicker}
      icon="gallery"
      isDraggedOver={isDraggedOver}
      multiple={true}
      placeholderRef={reorderHandler?.setContainerRef}
      size="large"
      type="image"
    />
  )
}

function FileDragOverlay() {
  const labels = useInklingLabels()

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center bg-black/60" data-inkling-card-drag-text>
      <span className="block w-full text-center font-bold text-white">
        {interpolateLabel(labels['media.dragText.addToGallery'], { max: `${MAX_IMAGES}` })}
      </span>
    </div>
  )
}

export interface GalleryCardProps {
  captionEditor: LexicalEditor | null
  captionEditorInitialState: EditorState | undefined
  clearErrorMessage: () => void
  deleteImage: (image: GalleryImage) => void
  filesDropper: DragHandlerLike
  errorMessage?: string
  fileInputRef: React.RefObject<HTMLInputElement | null>
  imageMimeTypes?: string[]
  images?: GalleryImage[]
  isSelected?: boolean
  onFileChange: (files: File[]) => void
  uploader?: FileUploaderLike
  reorderHandler?: ReorderHandlerLike
}

export function GalleryCard({
  captionEditor,
  captionEditorInitialState,
  clearErrorMessage,
  deleteImage,
  filesDropper,
  errorMessage,
  fileInputRef,
  imageMimeTypes = [],
  images = [],
  isSelected,
  onFileChange,
  uploader,
  reorderHandler,
}: GalleryCardProps) {
  const labels = useInklingLabels()

  const openFilePicker = (): void => {
    fileInputRef.current?.click()
  }

  const { isLoading, progress } = uploader ?? {}
  const { isDraggedOver: filesDraggedOver, setRef: filesDropSetRef } = filesDropper
  const reorderDraggedOver = reorderHandler?.isDraggedOver
  const isDragging = filesDraggedOver || reorderDraggedOver

  return (
    <figure>
      <div ref={filesDropSetRef} className="not-inkling-prose relative" data-testid="gallery-container">
        {images.length ? (
          <PopulatedGalleryCard
            deleteImage={deleteImage}
            images={images}
            isDragging={!!isDragging}
            reorderHandler={reorderHandler}
          />
        ) : (
          <EmptyGalleryCard
            isDraggedOver={isDragging}
            openFilePicker={openFilePicker}
            reorderHandler={reorderHandler}
          />
        )}

        {isLoading ? (
          <UploadingOverlay bgStyle="transparent" dataTestId="gallery-progress" progress={progress} />
        ) : null}
        {images.length && filesDraggedOver ? <FileDragOverlay /> : null}

        {errorMessage && !isDragging ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60" data-testid="gallery-error">
            <span className="block bg-red px-2 font-bold text-white">
              {errorMessage}.
              <button
                className="ml-2 cursor-pointer underline"
                data-testid="clear-gallery-error"
                type="button"
                onClick={clearErrorMessage}
              >
                {labels['action.dismiss']}
              </button>
            </span>
          </div>
        ) : null}

        <UploadFileInput
          fileInputRef={fileInputRef}
          mimeTypes={imageMimeTypes}
          multiple={true}
          name="image-input"
          onFileChange={onFileChange}
        />
      </div>

      <CardCaptionEditor
        captionEditor={captionEditor}
        captionEditorInitialState={captionEditorInitialState}
        captionPlaceholder={labels['caption.gallery.placeholder']}
        dataTestId="gallery-card-caption"
        isSelected={isSelected ?? false}
        readOnly={!isSelected}
      />
    </figure>
  )
}
