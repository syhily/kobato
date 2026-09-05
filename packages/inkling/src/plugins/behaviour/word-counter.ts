import { $getNodeByKey, $getRoot, $isElementNode, $isRootNode, type LexicalEditor, type LexicalNode } from 'lexical'

import { countWords, throttle } from '@/utils'
import { getTopLevelEditor, isNestedEditor } from '@/utils/lexical-internals'

// Headless word counter — the counting engine behind WordCountPlugin. Keeps a
// per-top-level-editor incremental word count: dirty keys from update
// listeners are accumulated and remapped to their root children so a small
// edit in a long document recomputes one block, with a throttled flush and a
// full-recompute fallback for nested editors (which don't receive top-level
// dirty maps). The React adapter is WordCountPlugin (~30 lines): it publishes
// onChange on the word-count handle and mounts this counter. The throttle is
// an injected port so tests drive the engine synchronously instead of
// sleeping on wall-clock timers.

export const WORD_COUNT_THROTTLE_MS = 200

/** A scheduled flush — the shape the engine needs from its throttle port. */
export interface WordCounterThrottled {
  (): void
  cancel: () => void
}

/** Throttle port — tests inject a synchronous implementation. */
export type WordCounterThrottle = (fn: () => void, waitMs: number) => WordCounterThrottled

const defaultThrottle: WordCounterThrottle = (fn, waitMs) => throttle(fn, waitMs)

interface WordCountState {
  nodeWordCounts: Map<string, number>
  lastWordCount: number
}

const editorWordCountStates = new WeakMap<LexicalEditor, WordCountState>()

function getWordCountState(topLevelEditor: LexicalEditor): WordCountState {
  let state = editorWordCountStates.get(topLevelEditor)
  if (!state) {
    state = { nodeWordCounts: new Map<string, number>(), lastWordCount: 0 }
    editorWordCountStates.set(topLevelEditor, state)
  }
  return state
}

function getNodeWordCount(node: LexicalNode, language?: string): number {
  if ($isElementNode(node)) {
    let textContent = ''
    const children = node.getChildren()
    const childrenLength = children.length
    for (let i = 0; i < childrenLength; i++) {
      const child = children[i]
      textContent += child.getTextContent()
      if ($isElementNode(child) && i !== childrenLength - 1 && !child.isInline()) {
        textContent += '\n\n'
      }
    }
    return countWords(textContent, language)
  }

  return countWords(node.getTextContent(), language)
}

function findRootChild(node: LexicalNode): LexicalNode | null {
  let current: LexicalNode | null = node
  while (current && !$isRootNode(current.getParent())) {
    current = current.getParent()
  }
  return current
}

interface CreateWordCounterOptions {
  editor: LexicalEditor
  onChange: (count: number) => void
  language?: string
  throttleMs?: number
  throttleFn?: WordCounterThrottle
}

export function createWordCounter({
  editor,
  onChange,
  language,
  throttleMs = WORD_COUNT_THROTTLE_MS,
  throttleFn = defaultThrottle,
}: CreateWordCounterOptions) {
  let pendingDirtyKeys = new Set<string>()
  let cleanupRegister: (() => void) | null = null

  const emitCount = (count: number) => {
    const topLevelEditor = getTopLevelEditor(editor)
    const state = getWordCountState(topLevelEditor)
    if (count !== state.lastWordCount) {
      state.lastWordCount = count
      onChange(count)
    }
  }

  const countEditorWords = () => {
    const topLevelEditor = getTopLevelEditor(editor)
    const state = getWordCountState(topLevelEditor)

    topLevelEditor.getEditorState().read(() => {
      // NOTE: we can't use RootNode.getTextContent() here because it will
      // return cached text content when there are no dirty nodes which is
      // the case for changes in nested editors

      const rootNode = $getRoot()
      const children = rootNode.getChildren()
      let wordCount = 0

      state.nodeWordCounts.clear()
      for (const child of children) {
        const childCount = getNodeWordCount(child, language)
        state.nodeWordCounts.set(child.getKey(), childCount)
        wordCount += childCount
      }

      state.lastWordCount = wordCount
      onChange(wordCount)
    })
  }

  const flushIncrementalCount = () => {
    if (pendingDirtyKeys.size === 0) {
      return
    }

    const topLevelEditor = getTopLevelEditor(editor)
    const state = getWordCountState(topLevelEditor)
    const keysToRecompute = new Set<string>()

    topLevelEditor.getEditorState().read(() => {
      for (const key of pendingDirtyKeys) {
        const node = $getNodeByKey(key)
        if (!node) {
          continue
        }
        const rootChild = findRootChild(node)
        if (rootChild) {
          keysToRecompute.add(rootChild.getKey())
        }
      }
      pendingDirtyKeys.clear()

      const rootNode = $getRoot()
      const children = rootNode.getChildren()
      const currentKeys = new Set(children.map((child) => child.getKey()))

      let wordCount = state.lastWordCount

      for (const [key, count] of state.nodeWordCounts) {
        if (!currentKeys.has(key)) {
          wordCount -= count
          state.nodeWordCounts.delete(key)
        }
      }

      for (const child of children) {
        const key = child.getKey()
        if (keysToRecompute.has(key) || !state.nodeWordCounts.has(key)) {
          wordCount -= state.nodeWordCounts.get(key) ?? 0
          const childCount = getNodeWordCount(child, language)
          state.nodeWordCounts.set(key, childCount)
          wordCount += childCount
        }
      }

      emitCount(wordCount)
    })
  }

  const throttledCount = throttleFn(countEditorWords, throttleMs)
  const throttledIncrementalCount = throttleFn(flushIncrementalCount, throttleMs)

  return {
    /** Run the initial full count and start listening for editor updates. */
    attach() {
      if (cleanupRegister) {
        return
      }

      countEditorWords()

      cleanupRegister = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves, prevEditorState, tags }) => {
        if (
          (dirtyElements.size === 0 && dirtyLeaves.size === 0) ||
          tags.has('history-merge') ||
          prevEditorState.isEmpty()
        ) {
          return
        }

        // Nested editors don't receive top-level dirty maps, so fall back to a
        // full recompute. The shared node count cache keeps subsequent top-level
        // updates incremental.
        if (isNestedEditor(editor)) {
          pendingDirtyKeys.clear()
          throttledCount()
          return
        }

        for (const key of dirtyLeaves) {
          pendingDirtyKeys.add(key)
        }
        for (const key of dirtyElements.keys()) {
          pendingDirtyKeys.add(key)
        }

        throttledIncrementalCount()
      })
    },

    /** Cancel pending flushes and stop listening for editor updates. */
    detach() {
      throttledCount.cancel()
      throttledIncrementalCount.cancel()
      cleanupRegister?.()
      cleanupRegister = null
    },
  }
}

export type WordCounter = ReturnType<typeof createWordCounter>
