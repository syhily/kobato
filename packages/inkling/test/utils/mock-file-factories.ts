import { vi } from 'vitest'

import type { FileUploaderLike } from '@/components/ui/cards/card-ui-types'
import type { UseFileDragAndDropResult } from '@/hooks/useFileDragAndDrop'

// Shared stand-ins for the card UI's uploader/drag-handler props, previously
// copy-pasted into the Audio/File/Header/Image/Video card tests. The
// VideoCard/HeaderCard locals also seeded `errors: []` — dropped here because
// every consumer treats undefined and [] alike (MediaPlaceholder defaults
// `errors = []` and only renders when `errors.length > 0`; AudioCard guards
// `errors && errors.length > 0`).
export function createUploader(overrides: Partial<FileUploaderLike> = {}): FileUploaderLike {
  return { isLoading: false, upload: async () => undefined, ...overrides }
}

export function createDragHandler(overrides: Partial<UseFileDragAndDropResult> = {}): UseFileDragAndDropResult {
  return { isDraggedOver: false, setRef: vi.fn(), ...overrides }
}
