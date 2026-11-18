import { createComposerHandleBinding } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'
import {
  createWordCountHandle,
  type WordCountHandleState,
} from '@kobato/inkling-internal/plugins/behaviour/wordCountHandle'

// Per-composer word-count handle; nested composers share the top-level one.
export const {
  Context: WordCountHandleContext,
  useHandle: useWordCountHandle,
  useHandleState: useWordCountHandleState,
} = createComposerHandleBinding<WordCountHandleState>(createWordCountHandle)
