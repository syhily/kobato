import type { FileUploader } from '@kobato/inkling'
import type { I18nValue } from '@kobato/ui/lib/I18nProvider'

import { orpc } from '@kobato/api/browser/client'
import { STORAGE_ROUTE_PREFIX } from '@kobato/assets/asset-url'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useMemo } from 'react'
import { toast } from 'sonner'

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']

async function uploadImageFiles(
  files: FileList | File[],
  t: I18nValue['t'],
): Promise<Array<{ url?: string; fileName?: string }> | undefined> {
  const uploaded: Array<{ url: string; fileName: string }> = []
  for (const file of Array.from(files)) {
    try {
      const { image } = await orpc.admin.images.upload({ file, metadata: { kind: 'generic' } })
      uploaded.push({ url: `${STORAGE_ROUTE_PREFIX}${image.storagePath}`, fileName: file.name })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('admin.editor.upload.failed'))
      return undefined
    }
  }
  return uploaded
}

export const pageEditorFileUploader: FileUploader = {
  useFileUpload: () => {
    const { t } = useI18n()
    const upload = useMemo(() => (files: FileList | File[]) => uploadImageFiles(files, t), [t])
    return { upload }
  },
  fileTypes: {
    image: { mimeTypes: IMAGE_MIME_TYPES },
  },
}
