import React from 'react'

import type { DragHandlerLike, FileInputRef, FileUploaderLike } from '@/components/ui/cards/card-ui-types'

import AudioFileIcon from '@/assets/icons/inkling-audio-file.svg?react'
import FilePlaceholderIcon from '@/assets/icons/inkling-file-placeholder.svg?react'
import DeleteIcon from '@/assets/icons/inkling-trash.svg?react'
import { IconButton } from '@/components/ui/IconButton'
import { MediaPlayer } from '@/components/ui/MediaPlayer'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ReadOnlyOverlay } from '@/components/ui/ReadOnlyOverlay'
import { TextInput } from '@/components/ui/TextInput'
import {
  UploadFileInput,
  UploadPlaceholder,
  uploadProgressStyle,
  useFileInputRefTunnel,
} from '@/components/ui/UploadChrome'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { formatVideoDuration } from '@/nodes/base/nodes/video/format-video-duration'

interface AudioThumbnailProps {
  mimeTypes?: string[]
  src?: string
  progress?: number
  isUploading?: boolean
  isEditing?: boolean
  fileInputRef?: FileInputRef
  onFileChange: (files: File[]) => void
  removeThumbnail?: () => void
  isDraggedOver?: boolean
  errors?: Error[] | { message?: string }[]
}

interface PopulatedAudioCardProps {
  isEditing?: boolean
  title?: string
  placeholder?: string
  thumbnailUploader: FileUploaderLike
  thumbnailMimeTypes?: string[]
  duration?: number
  updateTitle: (value: string) => void
  thumbnailSrc?: string
  fileInputRef?: FileInputRef
  onFileChange: (files: File[]) => void
  removeThumbnail?: () => void
  thumbnailDragHandler?: DragHandlerLike
}

export interface AudioCardProps {
  src?: string
  thumbnailSrc?: string
  title?: string
  isEditing?: boolean
  updateTitle: (value: string) => void
  duration?: number
  audioUploader: FileUploaderLike
  audioMimeTypes?: string[]
  thumbnailUploader: FileUploaderLike
  thumbnailMimeTypes?: string[]
  audioFileInputRef?: FileInputRef
  thumbnailFileInputRef?: FileInputRef
  onAudioFileChange: (files: File[]) => void
  onThumbnailFileChange: (files: File[]) => void
  audioDragHandler?: DragHandlerLike
  removeThumbnail?: () => void
  thumbnailDragHandler?: DragHandlerLike
}

function AudioThumbnail({
  mimeTypes,
  src,
  progress,
  isUploading,
  isEditing,
  fileInputRef: parentFileInputRef,
  onFileChange,
  removeThumbnail,
  isDraggedOver,
  errors,
}: AudioThumbnailProps) {
  const { fileInputRef, onFileInputRef } = useFileInputRefTunnel(parentFileInputRef)
  const labels = useInklingLabels()

  if (isDraggedOver) {
    return (
      <div
        className="group relative flex aspect-square h-20 items-center justify-center rounded-md bg-purple"
        data-testid="audio-thumbnail-dragover"
      >
        <p className="font-sans text-sm font-semibold text-white">{labels['media.dragText.compact']}</p>
      </div>
    )
  } else if (errors && errors.length > 0) {
    return (
      <span
        className="group relative flex aspect-square h-20 items-center justify-center rounded-md bg-grey-200 px-1 text-center font-sans text-2xs leading-snug font-semibold text-red"
        data-testid="thumbnail-errors"
      >
        {errors[0].message}
      </span>
    )
  } else if (src) {
    return (
      <div className="group/image relative flex aspect-square h-20 items-center justify-center rounded-md bg-purple">
        <img
          alt={labels['alt.audioThumbnail']}
          className="size-full rounded-md object-cover transition ease-in"
          data-testid="audio-thumbnail"
          src={src}
        />
        {isEditing && (
          <div className="absolute top-2 right-2 flex opacity-0 transition-all group-hover/image:opacity-100">
            <IconButton
              dataTestId="remove-thumbnail"
              Icon={DeleteIcon}
              label={labels['action.delete']}
              onClick={removeThumbnail}
            />
          </div>
        )}
      </div>
    )
  } else if (isUploading) {
    return (
      <div className="group flex aspect-square h-20 items-center justify-center rounded-md bg-purple">
        <ProgressBar bgStyle="transparent" style={uploadProgressStyle(progress)} />
      </div>
    )
  } else {
    return (
      <div className="group flex aspect-square h-20 items-center justify-center rounded-md bg-purple">
        <button
          className="flex size-20 cursor-pointer items-center justify-center"
          data-testid="upload-thumbnail"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          {(isEditing && (
            <FilePlaceholderIcon className="size-6 text-white transition-all duration-75 ease-in group-hover:scale-105" />
          )) || <AudioFileIcon className="size-6 text-white" />}
        </button>
        <UploadFileInput
          disabled={!isEditing}
          fileInputRef={onFileInputRef}
          mimeTypes={mimeTypes ?? ['image/*']}
          name="image-input"
          stopClickPropagation={true}
          onFileChange={onFileChange}
        />
      </div>
    )
  }
}

function PopulatedAudioCard({
  isEditing,
  title,
  placeholder,
  thumbnailUploader,
  thumbnailMimeTypes,
  duration,
  updateTitle,
  thumbnailSrc,
  fileInputRef,
  onFileChange,
  removeThumbnail,
  thumbnailDragHandler,
}: PopulatedAudioCardProps) {
  const { isLoading: isUploading, progress, errors } = thumbnailUploader

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateTitle(event.target.value)
  }

  return (
    <>
      <div
        ref={thumbnailDragHandler?.setRef}
        className="flex rounded-md border border-grey/30 p-2"
        data-testid="audio-card-populated"
      >
        <AudioThumbnail
          errors={errors}
          fileInputRef={fileInputRef}
          isDraggedOver={thumbnailDragHandler?.isDraggedOver}
          isEditing={isEditing}
          isUploading={isUploading}
          mimeTypes={thumbnailMimeTypes}
          progress={progress}
          removeThumbnail={removeThumbnail}
          src={thumbnailSrc}
          onFileChange={onFileChange}
        />
        <div className="flex h-20 w-full flex-col justify-between px-4">
          {(isEditing || title) && (
            <TextInput
              className="bg-transparent font-sans text-lg font-bold text-current"
              data-testid="audio-title"
              name="title"
              placeholder={placeholder}
              readOnly={!isEditing}
              value={title}
              onChange={handleChange}
            />
          )}
          <MediaPlayer duration={formatVideoDuration(duration ?? 0)} theme="dark" />
        </div>
      </div>
      {!isEditing && <ReadOnlyOverlay />}
    </>
  )
}

export function AudioCard({
  src,
  thumbnailSrc,
  title,
  isEditing,
  updateTitle,
  duration,
  audioUploader,
  audioMimeTypes,
  thumbnailUploader,
  thumbnailMimeTypes,
  audioFileInputRef,
  thumbnailFileInputRef,
  onAudioFileChange,
  onThumbnailFileChange,
  audioDragHandler,
  removeThumbnail,
  thumbnailDragHandler,
}: AudioCardProps) {
  const labels = useInklingLabels()

  if (src) {
    return (
      <div className="not-inkling-prose">
        <PopulatedAudioCard
          duration={duration}
          fileInputRef={thumbnailFileInputRef}
          isEditing={isEditing}
          placeholder={labels['audio.title.placeholder']}
          removeThumbnail={removeThumbnail}
          thumbnailDragHandler={thumbnailDragHandler}
          thumbnailMimeTypes={thumbnailMimeTypes}
          thumbnailSrc={thumbnailSrc}
          thumbnailUploader={thumbnailUploader}
          title={title}
          updateTitle={updateTitle}
          onFileChange={onThumbnailFileChange}
        />
      </div>
    )
  } else {
    return (
      <div className="not-inkling-prose">
        <UploadPlaceholder
          desc={labels['upload.audio.desc']}
          dragHandler={audioDragHandler}
          errorDataTestId="audio-upload-errors"
          errors={audioUploader.errors}
          fileInputRef={audioFileInputRef}
          icon="audio"
          inputName="audio-input"
          isUploading={audioUploader.isLoading}
          mimeTypes={audioMimeTypes ?? ['audio/*']}
          progress={audioUploader.progress}
          size="xsmall"
          onFileChange={onAudioFileChange}
        />
      </div>
    )
  }
}
