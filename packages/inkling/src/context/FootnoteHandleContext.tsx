import { createComposerHandleBinding } from '@/plugins/behaviour/composer-handle'
import { createFootnoteHandle, type FootnoteHandle, type FootnoteHandleState } from '@/plugins/behaviour/footnoteHandle'

// Internal context carrying the per-composer footnote handle. InklingComposer
// creates one instance per top-level composer and exposes it here. The default
// is a fallback for consumers rendered outside any provider (e.g. isolated
// plugin tests); real editors always get the provider's instance, so composers
// never share footnote state through this default. The handle subtype is
// passed explicitly so useFootnoteHandle keeps the publish/request methods —
// TS skips inferring it once the state type argument is given.
export const {
  Context: FootnoteHandleContext,
  useHandle: useFootnoteHandle,
  useHandleState: useFootnoteHandleState,
} = createComposerHandleBinding<FootnoteHandleState, FootnoteHandle>(createFootnoteHandle)
