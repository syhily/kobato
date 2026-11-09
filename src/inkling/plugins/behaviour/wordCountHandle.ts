import type { LexicalEditor } from 'lexical'

import { createComposerHandle, type ComposerHandle } from '@/inkling/plugins/behaviour/composer-handle'
import { isNestedEditor } from '@/inkling/utils/lexical-internals'

// Editor-side handle for the per-top-level-composer word-count channel
// (plan 047), built on the composer handle factory. Owns the callbacks handed
// to the top-level WordCountPlugin so nested composers can mount their own
// WordCountPlugin with the same callbacks — replacing the shared context ref
// that InklingNestedComposer read once at render time.
// `language` rides alongside so nested editors count with the top-level
// plugin's language instead of silently dropping it; `null` means the host
// named no language and the nested counter keeps Inkling's regex fallback.
// `onSelectionChange` joins `onChange` as an optional channel: a selection-only
// plugin publishes only that callback, and nested composers then mount a
// selection-only counter too (no full-document counting is paid for).
//
// Publishing is ownership-based per channel (onChange, onSelectionChange,
// language): every publish pushes an entry onto that channel's stack, and a
// cleanup removes its own token from wherever it sits, then republishes the
// new top. Independent channels therefore never clear each other,
// same-channel replacement restores a still-mounted predecessor on teardown,
// and an unmounted publisher can never be resurrected:
// A→B→A-cleanup→B-cleanup ends null, while A→B→B-cleanup→A-cleanup restores
// A in between and ends null. `language: null` is "no opinion" and is not
// published, so a selection-only plugin cannot clear another plugin's
// language.
// Fed at mount by the top-level WordCountPlugin; React subscribes render-only
// via useWordCountCallback. One instance per top-level composer (created in
// InklingComposer) — nested composers share the top-level handle, exactly as
// the shared ref worked before.

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

// Per-handle ownership stacks, keyed by the handle instance so multiple
// composers on one page cannot share publisher state and a discarded handle
// is collectable.
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
    // remove this entry from wherever it sits: an older publisher may own a
    // stack slot beneath a newer one, and unmount must never leave its
    // callback behind to be resurrected later
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
 * The top-level-only publish gate, one home (previously typed at both the
 * plugin's mount and cleanup): a top-level editor's callbacks ride the handle
 * so nested composers mount their own WordCountPlugin with them; nested
 * editors never publish. Either callback may be absent — a selection-only
 * publisher never touches the onChange channel. Returns the unpublish teardown,
 * which restores this publisher's predecessor on each channel it owns.
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
