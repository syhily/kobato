import type { RefObject } from 'react'

import React from 'react'

import type { DragHandlerLike } from '@/components/ui/cards/card-ui-types'

import DeleteIcon from '@/assets/icons/inkling-trash.svg?react'
import WandIcon from '@/assets/icons/inkling-wand.svg?react'
import { IconButton } from '@/components/ui/IconButton'
import {
  type MediaPlaceholderSize,
  type MediaPlaceholderType,
  MediaPlaceholder,
  isPlaceholderIconName,
} from '@/components/ui/MediaPlaceholder'
import { UploadFileInput, UploadingOverlay, useFileInputRefTunnel } from '@/components/ui/UploadChrome'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { cx } from '@/utils/cx'

export interface MediaUploaderProps {
  className?: string
  imgClassName?: string
  src?: string
  alt?: string
  desc?: string
  icon?: string
  size?: MediaPlaceholderSize
  type?: MediaPlaceholderType
  borderStyle?: 'squared' | 'rounded' | 'simple' | 'heavy'
  backgroundSize?: 'cover' | 'contain'
  mimeTypes?: string[]
  onFileChange: (files: File[]) => void
  dragHandler?: DragHandlerLike
  isEditing?: boolean
  isLoading?: boolean
  isPinturaEnabled?: boolean
  openImageEditor?: (options: { image: string; handleSave: (blob: Blob) => void }) => void
  progress?: number
  errors?: Error[] | { message?: string }[]
  onRemoveMedia?: () => void
  additionalActions?: React.ReactNode
  setFileInputRef?: (ref: RefObject<HTMLInputElement | null>) => void
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
  const { fileInputRef, onFileInputRef } = useFileInputRefTunnel(setFileInputRef)
  const labels = useInklingLabels()

  const onRemove = (e: React.MouseEvent) => {
    e.stopPropagation() // prevents card from losing selected state
    onRemoveMedia()
  }

  const isEmpty = !isLoading && !src

  const handleImageEditorSave = (editedImage: Blob) => {
    const file =
      editedImage instanceof File
        ? editedImage
        : new File([editedImage], 'image', { type: editedImage.type || 'image/png' })
    onFileChange([file])
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
          filePicker={() => fileInputRef.current?.click()}
          icon={isPlaceholderIconName(icon) ? icon : 'image'}
          isDraggedOver={dragHandler?.isDraggedOver}
          placeholderRef={dragHandler?.setRef}
          size={size ?? 'small'}
          type={type}
        />
        <UploadFileInput
          fileInputRef={onFileInputRef}
          mimeTypes={mimeTypes ?? ['image/*']}
          name="image-input"
          stopClickPropagation={true}
          onFileChange={onFileChange}
        />
      </div>
    )
  }

  return (
    <div
      className={cx(
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
            className={cx(
              'mx-auto h-full w-auto min-w-[5.2rem]',
              borderStyle === 'rounded' && 'rounded-lg',
              backgroundSize === 'cover' ? 'object-cover' : 'object-contain',
              imgClassName,
            )}
            src={src}
          />
          <div
            className={cx(
              'absolute inset-0 bg-gradient-to-t from-black/0 via-black/5 to-black/30 opacity-0 transition-all group-hover/image:opacity-100',
              borderStyle === 'rounded' && 'rounded-lg',
            )}
          ></div>
        </>
      )}

      {!isLoading && (
        <div className="absolute top-1 right-1 flex space-x-1 opacity-0 transition-all group-hover/image:opacity-100">
          {additionalActions}
          {isPinturaEnabled && openImageEditor && src && (
            <IconButton
              Icon={WandIcon}
              label={labels['action.edit']}
              onClick={() => openImageEditor({ image: src, handleSave: handleImageEditorSave })}
            />
          )}
          <IconButton
            dataTestId="media-upload-remove"
            Icon={DeleteIcon}
            label={labels['action.delete']}
            onClick={onRemove}
          />
        </div>
      )}

      {isLoading && (
        <UploadingOverlay
          className={cx('bg-grey-100', borderStyle === 'rounded' && 'rounded-lg')}
          dataTestId="custom-thumbnail-progress"
          progress={progress}
        />
      )}
    </div>
  )
}
