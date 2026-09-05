import { createComposerHandleBinding } from '@/plugins/behaviour/composer-handle'
import { createTKHandle, type TKHandle, type TKHandleState } from '@/plugins/behaviour/tkHandle'

// Internal context carrying the per-composer tk handle. InklingComposer
// creates one instance per top-level composer and exposes it here. The default
// is a fallback for consumers rendered outside any provider (e.g. isolated
// plugin tests); real editors always get the provider's instance, so composers
// never share tk state through this default. The handle subtype is passed
// explicitly so useTKHandle keeps the tk mutation methods — TS skips
// inference for it once the state type argument is given.
export const {
  Context: TKHandleContext,
  useHandle: useTKHandle,
  useHandleState: useTKHandleState,
} = createComposerHandleBinding<TKHandleState, TKHandle>(createTKHandle)
