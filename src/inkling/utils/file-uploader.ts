// Normalization for the public `<InklingComposer fileUploader>` prop, which accepts legacy
// bags: a missing `useFileUpload` hook degrades to the erroring fallback hook, and
// `fileTypes` entries forward only when they match `{ mimeTypes: string[] }` per media type
// (anything else degrades to "no restriction").

import type { FileUploader, FileUploaderInput } from '@/inkling/context/InklingHostIntegrationContext'

const MEDIA_KEYS = ['image', 'video', 'audio', 'file'] as const

function hasFileUploadHook(
  fileUploader: FileUploaderInput,
): fileUploader is FileUploaderInput & Pick<FileUploader, 'useFileUpload'> {
  return 'useFileUpload' in fileUploader && typeof fileUploader.useFileUpload === 'function'
}

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
