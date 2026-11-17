import { createComposerHandleBinding } from '../plugins/behaviour/composer-handle'
import { createWordCountHandle, type WordCountHandleState } from '../plugins/behaviour/wordCountHandle'

// Per-composer word-count handle; nested composers share the top-level one.
export const {
  Context: WordCountHandleContext,
  useHandle: useWordCountHandle,
  useHandleState: useWordCountHandleState,
} = createComposerHandleBinding<WordCountHandleState>(createWordCountHandle)
