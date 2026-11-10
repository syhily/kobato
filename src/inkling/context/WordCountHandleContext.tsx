import { createComposerHandleBinding } from '@/inkling/plugins/behaviour/composer-handle'
import { createWordCountHandle, type WordCountHandleState } from '@/inkling/plugins/behaviour/wordCountHandle'

// Per-composer word-count handle; nested composers share the top-level one.
export const {
  Context: WordCountHandleContext,
  useHandle: useWordCountHandle,
  useHandleState: useWordCountHandleState,
} = createComposerHandleBinding<WordCountHandleState>(createWordCountHandle)
