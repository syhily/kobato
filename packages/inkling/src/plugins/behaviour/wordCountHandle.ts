import type { LexicalEditor } from 'lexical'

import { isNestedEditor } from '@/utils/lexical-internals'

import { createComposerHandle, type ComposerHandle } from './composer-handle'

// Editor-side handle for the per-top-level-composer word-count channel
// (plan 047), built on the composer handle factory. Owns the onChange
// callback handed to the top-level WordCountPlugin so nested composers can
// mount their own WordCountPlugin with the same callback — replacing the
// shared context ref that InklingNestedComposer read once at render time.
// `language` rides alongside so nested
// editors count with the top-level plugin's language instead of silently
// falling back to 'en'.
// Fed at mount by the top-level WordCountPlugin; React subscribes render-only
// via useWordCountCallback. One instance per top-level composer (created in
// InklingComposer) — nested composers share the top-level handle, exactly as
// the shared ref worked before.

export interface WordCountHandleState {
  onChange: ((count: number) => void) | null
  language: string | null
}

export type WordCountHandle = ComposerHandle<WordCountHandleState>

export function createWordCountHandle(): WordCountHandle {
  return createComposerHandle<WordCountHandleState>({ onChange: null, language: null })
}

/**
 * The top-level-only publish gate, one home (previously typed at both the
 * plugin's mount and cleanup): a top-level editor's onChange rides the
 * handle so nested composers mount their own WordCountPlugin with it;
 * nested editors never publish. Returns the unpublish teardown.
 */
export function publishWordCountCallback(
  handle: WordCountHandle,
  editor: LexicalEditor,
  { onChange, language }: { onChange: (count: number) => void; language: string },
): () => void {
  if (isNestedEditor(editor)) {
    return () => {}
  }
  handle.setState({ onChange, language })
  return () => {
    handle.setState({ onChange: null, language: null })
  }
}
