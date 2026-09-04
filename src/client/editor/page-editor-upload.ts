// The composer `fileUploader` slot (plan M3, 二核): inkling routes paste,
// file-drop, and the image card's file dialog through `useFileUpload`, so
// wiring kobato's image pipeline here turns paste/drop illustration into a
// feature the tiptap editor never had. Only the 'image' channel exists —
// no other media card is registered in the page editor's node set.
//
// Identity contract: the composer requires `useFileUpload` (and the returned
// `upload`) to stay identity-stable for the editor's lifetime, so both live
// at module scope.
//
// Known shape limit: `UploadResultItem` carries only `{ url, fileName }`, so
// upload-inserted images persist src/width/height (inkling extracts the
// dimensions from the File) but NOT thumbhash/storagePath/imageId — the
// library pick path carries all four. The url is the site-owned
// `/storage/<key>` form, matching what the save-time sync writes for
// library-referenced images.

import type { FileUploader } from '@inkling/editor'

import { toast } from 'sonner'

import { orpc } from '@/client/api/client'
import { STORAGE_ROUTE_PREFIX } from '@/shared/types/asset-url'

// Mirrors the server's ALLOWED_IMAGE_MIME_TYPES
// (src/server/domains/images/services/upload.ts) — a picker hint only; the
// server re-validates authoritatively.
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']

async function uploadImageFiles(
  files: FileList | File[],
): Promise<Array<{ url?: string; fileName?: string }> | undefined> {
  const uploaded: Array<{ url: string; fileName: string }> = []
  for (const file of Array.from(files)) {
    try {
      const { image } = await orpc.admin.images.upload({ file, metadata: { kind: 'generic' } })
      uploaded.push({ url: `${STORAGE_ROUTE_PREFIX}${image.storagePath}`, fileName: file.name })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '图片上传失败')
      return undefined
    }
  }
  return uploaded
}

export const pageEditorFileUploader: FileUploader = {
  useFileUpload: () => ({ upload: uploadImageFiles }),
  fileTypes: {
    image: { mimeTypes: IMAGE_MIME_TYPES },
  },
}
