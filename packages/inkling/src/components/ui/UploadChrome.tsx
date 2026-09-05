import React from 'react'

import type { DragHandlerLike, FileInputRef } from '@/components/ui/cards/card-ui-types'
import type { MediaPlaceholderSize, PlaceholderIconName } from '@/components/ui/MediaPlaceholder'

import { MediaPlaceholder } from '@/components/ui/MediaPlaceholder'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cx } from '@/utils/cx'

/**
 * Upload chrome — the visual half of the media cards' upload UI (the headless
 * flow is "upload intent", src/nodes/upload-intent.ts; this module never
 * touches it). It owns the pieces that were copy-pasted across AudioCard,
 * FileCard, ImageCard, VideoCard, GalleryCard, and MediaUploader: the
 * empty↔uploading swap (UploadPlaceholder), the hidden file input
 * (UploadFileInput), the progress-width rule (uploadProgressStyle — the only
 * `toFixed(0)` left), the two uploading indicators (UploadingPanel for the
 * empty state, UploadingOverlay for the populated one), and the
 * file-input-ref tunnelling (useFileInputRefTunnel). Per-card variance —
 * icon, description, input name, mimeTypes, overlay track, and the input's
 * click propagation (see UploadFileInputProps.stopClickPropagation) — arrives
 * as data, never as a copied skeleton.
 */

/** The one progress-width rule: whole-percent width, 0 when the host does not report progress. */
export function uploadProgressStyle(progress?: number): React.CSSProperties {
  return { width: `${progress?.toFixed(0) ?? '0'}%` }
}

export interface UploadFileInputProps {
  /** The input's `name` — a DOM contract unit tests and e2e query (`input[name="…"]`). */
  name: string
  fileInputRef?: React.Ref<HTMLInputElement>
  /** Rendered as the input's `accept` (joined with ','); the attribute is omitted when undefined. */
  mimeTypes?: string[]
  multiple?: boolean
  disabled?: boolean
  /**
   * Whether clicks on the input stop propagating. Load-bearing per-card data,
   * not a cosmetic: the media cards with an edit mode (audio, file, video —
   * `hasEditMode() === true`, no `openInEditMode` on their insert spec) enter
   * edit mode on insert BECAUSE the triggerFileDialog click on this input
   * propagates through the editor's CLICK_COMMAND → EDIT_CARD_COMMAND chain;
   * standardizing stopPropagation onto them leaves inserted cards selected
   * but not editing (12 e2e failures). The image card is the inverse —
   * `hasEditMode() === false`, and its legacy ImageUploadForm carried the
   * stopPropagation — so only the ex-ImageUploadForm call sites pass true.
   */
  stopClickPropagation?: boolean
  /** Fires with the picked files — the chrome adapts the DOM event at this boundary, so cards carry files only. */
  onFileChange?: (files: File[]) => void
}

/** The hidden file input every upload affordance binds. */
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
  /** The chrome's own input ref — the file picker clicks this one. */
  fileInputRef: FileInputRef
  /** Ref to hand to UploadFileInput. */
  onFileInputRef: React.Ref<HTMLInputElement>
}

/**
 * The file-input-ref tunnelling: the chrome binds its hidden input to a local
 * ref (so its own filePicker always works) and shares it with the parent
 * channel — either the node component's FileInputRef (which
 * useTriggerFileDialog clicks; it becomes the input's ref directly so parent
 * and chrome read one object, no mirroring mutation) or a callback receiving
 * the local ref object (MediaUploader's setFileInputRef prop, e.g. HeaderCard).
 */
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

/** The empty card's uploading state: a placeholder-shaped panel holding the progress bar. */
export function UploadingPanel({ progress }: { progress?: number }) {
  return (
    <div className="h-full border border-transparent">
      <div className="relative flex h-full items-center justify-center border border-grey/20 bg-grey-50 before:pb-[12.5%] dark:bg-grey-900">
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
  /** Forwarded to the ProgressBar track — 'transparent' where the overlay sits on media. */
  bgStyle?: 'transparent' | 'default'
  /** Overlay background override; defaults to the white wash ('bg-white/50'). */
  className?: string
}

/** The populated card's uploading state: an absolute overlay holding the progress bar. */
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
  /** The hidden input's `name` (see UploadFileInput). */
  inputName: string
  onFileChange: (files: File[]) => void
  mimeTypes?: string[]
  isUploading?: boolean
  progress?: number
  errors?: Error[] | { message?: string }[]
  dragHandler?: DragHandlerLike
  errorDataTestId?: string
  /** The node component's input ref, mirrored by the tunnel. */
  fileInputRef?: FileInputRef
  /** Forwarded to the hidden input (see UploadFileInputProps.stopClickPropagation). */
  stopClickPropagation?: boolean
}

/**
 * The empty card's upload chrome: the empty↔uploading swap (UploadingPanel
 * while isUploading), the MediaPlaceholder whose click opens the hidden
 * UploadFileInput, and the ref tunnelling into the parent's FileInputRef.
 */
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
