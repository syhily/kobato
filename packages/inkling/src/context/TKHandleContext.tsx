import { createComposerHandleBinding } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'
import { createTKHandle, type TKHandle, type TKHandleState } from '@kobato/inkling-internal/plugins/behaviour/tk-handle'

// Per-composer tk handle; nested composers share the top-level one.
export const {
  Context: TKHandleContext,
  useHandle: useTKHandle,
  useHandleState: useTKHandleState,
} = createComposerHandleBinding<TKHandleState, TKHandle>(createTKHandle)
