import { createComposerHandleBinding } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'
import {
  createFootnoteHandle,
  type FootnoteHandle,
  type FootnoteHandleState,
} from '@kobato/inkling-internal/plugins/behaviour/footnote-handle'

export const {
  Context: FootnoteHandleContext,
  useHandle: useFootnoteHandle,
  useHandleState: useFootnoteHandleState,
} = createComposerHandleBinding<FootnoteHandleState, FootnoteHandle>(createFootnoteHandle)
