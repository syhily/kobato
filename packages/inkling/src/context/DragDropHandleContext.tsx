import { createComposerHandleBinding } from '../plugins/behaviour/composer-handle'
import { createDragDropHandle, type DragDropHandleState } from '../plugins/behaviour/dragDropHandle'

// Per-composer drag-drop handle; nested composers share the top-level one.
export const {
  Context: DragDropHandleContext,
  useHandle: useDragDropHandle,
  useHandleState: useDragDropHandleState,
} = createComposerHandleBinding<DragDropHandleState>(createDragDropHandle)
