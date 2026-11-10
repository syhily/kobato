import { vi } from 'vitest'

import type { FileUploaderLike } from '@/inkling/components/ui/cards/card-ui-types'
import type { UseFileDragAndDropResult } from '@/inkling/hooks/useFileDragAndDrop'

// Shared stand-ins for the card UI's uploader/drag-handler props. `errors` is
// intentionally omitted: consumers treat undefined and [] alike.
export function createUploader(overrides: Partial<FileUploaderLike> = {}): FileUploaderLike {
  return { isLoading: false, upload: async () => undefined, ...overrides }
}

export function createDragHandler(overrides: Partial<UseFileDragAndDropResult> = {}): UseFileDragAndDropResult {
  return { isDraggedOver: false, setRef: vi.fn(), ...overrides }
}
