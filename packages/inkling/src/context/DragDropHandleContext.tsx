import { createComposerHandleBinding } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'
import {
  createDragDropHandle,
  type DragDropHandleState,
} from '@kobato/inkling-internal/plugins/behaviour/drag-drop-handle'

// Per-composer drag-drop handle; nested composers share the top-level one.
export const {
  Context: DragDropHandleContext,
  useHandle: useDragDropHandle,
  useHandleState: useDragDropHandleState,
} = createComposerHandleBinding<DragDropHandleState>(createDragDropHandle)
