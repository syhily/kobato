import type { LexicalEditor } from 'lexical'

import { createComposerHandle, type ComposerHandle } from '@/inkling/plugins/behaviour/composer-handle'
import { isNestedEditor } from '@/inkling/utils/lexical-internals'

// Editor-side handle for the per-top-level-composer word-count channel, built on the
// composer handle factory. Owns the callbacks handed to the top-level WordCountPlugin
// so nested composers mount their own WordCountPlugin with the same callbacks.
// `language` rides alongside so nested editors count with the top-level plugin's
// language instead of dropping it; `null` means the host named no language and the
// nested counter keeps Inkling's regex fallback. `onSelectionChange` is an independent
// optional channel: a selection-only plugin publishes only that callback, so nested
// composers mount a selection-only counter and pay for no document pass.
//
// Publishing is ownership-based per channel (onChange, onSelectionChange, language):
// every publish pushes an entry onto that channel's stack, and a cleanup removes its own
// token from wherever it sits, then republishes the new top. Channels never clear each
// other, a same-channel replacement restores a still-mounted predecessor on teardown,
// and an unmounted publisher cannot be resurrected. `language: null` is "no opinion" and
// is not published, so a selection-only plugin cannot clear another's language.

export interface WordCountHandleState {
  onChange: ((count: number) => void) | null
  onSelectionChange: ((count: number | null) => void) | null
  language: string | null
}

export type WordCountHandle = ComposerHandle<WordCountHandleState>

interface PublishedEntry<T> {
  token: object
  value: T
}

interface WordCountPublisherState {
  onChange: PublishedEntry<(count: number) => void>[]
  onSelectionChange: PublishedEntry<(count: number | null) => void>[]
  language: PublishedEntry<string>[]
}

// Per-handle ownership stacks, keyed by the handle instance so multiple composers on one
// page cannot share publisher state and a discarded handle stays collectable.
const publisherStates = new WeakMap<WordCountHandle, WordCountPublisherState>()

function getPublisherState(handle: WordCountHandle): WordCountPublisherState {
  let state = publisherStates.get(handle)
  if (!state) {
    state = { onChange: [], onSelectionChange: [], language: [] }
    publisherStates.set(handle, state)
  }
  return state
}

function publishEntry<T>(handle: WordCountHandle, stack: PublishedEntry<T>[], value: T): () => void {
  const token = {}
  stack.push({ token, value })
  syncHandle(handle)

  return () => {
    // Remove from wherever it sits, not just the top: unmount must never leave a
    // callback behind to be resurrected later.
    const index = stack.findIndex((entry) => entry.token === token)
    if (index === -1) {
      return
    }
    stack.splice(index, 1)
    syncHandle(handle)
  }
}

function syncHandle(handle: WordCountHandle) {
  const state = getPublisherState(handle)
  handle.setState({
    onChange: state.onChange.at(-1)?.value ?? null,
    onSelectionChange: state.onSelectionChange.at(-1)?.value ?? null,
    language: state.language.at(-1)?.value ?? null,
  })
}

export function createWordCountHandle(): WordCountHandle {
  return createComposerHandle<WordCountHandleState>({ onChange: null, onSelectionChange: null, language: null })
}

/**
 * The top-level-only publish gate: a top-level editor's callbacks ride the handle so
 * nested composers mount their own WordCountPlugin with them; nested editors never
 * publish. Either callback may be absent. Returns the unpublish teardown, which restores
 * this publisher's predecessor on each channel it owns.
 */
export function publishWordCountCallback(
  handle: WordCountHandle,
  editor: LexicalEditor,
  {
    onChange,
    onSelectionChange,
    language,
  }: {
    onChange?: (count: number) => void
    onSelectionChange?: (count: number | null) => void
    language: string | null
  },
): () => void {
  if (isNestedEditor(editor)) {
    return () => {
      /* noop — nested editors never publish */
    }
  }

  const state = getPublisherState(handle)
  const cleanups: Array<() => void> = []

  if (onChange) {
    cleanups.push(publishEntry(handle, state.onChange, onChange))
  }
  if (onSelectionChange) {
    cleanups.push(publishEntry(handle, state.onSelectionChange, onSelectionChange))
  }
  if (language !== null) {
    cleanups.push(publishEntry(handle, state.language, language))
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup()
    }
  }
}
