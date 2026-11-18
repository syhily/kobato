import { createComposerHandleBinding } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'
import {
  createFootnoteHandle,
  type FootnoteHandle,
  type FootnoteHandleState,
} from '@kobato/inkling-internal/plugins/behaviour/footnoteHandle'

// Per-composer footnote handle; nested composers share the top-level one.
export const {
  Context: FootnoteHandleContext,
  useHandle: useFootnoteHandle,
  useHandleState: useFootnoteHandleState,
} = createComposerHandleBinding<FootnoteHandleState, FootnoteHandle>(createFootnoteHandle)
