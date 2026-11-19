import type {
  CardConfig,
  FileUploader,
  InklingHostIntegrationContextValue,
} from '@kobato/inkling-internal/context/InklingHostIntegrationContext'

import { vi } from 'vitest'

type UploadKind = Parameters<FileUploader['useFileUpload']>[0]
type UploadChannel = ReturnType<FileUploader['useFileUpload']>

// Options for the per-test host-integration fixture. Whole values feed the
// InklingHostIntegrationProvider facade, which fans them out into the
// per-lifecycle channels. UI prefs (darkMode, labels) live on
// InklingUiPrefsContext, never here.
export interface HostIntegrationValueOptions {
  upload?: UploadChannel['upload']
  uploads?: Partial<Record<UploadKind, Partial<UploadChannel>>>
  isLoading?: boolean
  errors?: Error[]
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
      useFileUpload: (kind) => ({ ...defaultChannel, ...uploads[kind] }),
      ...(fileTypes ? { fileTypes } : {}),
    },
    cardConfig,
    onError,
    ...(dragScrollContainerSelector ? { dragScrollContainerSelector } : {}),
  }
}
