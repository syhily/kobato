import { createComposerHandleBinding } from '@/plugins/behaviour/composer-handle'
import { createDragDropHandle, type DragDropHandleState } from '@/plugins/behaviour/dragDropHandle'

// Internal context carrying the per-composer drag-drop handle (plan 047).
// InklingComposer creates one instance per top-level composer and exposes it
// here. The default is a fallback for consumers rendered outside any provider
// (e.g. isolated hook tests); real editors always get the provider's
// instance, so composers never share drag-drop state through this default.
export const {
  Context: DragDropHandleContext,
  useHandle: useDragDropHandle,
  useHandleState: useDragDropHandleState,
} = createComposerHandleBinding<DragDropHandleState>(createDragDropHandle)
