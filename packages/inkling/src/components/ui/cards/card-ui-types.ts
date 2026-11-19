import type { FileUploader } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import type { UseFileDragAndDropResult } from '@kobato/inkling-internal/hooks/useFileDragAndDrop'
import type { UseGalleryReorderResult } from '@kobato/inkling-internal/hooks/useGalleryReorder'
import type { RefObject } from 'react'

export type DragHandlerLike = UseFileDragAndDropResult

export type ReorderHandlerLike = UseGalleryReorderResult

export type FileUploaderLike = Omit<ReturnType<FileUploader['useFileUpload']>, 'errors'> & {
  progress?: number
  errors?: Array<{ message?: string }>
}
export type FileInputRef = RefObject<HTMLInputElement | null>
