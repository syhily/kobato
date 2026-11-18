import type { FileUploaderLike } from '@kobato/inkling-internal/components/ui/cards/card-ui-types'
import type { UseFileDragAndDropResult } from '@kobato/inkling-internal/hooks/useFileDragAndDrop'

import { vi } from 'vitest'

// Shared stand-ins for the card UI's uploader/drag-handler props. `errors` is
// intentionally omitted: consumers treat undefined and [] alike.
export function createUploader(overrides: Partial<FileUploaderLike> = {}): FileUploaderLike {
  return { isLoading: false, upload: async () => undefined, ...overrides }
}

export function createDragHandler(overrides: Partial<UseFileDragAndDropResult> = {}): UseFileDragAndDropResult {
  return { isDraggedOver: false, setRef: vi.fn(), ...overrides }
}
