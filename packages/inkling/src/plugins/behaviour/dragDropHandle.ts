import type { DragDropHandler } from '@/utils/draggable/DragDropHandler'

import { createComposerHandle, type ComposerHandle } from './composer-handle'

// Editor-side handle for the per-top-level-composer drag-drop channel
// (plan 047), built on the composer handle factory. Owns the DragDropHandler
// instance, the editor container element, and the isDragging flag so card
// drag hooks and card chrome read them synchronously instead of relying on a
// context value mutated by DragDropReorderPlugin and on mount order. Fed at
// mount by InklingComposableEditor (containerElement) and
// DragDropReorderPlugin (handler); the isDragging truth is published by the
// handler itself through its onDraggingChange port. React subscribes
// render-only via useDragDropHandleState. One instance per top-level composer
// (created in InklingComposer) — nested composers share the top-level
// handle, exactly as the shared context value worked before.

export interface DragDropHandleState {
  containerElement: HTMLElement | null
  handler: DragDropHandler | null
  isDragging: boolean
}

export type DragDropHandle = ComposerHandle<DragDropHandleState>

export function createDragDropHandle(): DragDropHandle {
  return createComposerHandle<DragDropHandleState>({ containerElement: null, handler: null, isDragging: false })
}
