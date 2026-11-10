import { vi } from 'vitest'

import type {
  CardConfig,
  FileUploader,
  InklingHostIntegrationContextValue,
} from '@/inkling/context/InklingHostIntegrationContext'

type UploadKind = Parameters<FileUploader['useFileUpload']>[0]
type UploadChannel = ReturnType<FileUploader['useFileUpload']>

// Options for the per-test host-integration fixture. Whole values feed the
// InklingHostIntegrationProvider facade, which fans them out into the
// per-lifecycle channels. UI prefs (darkMode, labels) live on
// InklingUiPrefsContext, never here.
export interface HostIntegrationValueOptions {
  /** one upload fn applied to every kind; a per-kind `uploads` entry wins */
  upload?: UploadChannel['upload']
  /** per-kind upload channels (image/audio/video/file/mediaThumbnail), merged over the default channel */
  uploads?: Partial<Record<UploadKind, Partial<UploadChannel>>>
  isLoading?: boolean
  errors?: Error[]
  /** per-kind mime-type constraints, forwarded as `fileUploader.fileTypes` */
  fileTypes?: FileUploader['fileTypes']
  cardConfig?: CardConfig
  onError?: InklingHostIntegrationContextValue['onError']
  dragScrollContainerSelector?: string
}

export function createHostIntegrationValue({
  upload,
  uploads = {},
  isLoading = false,
  errors = [],
  fileTypes,
  cardConfig = {},
  onError = vi.fn(),
  dragScrollContainerSelector,
}: HostIntegrationValueOptions = {}): InklingHostIntegrationContextValue {
  const defaultChannel: UploadChannel = {
    isLoading,
    upload: upload ?? vi.fn(() => Promise.resolve(undefined)),
    errors,
  }
  return {
    fileUploader: {
      // identity-stable per value — the composer contract requires the same
      // hook fn for the editor's lifetime (src/inkling/hooks/useMediaCardUpload.ts)
      useFileUpload: (kind) => ({ ...defaultChannel, ...uploads[kind] }),
      ...(fileTypes ? { fileTypes } : {}),
    },
    cardConfig,
    onError,
    ...(dragScrollContainerSelector ? { dragScrollContainerSelector } : {}),
  }
}
