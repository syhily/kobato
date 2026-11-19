import type { FileUploaderLike } from '@kobato/inkling-internal/components/ui/cards/card-ui-types'
import type { UseFileDragAndDropResult } from '@kobato/inkling-internal/hooks/useFileDragAndDrop'

import { vi } from 'vitest'

export function createUploader(overrides: Partial<FileUploaderLike> = {}): FileUploaderLike {
  return { isLoading: false, upload: async () => undefined, ...overrides }
}

export function createDragHandler(overrides: Partial<UseFileDragAndDropResult> = {}): UseFileDragAndDropResult {
  return { isDraggedOver: false, setRef: vi.fn(), ...overrides }
}
