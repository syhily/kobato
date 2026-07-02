import type { MutableRefObject } from 'react'

import React from 'react'

import AudioFileIcon from '@/ui/inkling-editor/assets/icons/inkling-audio-file.svg?react'
import FilePlaceholderIcon from '@/ui/inkling-editor/assets/icons/inkling-file-placeholder.svg?react'
import DeleteIcon from '@/ui/inkling-editor/assets/icons/inkling-trash.svg?react'
import { AudioUploadForm } from '@/ui/inkling-editor/components/ui/AudioUploadForm'
import { IconButton } from '@/ui/inkling-editor/components/ui/IconButton'
import { ImageUploadForm } from '@/ui/inkling-editor/components/ui/ImageUploadForm'
import { MediaPlaceholder } from '@/ui/inkling-editor/components/ui/MediaPlaceholder'
import { MediaPlayer } from '@/ui/inkling-editor/components/ui/MediaPlayer'
import { ProgressBar } from '@/ui/inkling-editor/components/ui/ProgressBar'
import { ReadOnlyOverlay } from '@/ui/inkling-editor/components/ui/ReadOnlyOverlay'
import { TextInput } from '@/ui/inkling-editor/components/ui/TextInput'
import { openFileSelection } from '@/ui/inkling-editor/utils/openFileSelection'

export interface DragHandlerLike {
  isDraggedOver?: boolean
  setRef?: (element: HTMLElement | null) => void
}

export interface FileUploaderLike {
  isLoading?: boolean
  progress?: number
  errors?: Error[] | { message?: string }[]
}

export type FileInputRef = MutableRefObject<HTMLInputElement | null>

export type FileChangeEvent = React.ChangeEvent<HTMLInputElement> | { target: { files: File[] } }

interface AudioUploadingProps {
  progress?: number
}

interface EmptyAudioCardProps {
  audioUploader: FileUploaderLike
  audioMimeTypes?: string[]
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  setFileInputRef: (ref: FileInputRef) => void
  audioDragHandler?: DragHandlerLike
}

interface AudioThumbnailProps {
  mimeTypes?: string[]
  src?: string
  progress?: number
  isUploading?: boolean
  isEditing?: boolean
  setFileInputRef: (ref: FileInputRef) => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
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
  setFileInputRef: (ref: FileInputRef) => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
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
  onAudioFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onThumbnailFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  audioDragHandler?: DragHandlerLike
  removeThumbnail?: () => void
  thumbnailDragHandler?: DragHandlerLike
}

function AudioUploading({ progress }: AudioUploadingProps) {
  const progressStyle = {
    width: `${progress?.toFixed(0)}%`,
  }

  return (
    <div className="h-full border border-transparent">
      <div className="relative flex h-full items-center justify-center border border-grey/20 bg-grey-50 before:pb-[12.5%]">
        <div className="flex w-full items-center justify-center overflow-hidden">
          <ProgressBar style={progressStyle} />
        </div>
      </div>
    </div>
  )
}

function EmptyAudioCard({
  audioUploader,
  audioMimeTypes,
  onFileChange,
  setFileInputRef,
  audioDragHandler = {},
}: EmptyAudioCardProps) {
  const { isLoading: isUploading, progress, errors } = audioUploader
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const onFileInputRef = (element: HTMLInputElement | null) => {
    fileInputRef.current = element
    setFileInputRef(fileInputRef)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileChange(e)
  }

  if (isUploading) {
    return <AudioUploading progress={progress} />
  } else {
    return (
      <>
        <MediaPlaceholder
          desc="Click to upload an audio file"
          errorDataTestId="audio-upload-errors"
          errors={errors}
          filePicker={() => openFileSelection({ fileInputRef: fileInputRef })}
          icon="audio"
          isDraggedOver={audioDragHandler.isDraggedOver}
          placeholderRef={audioDragHandler.setRef}
          size="xsmall"
        />
        <AudioUploadForm fileInputRef={onFileInputRef} mimeTypes={audioMimeTypes} onFileChange={handleFileChange} />
      </>
    )
  }
}

function AudioThumbnail({
  mimeTypes,
  src,
  progress,
  isUploading,
  isEditing,
  setFileInputRef,
  onFileChange,
  removeThumbnail,
  isDraggedOver,
  errors,
}: AudioThumbnailProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const onFileInputRef = (element: HTMLInputElement | null) => {
    fileInputRef.current = element
    setFileInputRef(fileInputRef)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileChange(e)
  }

  const progressStyle = {
    width: `${progress?.toFixed(0)}%`,
  }

  if (isDraggedOver) {
    return (
      <div
        className="group bg-purple relative flex aspect-square h-20 items-center justify-center rounded-md"
        data-testid="audio-thumbnail-dragover"
      >
        <p className="font-sans text-sm font-semibold text-white">Drop it 🔥</p>
      </div>
    )
  } else if (errors && errors.length > 0) {
    return (
      <span
        className="group text-2xs text-red relative flex aspect-square h-20 items-center justify-center rounded-md bg-grey-200 px-1 text-center font-sans leading-snug font-semibold"
        data-testid="thumbnail-errors"
      >
        {errors[0].message}
      </span>
    )
  } else if (src) {
    return (
      <div className="group/image bg-purple relative flex aspect-square h-20 items-center justify-center rounded-md">
        <img
          alt="Audio thumbnail"
          className="size-full rounded-md object-cover transition ease-in"
          data-testid="audio-thumbnail"
          src={src}
        />
        {isEditing && (
          <div className="absolute top-2 right-2 flex opacity-0 transition-all group-hover/image:opacity-100">
            <IconButton dataTestId="remove-thumbnail" Icon={DeleteIcon} label="Delete" onClick={removeThumbnail} />
          </div>
        )}
      </div>
    )
  } else if (isUploading) {
    return (
      <div className="group bg-purple flex aspect-square h-20 items-center justify-center rounded-md">
        <ProgressBar bgStyle="transparent" style={progressStyle} />
      </div>
    )
  } else {
    return (
      <div className="group bg-purple flex aspect-square h-20 items-center justify-center rounded-md">
        <button
          className="flex size-20 cursor-pointer items-center justify-center"
          data-testid="upload-thumbnail"
          type="button"
          onClick={() => openFileSelection({ fileInputRef: fileInputRef })}
        >
          {(isEditing && (
            <FilePlaceholderIcon className="ease-inx size-6 text-white transition-all duration-75 group-hover:scale-105" />
          )) || <AudioFileIcon className="size-6 text-white" />}
        </button>
        <ImageUploadForm
          disabled={!isEditing}
          fileInputRef={onFileInputRef}
          mimeTypes={mimeTypes}
          onFileChange={handleFileChange}
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
  setFileInputRef,
  onFileChange,
  removeThumbnail,
  thumbnailDragHandler = {},
}: PopulatedAudioCardProps) {
  const { isLoading: isUploading, progress, errors } = thumbnailUploader
  const formatDuration = (rawDuration: number) => {
    const minutes = Math.floor(rawDuration / 60)
    const seconds = Math.floor(rawDuration - minutes * 60)
    const returnedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`
    const formattedDuration = `${minutes}:${returnedSeconds}`
    return formattedDuration
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateTitle(event.target.value)
  }

  return (
    <>
      <div
        ref={thumbnailDragHandler.setRef}
        className="flex rounded-md border border-grey/30 p-2"
        data-testid="audio-card-populated"
      >
        <AudioThumbnail
          errors={errors}
          isDraggedOver={thumbnailDragHandler.isDraggedOver}
          isEditing={isEditing}
          isUploading={isUploading}
          mimeTypes={thumbnailMimeTypes}
          progress={progress}
          removeThumbnail={removeThumbnail}
          setFileInputRef={setFileInputRef}
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
          <MediaPlayer duration={formatDuration(duration ?? 0)} theme="dark" />
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
  const setAudioFileInputRef = (ref: FileInputRef) => {
    if (audioFileInputRef) {
      audioFileInputRef.current = ref.current
    }
  }

  const setThumbnailFileInputRef = (ref: FileInputRef) => {
    if (thumbnailFileInputRef) {
      thumbnailFileInputRef.current = ref.current
    }
  }

  if (src) {
    return (
      <div className="not-inkling-prose">
        <PopulatedAudioCard
          duration={duration}
          isEditing={isEditing}
          placeholder="Add a title..."
          removeThumbnail={removeThumbnail}
          setFileInputRef={setThumbnailFileInputRef}
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
        <EmptyAudioCard
          audioDragHandler={audioDragHandler}
          audioMimeTypes={audioMimeTypes}
          audioUploader={audioUploader}
          setFileInputRef={setAudioFileInputRef}
          onFileChange={onAudioFileChange}
        />
      </div>
    )
  }
}
