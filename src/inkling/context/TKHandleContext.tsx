import { createComposerHandleBinding } from '@/inkling/plugins/behaviour/composer-handle'
import { createTKHandle, type TKHandle, type TKHandleState } from '@/inkling/plugins/behaviour/tkHandle'

// Per-composer tk handle; nested composers share the top-level one.
export const {
  Context: TKHandleContext,
  useHandle: useTKHandle,
  useHandleState: useTKHandleState,
} = createComposerHandleBinding<TKHandleState, TKHandle>(createTKHandle)
