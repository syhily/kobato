import { createComposerHandleBinding } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'
import {
  createWordCountHandle,
  type WordCountHandleState,
} from '@kobato/inkling-internal/plugins/behaviour/word-count-handle'

export const {
  Context: WordCountHandleContext,
  useHandle: useWordCountHandle,
  useHandleState: useWordCountHandleState,
} = createComposerHandleBinding<WordCountHandleState>(createWordCountHandle)
