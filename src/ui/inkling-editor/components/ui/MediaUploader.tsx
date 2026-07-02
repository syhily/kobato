import type { MutableRefObject } from 'react'

import clsx from 'clsx'
import React, { useRef } from 'react'

import type { DragHandlerLike, FileChangeEvent } from '@/ui/inkling-editor/components/ui/cards/AudioCard'

import DeleteIcon from '@/ui/inkling-editor/assets/icons/inkling-trash.svg?react'
import WandIcon from '@/ui/inkling-editor/assets/icons/inkling-wand.svg?react'
import { IconButton } from '@/ui/inkling-editor/components/ui/IconButton'
import ImageUploadForm from '@/ui/inkling-editor/components/ui/ImageUploadForm'
import { MediaPlaceholder } from '@/ui/inkling-editor/components/ui/MediaPlaceholder'
import { ProgressBar } from '@/ui/inkling-editor/components/ui/ProgressBar'
import { openFileSelection } from '@/ui/inkling-editor/utils/openFileSelection'

export interface MediaUploaderProps {
  className?: string
  imgClassName?: string
  src?: string
  alt?: string
  desc?: string
  icon?: string
  size?: string
  type?: string
  borderStyle?: 'squared' | 'rounded' | 'simple' | 'heavy'
  backgroundSize?: 'cover' | 'contain'
  mimeTypes?: string[]
  onFileChange: (e: FileChangeEvent) => void
  dragHandler?: DragHandlerLike
  isEditing?: boolean
  isLoading?: boolean
  isPinturaEnabled?: boolean
  openImageEditor?: (handleSave: (file: File) => void) => void
  progress?: number
  errors?: Error[] | { message?: string }[]
  onRemoveMedia?: () => void
  additionalActions?: React.ReactNode
  setFileInputRef?: (ref: MutableRefObject<HTMLInputElement | null>) => void
}

export function MediaUploader({
  className,
  imgClassName,
  src,
  alt,
  desc,
  icon,
  size,
  type,
  borderStyle = 'squared',
  backgroundSize = 'cover',
  mimeTypes,
  onFileChange,
  dragHandler,
  isEditing = true,
  isLoading,
  isPinturaEnabled,
  openImageEditor,
  progress,
  errors,
  onRemoveMedia = () => {},
  additionalActions,
  setFileInputRef,
}: MediaUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const onFileInputRef = (element: HTMLInputElement | null) => {
    fileInputRef.current = element
    setFileInputRef?.(fileInputRef)
  }

  const progressStyle = {
    width: `${progress?.toFixed(0)}%`,
  }

  const onRemove = (e: React.MouseEvent) => {
    e.stopPropagation() // prevents card from losing selected state
    onRemoveMedia()
  }

  const isEmpty = !isLoading && !src

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFileChange(e)
  }

  const handleImageEditorSave = (editedImage: File) => {
    onFileChange({
      target: {
        files: [editedImage],
      },
    })
  }

  if (isEmpty) {
    return (
      <div className={className}>
        <MediaPlaceholder
          borderStyle={borderStyle}
          dataTestId="media-upload-placeholder"
          desc={isEditing ? (desc ?? '') : ''}
          errorDataTestId="media-upload-errors"
          errors={errors}
          filePicker={() => openFileSelection({ fileInputRef })}
          icon={icon ?? 'image'}
          isDraggedOver={dragHandler?.isDraggedOver}
          placeholderRef={dragHandler?.setRef}
          size={size ?? 'small'}
          type={type}
        />
        <ImageUploadForm fileInputRef={onFileInputRef} mimeTypes={mimeTypes} onFileChange={handleFileChange} />
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'group/image relative flex items-center justify-center',
        isLoading ? 'min-w-[6.8rem]' : 'min-w-[5.2rem]',
        borderStyle === 'rounded' && 'rounded',
        className,
      )}
      data-testid="media-upload-filled"
    >
      {src && (
        <>
          <img
            alt={alt}
            className={clsx(
              'mx-auto h-full w-auto min-w-[5.2rem]',
              borderStyle === 'rounded' && 'rounded-lg',
              backgroundSize === 'cover' ? 'object-cover' : 'object-contain',
              imgClassName,
            )}
            src={src}
          />
          <div
            className={clsx(
              'inset-0 from-black/0 via-black/5 to-black/30 absolute bg-gradient-to-t opacity-0 transition-all group-hover/image:opacity-100',
              borderStyle === 'rounded' && 'rounded-lg',
            )}
          ></div>
        </>
      )}

      {!isLoading && (
        <div className="absolute top-1 right-1 flex space-x-1 opacity-0 transition-all group-hover/image:opacity-100">
          {additionalActions}
          {isPinturaEnabled && openImageEditor && (
            <IconButton Icon={WandIcon} label="Edit" onClick={() => openImageEditor(handleImageEditorSave)} />
          )}
          <IconButton dataTestId="media-upload-remove" Icon={DeleteIcon} label="Delete" onClick={onRemove} />
        </div>
      )}

      {isLoading && (
        <div
          className={clsx(
            'inset-0 bg-grey-100 absolute flex min-w-full items-center justify-center overflow-hidden',
            borderStyle === 'rounded' && 'rounded-lg',
          )}
          data-testid="custom-thumbnail-progress"
        >
          <ProgressBar style={progressStyle} />
        </div>
      )}
    </div>
  )
}
