import { countWords, throttle } from '@kobato/inkling-internal/utils'
import { getTopLevelEditor, isNestedEditor } from '@kobato/inkling-internal/utils/lexical-internals'
import { mergeRegister } from '@lexical/utils'
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isRootNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical'

export const WORD_COUNT_THROTTLE_MS = 200
export interface WordCounterThrottled {
  (): void
  cancel: () => void
}
export type WordCounterThrottle = (fn: () => void, waitMs: number) => WordCounterThrottled
const defaultThrottle: WordCounterThrottle = (fn, waitMs) => throttle(fn, waitMs)

type SelectionCountCallback = (count: number | null) => void
interface SelectionCountEntry {
  editor: LexicalEditor
  count: number | null
  updatedAt: number
  callback: SelectionCountCallback
}

interface WordCountState {
  nodeWordCounts: Map<string, number>
  lastWordCount: number

  selectionCounts: Map<object, SelectionCountEntry>

  focusedEditor: LexicalEditor | null

  lastSelectionWordCounts: Map<SelectionCountCallback, number | null>
  selectionUpdateSequence: number
}

const editorWordCountStates = new WeakMap<LexicalEditor, WordCountState>()

function getWordCountState(topLevelEditor: LexicalEditor): WordCountState {
  let state = editorWordCountStates.get(topLevelEditor)
  if (!state) {
    state = {
      nodeWordCounts: new Map<string, number>(),
      lastWordCount: 0,
      selectionCounts: new Map<object, SelectionCountEntry>(),
      focusedEditor: null,
      lastSelectionWordCounts: new Map<SelectionCountCallback, number | null>(),
      selectionUpdateSequence: 0,
    }
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

function hasEditorFocus(editor: LexicalEditor, state: WordCountState): boolean {
  const rootElement = editor.getRootElement()
  if (rootElement) {
    return rootElement.ownerDocument.activeElement === rootElement
  }
  return state.focusedEditor === editor
}

interface CreateWordCounterOptions {
  editor: LexicalEditor
  onChange?: (count: number) => void

  onSelectionChange?: (count: number | null) => void
  language?: string
  throttleMs?: number
  throttleFn?: WordCounterThrottle
}
function collectDocumentWordCount(state: WordCountState, language?: string): number {
  const rootNode = $getRoot()
  const children = rootNode.getChildren()
  let wordCount = 0

  state.nodeWordCounts.clear()
  for (const child of children) {
    const childCount = getNodeWordCount(child, language)
    state.nodeWordCounts.set(child.getKey(), childCount)
    wordCount += childCount
  }

  return wordCount
}

function pruneSelectionEmissions(state: WordCountState) {
  const inUse = new Set<SelectionCountCallback>()
  for (const entry of state.selectionCounts.values()) {
    inUse.add(entry.callback)
  }
  for (const callback of state.lastSelectionWordCounts.keys()) {
    if (!inUse.has(callback)) {
      state.lastSelectionWordCounts.delete(callback)
    }
  }
}

export function createWordCounter({
  editor,
  onChange,
  onSelectionChange,
  language: initialLanguage,
  throttleMs = WORD_COUNT_THROTTLE_MS,
  throttleFn = defaultThrottle,
}: CreateWordCounterOptions) {
  if (onChange === undefined && onSelectionChange === undefined) {
    return {
      attach: () => undefined,
      detach: () => undefined,
      setLanguage: () => undefined,
    }
  }

  const counterToken = {}
  const countCallback = onChange
  const selectionCallback = onSelectionChange
  let currentLanguage = initialLanguage
  let pendingDirtyKeys = new Set<string>()
  let cleanupRegister: (() => void) | null = null
  const countDocumentWords = countCallback
    ? (forceEmission: boolean) => {
        const topLevelEditor = getTopLevelEditor(editor)
        const state = getWordCountState(topLevelEditor)

        topLevelEditor.getEditorState().read(() => {
          // NOTE: RootNode.getTextContent() cannot be used here — it returns
          // cached text when there are no dirty nodes, which is the case for
          // changes in nested editors
          const wordCount = collectDocumentWordCount(state, currentLanguage)
          if (forceEmission || wordCount !== state.lastWordCount) {
            state.lastWordCount = wordCount
            countCallback(wordCount)
          }
        })
      }
    : null

  const flushIncrementalCount = countCallback
    ? () => {
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
              const childCount = getNodeWordCount(child, currentLanguage)
              state.nodeWordCounts.set(key, childCount)
              wordCount += childCount
            }
          }

          if (wordCount !== state.lastWordCount) {
            state.lastWordCount = wordCount
            countCallback(wordCount)
          }
        })
      }
    : null

  const broadcastSelectionCount = (callbacks: Iterable<SelectionCountCallback>) => {
    const state = getWordCountState(getTopLevelEditor(editor))
    let activeEntry: SelectionCountEntry | null = null

    for (const entry of state.selectionCounts.values()) {
      if (!entry.editor.isEditable()) {
        continue
      }
      if (!hasEditorFocus(entry.editor, state)) {
        continue
      }
      if (activeEntry === null || entry.updatedAt > activeEntry.updatedAt) {
        activeEntry = entry
      }
    }

    const combined = activeEntry?.count ?? null

    for (const callback of new Set(callbacks)) {
      if (state.lastSelectionWordCounts.has(callback) && state.lastSelectionWordCounts.get(callback) === combined) {
        continue
      }
      state.lastSelectionWordCounts.set(callback, combined)
      callback(combined)
    }
  }
  const emitSelectionCount = () => {
    const state = getWordCountState(getTopLevelEditor(editor))
    broadcastSelectionCount([...state.selectionCounts.values()].map((entry) => entry.callback))
  }

  const updateSelectionCount = selectionCallback
    ? () => {
        const state = getWordCountState(getTopLevelEditor(editor))
        const focused = hasEditorFocus(editor, state)
        const editable = editor.isEditable()

        if (focused && editor.getRootElement() === null) {
          state.focusedEditor = editor
        }

        state.selectionUpdateSequence += 1
        const updatedAt = state.selectionUpdateSequence

        editor.getEditorState().read(() => {
          const selection = $getSelection()
          const count =
            focused && editable && $isRangeSelection(selection) && !selection.isCollapsed()
              ? countWords(selection.getTextContent(), currentLanguage)
              : null

          state.selectionCounts.set(counterToken, {
            editor,
            count,
            updatedAt,
            callback: selectionCallback,
          })
        })

        emitSelectionCount()
      }
    : null

  const throttledCount = countDocumentWords ? throttleFn(() => countDocumentWords(true), throttleMs) : null
  const throttledIncrementalCount = flushIncrementalCount ? throttleFn(flushIncrementalCount, throttleMs) : null
  const throttledSelectionCount = updateSelectionCount ? throttleFn(updateSelectionCount, throttleMs) : null

  return {
    attach() {
      if (cleanupRegister) {
        return
      }

      countDocumentWords?.(true)
      updateSelectionCount?.()

      const registrations: Array<() => void> = [
        editor.registerUpdateListener(({ dirtyElements, dirtyLeaves, prevEditorState, tags }) => {
          throttledSelectionCount?.()

          if (!throttledIncrementalCount && !throttledCount) {
            return
          }

          if (
            (dirtyElements.size === 0 && dirtyLeaves.size === 0) ||
            tags.has('history-merge') ||
            prevEditorState.isEmpty()
          ) {
            return
          }

          if (isNestedEditor(editor)) {
            pendingDirtyKeys.clear()
            throttledCount?.()
            return
          }

          for (const key of dirtyLeaves) {
            pendingDirtyKeys.add(key)
          }
          for (const key of dirtyElements.keys()) {
            pendingDirtyKeys.add(key)
          }

          throttledIncrementalCount?.()
        }),
      ]

      if (updateSelectionCount && emitSelectionCount && selectionCallback) {
        registrations.push(
          editor.registerCommand(
            BLUR_COMMAND,
            (_event, fromEditor) => {
              // Lexical propagates commands up the parent-editor chain; a
              // nested editor's blur must not clear the parent's ledger
              if (fromEditor !== editor) {
                return false
              }

              throttledSelectionCount?.cancel()
              const state = getWordCountState(getTopLevelEditor(editor))

              if (editor.getRootElement() === null && state.focusedEditor === editor) {
                state.focusedEditor = null
              }

              state.selectionUpdateSequence += 1
              state.selectionCounts.set(counterToken, {
                editor,
                count: null,
                updatedAt: state.selectionUpdateSequence,
                callback: selectionCallback,
              })
              emitSelectionCount()
              return false
            },
            COMMAND_PRIORITY_LOW,
          ),
          editor.registerCommand(
            FOCUS_COMMAND,
            (_event, fromEditor) => {
              if (fromEditor !== editor) {
                return false
              }

              const state = getWordCountState(getTopLevelEditor(editor))
              if (editor.getRootElement() === null) {
                state.focusedEditor = editor
              }
              updateSelectionCount()
              return false
            },
            COMMAND_PRIORITY_LOW,
          ),

          editor.registerEditableListener(() => {
            updateSelectionCount()
          }),
        )
      }

      cleanupRegister = mergeRegister(...registrations)
    },

    detach() {
      throttledCount?.cancel()
      throttledIncrementalCount?.cancel()
      throttledSelectionCount?.cancel()
      cleanupRegister?.()
      cleanupRegister = null

      if (selectionCallback) {
        const state = getWordCountState(getTopLevelEditor(editor))
        state.selectionCounts.delete(counterToken)

        if (editor.getRootElement() === null && state.focusedEditor === editor) {
          const hasRemainingCounter = [...state.selectionCounts.values()].some((entry) => entry.editor === editor)
          if (!hasRemainingCounter) {
            state.focusedEditor = null
          }
        }
        const callbacks = new Set<SelectionCountCallback>()
        for (const entry of state.selectionCounts.values()) {
          callbacks.add(entry.callback)
        }

        callbacks.add(selectionCallback)
        broadcastSelectionCount(callbacks)
        pruneSelectionEmissions(state)
      }
    },

    setLanguage(nextLanguage?: string) {
      if (nextLanguage === currentLanguage) {
        return
      }
      currentLanguage = nextLanguage
      countDocumentWords?.(false)
      updateSelectionCount?.()
    },
  }
}

export type WordCounter = ReturnType<typeof createWordCounter>
