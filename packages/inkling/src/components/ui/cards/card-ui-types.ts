import type { RefObject } from 'react'

import type { FileUploader } from '@/context/InklingHostIntegrationContext'
import type { UseFileDragAndDropResult } from '@/hooks/useFileDragAndDrop'
import type { UseGalleryReorderResult } from '@/hooks/useGalleryReorder'

/**
 * The structural types shared by the card UI (CONTEXT.md: "card"), aliased
 * from the hooks and context that own the truth rather than re-declared per
 * card. Previously these lived in AudioCard.tsx and were copied with shape
 * drift (`setRef` optional here, required there, an `upload`-less uploader)
 * into FileNodeComponent, GalleryNodeComponent, and GalleryCard.
 */

/** The `useFileDragAndDrop` result a card receives as its drag handler. */
export type DragHandlerLike = UseFileDragAndDropResult

/** The `useGalleryReorder` result the gallery card receives as its reorder handler. */
export type ReorderHandlerLike = UseGalleryReorderResult

/**
 * One `fileUploader.useFileUpload(type)` result; `progress` is provided only
 * by some hosts. `errors` is widened from the context's `Error[]` to the
 * message-only shape — typecheck proved hosts and story fixtures pass plain
 * `{ message }` objects (plan 044's recorded widening; `Error` is
 * structurally assignable to `{ message?: string }`, so real hook results
 * still fit).
 */
export type FileUploaderLike = Omit<ReturnType<FileUploader['useFileUpload']>, 'errors'> & {
  progress?: number
  errors?: Array<{ message?: string }>
}

export type FileInputRef = RefObject<HTMLInputElement | null>
