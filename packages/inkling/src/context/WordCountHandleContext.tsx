import { createComposerHandleBinding } from '@/plugins/behaviour/composer-handle'
import { createWordCountHandle, type WordCountHandleState } from '@/plugins/behaviour/wordCountHandle'

// Internal context carrying the per-composer word-count handle (plan 047).
// InklingComposer creates one instance per top-level composer and exposes it
// here. The default is a fallback for consumers rendered outside any provider
// (e.g. isolated hook tests); real editors always get the provider's
// instance, so composers never share word-count state through this default.
export const {
  Context: WordCountHandleContext,
  useHandle: useWordCountHandle,
  useHandleState: useWordCountHandleState,
} = createComposerHandleBinding<WordCountHandleState>(createWordCountHandle)
