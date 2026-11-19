import type { DragHandlerLike, FileInputRef } from '@kobato/inkling-internal/components/ui/cards/card-ui-types'
import type { MediaPlaceholderSize, PlaceholderIconName } from '@kobato/inkling-internal/components/ui/MediaPlaceholder'

import { MediaPlaceholder } from '@kobato/inkling-internal/components/ui/MediaPlaceholder'
import { ProgressBar } from '@kobato/inkling-internal/components/ui/ProgressBar'
import { cx } from '@kobato/inkling-internal/utils/cx'
import React from 'react'

export function uploadProgressStyle(progress?: number): React.CSSProperties {
  return { width: `${progress?.toFixed(0) ?? '0'}%` }
}
export interface UploadFileInputProps {
  /** The input's `name` — a DOM contract unit tests and e2e query (`input[name="…"]`). */
  name: string
  fileInputRef?: React.Ref<HTMLInputElement>
  mimeTypes?: string[]
  multiple?: boolean
  disabled?: boolean

  stopClickPropagation?: boolean

  onFileChange?: (files: File[]) => void
}

export function UploadFileInput({
  name,
  fileInputRef,
  mimeTypes,
  multiple,
  disabled,
  stopClickPropagation,
  onFileChange,
}: UploadFileInputProps) {
  return (
    <form>
      <input
        ref={fileInputRef}
        accept={mimeTypes?.join(',')}
        disabled={disabled}
        hidden={true}
        multiple={multiple}
        name={name}
        type="file"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (files.length > 0) {
            onFileChange?.(files)
          }
        }}
        onClick={stopClickPropagation ? (e) => e.stopPropagation() : undefined}
      />
    </form>
  )
}

export interface FileInputRefTunnel {
  fileInputRef: FileInputRef

  onFileInputRef: React.Ref<HTMLInputElement>
}

export function useFileInputRefTunnel(target?: FileInputRef | ((ref: FileInputRef) => void)): FileInputRefTunnel {
  const localRef = React.useRef<HTMLInputElement | null>(null)

  const onFileInputRef = React.useCallback(
    (element: HTMLInputElement | null) => {
      localRef.current = element
      if (typeof target === 'function') {
        target(localRef)
      }
    },
    [target],
  )

  if (target && typeof target !== 'function') {
    return { fileInputRef: target, onFileInputRef: target }
  }
  return { fileInputRef: localRef, onFileInputRef }
}

export function UploadingPanel({ progress }: { progress?: number }) {
  return (
    <div className="h-full border border-transparent">
      <div className="border-grey/20 bg-grey-50 dark:bg-grey-900 relative flex h-full items-center justify-center border before:pb-[12.5%]">
        <div className="flex w-full items-center justify-center overflow-hidden">
          <ProgressBar style={uploadProgressStyle(progress)} />
        </div>
      </div>
    </div>
  )
}

export interface UploadingOverlayProps {
  progress?: number
  dataTestId?: string

  bgStyle?: 'transparent' | 'default'

  className?: string
}

export function UploadingOverlay({ progress, dataTestId, bgStyle = 'default', className }: UploadingOverlayProps) {
  return (
    <div
      className={cx(
        'absolute inset-0 flex min-w-full items-center justify-center overflow-hidden',
        className ?? 'bg-white/50',
      )}
      data-testid={dataTestId}
    >
      <ProgressBar bgStyle={bgStyle} style={uploadProgressStyle(progress)} />
    </div>
  )
}

export interface UploadPlaceholderProps {
  icon: PlaceholderIconName
  desc: string
  size: MediaPlaceholderSize

  inputName: string
  onFileChange: (files: File[]) => void
  mimeTypes?: string[]
  isUploading?: boolean
  progress?: number
  errors?: Error[] | { message?: string }[]
  dragHandler?: DragHandlerLike
  errorDataTestId?: string
  fileInputRef?: FileInputRef

  stopClickPropagation?: boolean
}

export function UploadPlaceholder({
  icon,
  desc,
  size,
  inputName,
  onFileChange,
  mimeTypes,
  isUploading,
  progress,
  errors,
  dragHandler,
  errorDataTestId,
  fileInputRef: parentFileInputRef,
  stopClickPropagation,
}: UploadPlaceholderProps) {
  const { fileInputRef, onFileInputRef } = useFileInputRefTunnel(parentFileInputRef)

  if (isUploading) {
    return <UploadingPanel progress={progress} />
  }

  return (
    <>
      <MediaPlaceholder
        desc={desc}
        errorDataTestId={errorDataTestId}
        errors={errors}
        filePicker={() => fileInputRef.current?.click()}
        icon={icon}
        isDraggedOver={dragHandler?.isDraggedOver}
        placeholderRef={dragHandler?.setRef}
        size={size}
      />
      <UploadFileInput
        fileInputRef={onFileInputRef}
        mimeTypes={mimeTypes}
        name={inputName}
        stopClickPropagation={stopClickPropagation}
        onFileChange={onFileChange}
      />
    </>
  )
}
