import { createComposerHandleBinding } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'
import { createTKHandle, type TKHandle, type TKHandleState } from '@kobato/inkling-internal/plugins/behaviour/tk-handle'

export const {
  Context: TKHandleContext,
  useHandle: useTKHandle,
  useHandleState: useTKHandleState,
} = createComposerHandleBinding<TKHandleState, TKHandle>(createTKHandle)
