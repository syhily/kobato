/**
 * The file-uploader normalization (CONTEXT.md "host config"): the public
 * `<InklingComposer fileUploader>` prop accepts legacy bags
 * (`FileUploaderInput` — a full uploader, a partial one, or any object), so
 * the degradation policy lives here as a headless module with a synchronous
 * test table instead of inside the composer component:
 *
 * - a missing `useFileUpload` hook degrades to the erroring fallback hook
 *   (uploads no-op and the console names the missing prop);
 * - `fileTypes` entries are forwarded only when their shape matches what the
 *   consumers actually read (`{ mimeTypes: string[] }` per media type —
 *   unknown media keys are dropped, malformed entries skipped); anything
 *   else degrades to "no restriction", which is what the optional-chaining
 *   reads in the node components already fall back to.
 *
 * The composer keeps one line: `useMemo(() => normalizeFileUploader(fileUploader), [fileUploader])`.
 */

import type { FileUploader, FileUploaderInput } from '@/context/InklingHostIntegrationContext'

const MEDIA_KEYS = ['image', 'video', 'audio', 'file'] as const

function hasFileUploadHook(
  fileUploader: FileUploaderInput,
): fileUploader is FileUploaderInput & Pick<FileUploader, 'useFileUpload'> {
  return 'useFileUpload' in fileUploader && typeof fileUploader.useFileUpload === 'function'
}

/** The one entry shape the consumers read (`{ mimeTypes: string[] }`); anything else degrades to "no restriction". */
function readMimeTypes(entry: unknown): string[] | null {
  if (typeof entry !== 'object' || entry === null || !('mimeTypes' in entry)) {
    return null
  }
  const mimeTypes: unknown = entry.mimeTypes
  if (!Array.isArray(mimeTypes) || !mimeTypes.every((mimeType) => typeof mimeType === 'string')) {
    return null
  }
  return mimeTypes
}

function readFileTypes(fileUploader: FileUploaderInput): FileUploader['fileTypes'] {
  if (!('fileTypes' in fileUploader)) {
    return undefined
  }
  const value: unknown = fileUploader.fileTypes
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  // unknown media keys degrade away by never being read
  const fileTypes: NonNullable<FileUploader['fileTypes']> = {}
  for (const media of MEDIA_KEYS) {
    const entry: unknown = Object.getOwnPropertyDescriptor(value, media)?.value
    const mimeTypes = readMimeTypes(entry)
    if (mimeTypes) {
      fileTypes[media] = { mimeTypes }
    }
  }
  return fileTypes
}

/** Normalizes the public `fileUploader` prop into the closed `FileUploader` the context publishes. */
export function normalizeFileUploader(fileUploader: FileUploaderInput): FileUploader {
  const fileTypes = readFileTypes(fileUploader)
  const useFileUpload = hasFileUploadHook(fileUploader)
    ? fileUploader.useFileUpload
    : (): ReturnType<FileUploader['useFileUpload']> => {
        console.error(
          '<InklingComposer> requires a `fileUploader` prop object to be passed containing a `useFileUpload` custom hook',
        )
        return { upload: () => Promise.resolve(undefined) }
      }
  return fileTypes === undefined ? { useFileUpload } : { useFileUpload, fileTypes }
}
