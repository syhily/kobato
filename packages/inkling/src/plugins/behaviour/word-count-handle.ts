import type { LexicalEditor } from 'lexical'

import { createComposerHandle, type ComposerHandle } from '@kobato/inkling-internal/plugins/behaviour/composer-handle'
import { isNestedEditor } from '@kobato/inkling-internal/utils/lexical-internals'

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
    return () => undefined
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
