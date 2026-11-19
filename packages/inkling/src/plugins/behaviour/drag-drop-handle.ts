import type { DragDropHandler } from '@kobato/inkling-internal/utils/draggable/DragDropHandler'

import { createComposerHandle, type ComposerHandle } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'

export interface DragDropHandleState {
  containerElement: HTMLElement | null
  handler: DragDropHandler | null
  isDragging: boolean
}
export type DragDropHandle = ComposerHandle<DragDropHandleState>
export function createDragDropHandle(): DragDropHandle {
  return createComposerHandle<DragDropHandleState>({ containerElement: null, handler: null, isDragging: false })
}
