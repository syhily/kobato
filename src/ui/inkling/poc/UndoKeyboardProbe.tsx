import type { InitialConfigType } from '@lexical/react/LexicalComposer'
import type { BaseSelection, EditorState, LexicalEditor, SerializedEditorState } from 'lexical'

import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalNestedComposer } from '@lexical/react/LexicalNestedComposer'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  createEditor,
  ParagraphNode,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react'

import { useInklingKeyboardNavigation } from '@/ui/inkling/editor/behaviour/keyboard-navigation'
import { ImageCardNode, $createImageCardNode } from '@/ui/inkling/editor/cards/card-nodes'
import { FootnoteDefinitionNode } from '@/ui/inkling/editor/footnotes/FootnoteDefinitionNode'
import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'
import { applyFootnoteRenumberWithHistoryMerge } from '@/ui/inkling/editor/footnotes/renumber'

import { SharedHistoryProvider, useSharedHistoryState } from './shared-history-context'

const ROOT_NODES: InitialConfigType['nodes'] = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  ImageCardNode,
  FootnoteRefNode,
  FootnoteDefinitionNode,
]

const NESTED_NODES: InitialConfigType['nodes'] = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
]

const THEME: InitialConfigType['theme'] = {
  paragraph: 'inkling-paragraph',
  heading: { h1: 'inkling-h1', h2: 'inkling-h2', h3: 'inkling-h3', h4: 'inkling-h4' },
  list: { ul: 'inkling-ul', ol: 'inkling-ol' },
  link: 'inkling-link',
}

function generateKey(): string {
  const bytes = new Uint8Array(8)
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(36).padStart(2, '0')
  }
  return out.slice(0, 12)
}

function buildEmptyRootState(): SerializedEditorState {
  return {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          children: [],
        },
      ],
    } as unknown as SerializedEditorState['root'],
  }
}

function buildEmptyNestedEditorState(): EditorState {
  const tempEditor = createEditor({ nodes: NESTED_NODES })
  return tempEditor.parseEditorState({
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [{ type: 'paragraph', version: 1, children: [] }],
    } as unknown as SerializedEditorState['root'],
  })
}

export interface UndoKeyboardProbeHandle {
  insertFootnoteRef: () => { targetKey: string; refKey: string } | null
  deleteFootnoteRef: (refKey: string) => boolean
  insertBlockCard: () => string | null
  deleteBlockCard: (key: string) => boolean
  undo: () => void
  redo: () => void
  getSerializedState: () => SerializedEditorState
  getNestedSerializedState: () => SerializedEditorState
  getSelection: () => BaseSelection | null
  getNestedSelection: () => BaseSelection | null
  typeInRoot: (text: string) => void
  typeInNested: (text: string) => void
  focusNested: () => void
}

function NestedEditorSurface({ onEditor }: { onEditor: (editor: LexicalEditor) => void }) {
  const [parentEditor] = useLexicalComposerContext()
  const historyState = useSharedHistoryState()

  const nestedEditor = useMemo(
    () =>
      createEditor({
        namespace: 'inkling-undo-keyboard-nested',
        nodes: NESTED_NODES,
        parentEditor,
        editable: true,
        theme: THEME,
        onError: (error: Error) => {
          // eslint-disable-next-line no-console
          console.error('Nested undo-keyboard editor error:', error)
        },
        editorState: buildEmptyNestedEditorState(),
      }),
    [parentEditor],
  )

  useEffect(() => {
    onEditor(nestedEditor)
  }, [nestedEditor, onEditor])

  return (
    <LexicalNestedComposer initialEditor={nestedEditor}>
      <div className="inkling-nested-editor">
        <ContentEditable className="inkling-nested-editor__content" />
        <HistoryPlugin externalHistoryState={historyState} />
      </div>
    </LexicalNestedComposer>
  )
}

const UndoKeyboardProbeInner = forwardRef<
  UndoKeyboardProbeHandle,
  { onChange: (state: SerializedEditorState) => void }
>(function UndoKeyboardProbeInner({ onChange }, ref) {
  const [editor] = useLexicalComposerContext()
  const [nestedEditor, setNestedEditor] = useState<LexicalEditor | null>(null)
  const historyState = useSharedHistoryState()

  useInklingKeyboardNavigation(editor)

  const handleChange = useCallback(
    (editorState: import('lexical').EditorState) => {
      onChange(editorState.toJSON())
    },
    [onChange],
  )

  useImperativeHandle(
    ref,
    () => ({
      insertFootnoteRef: () => {
        if (editor === null) {
          return null
        }
        let result: { targetKey: string; refKey: string } | null = null
        editor.update(() => {
          const selection = $getSelection()
          const targetKey = generateKey()
          const refKey = generateKey()
          const refNode = new FootnoteRefNode(targetKey, refKey, 1)
          if (selection !== null) {
            selection.insertNodes([refNode])
          } else {
            const root = $getRoot()
            const firstChild = root.getFirstChild()
            const paragraph = $isParagraphNode(firstChild) ? firstChild : $createParagraphNode()
            if (firstChild === null) {
              root.append(paragraph)
            }
            paragraph.append(refNode)
          }
          const defNode = new FootnoteDefinitionNode(targetKey, 1)
          defNode.append($createParagraphNode())
          $getRoot().append(defNode)
          result = { targetKey, refKey }
        })
        applyFootnoteRenumberWithHistoryMerge(editor)
        return result
      },

      deleteFootnoteRef: (refKey: string) => {
        if (editor === null) {
          return false
        }
        let removed = false
        editor.update(() => {
          const root = $getRoot()
          const children = root.getChildren()
          for (const topLevel of children) {
            if (topLevel instanceof FootnoteDefinitionNode && topLevel.getTargetKey() === refKey) {
              topLevel.remove()
              removed = true
              break
            }
          }
          const queue: import('lexical').LexicalNode[] = [...children]
          while (queue.length > 0) {
            const node = queue.shift()
            if (node === undefined) {
              continue
            }
            if (node instanceof FootnoteRefNode && node.getRefKey() === refKey) {
              node.remove()
              removed = true
              break
            }
            if ($isElementNode(node)) {
              queue.push(...node.getChildren())
            }
          }
        })
        if (removed) {
          applyFootnoteRenumberWithHistoryMerge(editor)
        }
        return removed
      },

      insertBlockCard: () => {
        if (editor === null) {
          return null
        }
        let key: string | null = null
        editor.update(() => {
          const selection = $getSelection()
          const card = $createImageCardNode({ src: '', alt: '', caption: '', layout: 'center' })
          key = card.getKey()
          if (selection !== null) {
            selection.insertNodes([card])
          } else {
            const root = $getRoot()
            const firstChild = root.getFirstChild()
            const paragraph = $isParagraphNode(firstChild) ? firstChild : $createParagraphNode()
            if (firstChild === null) {
              root.append(paragraph)
            }
            paragraph.insertAfter(card)
          }
        })
        return key
      },

      deleteBlockCard: (key: string) => {
        if (editor === null) {
          return false
        }
        let removed = false
        editor.update(() => {
          const root = $getRoot()
          const node = root.getChildren().find((child) => child.getKey() === key)
          if (node instanceof ImageCardNode) {
            node.remove()
            removed = true
          }
        })
        return removed
      },

      undo: () => {
        editor?.dispatchCommand(UNDO_COMMAND, undefined)
      },

      redo: () => {
        editor?.dispatchCommand(REDO_COMMAND, undefined)
      },

      getSerializedState: () => editor.getEditorState().toJSON(),

      getNestedSerializedState: () =>
        nestedEditor?.getEditorState().toJSON() ?? {
          root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [] },
        },

      getSelection: () => editor.getEditorState().read(() => $getSelection()),

      getNestedSelection: () => nestedEditor?.getEditorState().read(() => $getSelection()) ?? null,

      typeInRoot: (text: string) => {
        editor?.update(() => {
          const selection = $getSelection()
          if (selection !== null) {
            selection.insertText(text)
          } else {
            const root = $getRoot()
            const paragraph = root.getFirstChildOrThrow() as ParagraphNode
            paragraph.selectEnd()
            $getSelection()?.insertText(text)
          }
        })
      },

      typeInNested: (text: string) => {
        nestedEditor?.update(() => {
          const selection = $getSelection()
          if (selection !== null) {
            selection.insertText(text)
          } else {
            const root = $getRoot()
            const paragraph = root.getFirstChildOrThrow() as ParagraphNode
            paragraph.selectEnd()
            $getSelection()?.insertText(text)
          }
        })
      },

      focusNested: () => {
        nestedEditor?.update(() => {
          const root = $getRoot()
          const paragraph = root.getFirstChildOrThrow() as ParagraphNode
          paragraph.selectEnd()
        })
      },
    }),
    [editor, nestedEditor],
  )

  return (
    <div className="inkling-undo-keyboard-probe">
      <div className="inkling-undo-keyboard-probe__root">
        <ContentEditable className="inkling-content-editable" />
        <OnChangePlugin onChange={handleChange} />
        <HistoryPlugin externalHistoryState={historyState} />
      </div>
      <div className="inkling-undo-keyboard-probe__nested">
        <NestedEditorSurface onEditor={setNestedEditor} />
      </div>
    </div>
  )
})

export interface UndoKeyboardProbeProps {
  onChange: (state: SerializedEditorState) => void
}

export const UndoKeyboardProbe = forwardRef<UndoKeyboardProbeHandle, UndoKeyboardProbeProps>(function UndoKeyboardProbe(
  { onChange },
  ref,
) {
  const initialConfig: InitialConfigType = {
    namespace: 'inkling-undo-keyboard-root',
    theme: THEME,
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Undo/keyboard probe error:', error)
    },
    nodes: ROOT_NODES,
    editorState: (editor: LexicalEditor) => {
      editor.setEditorState(editor.parseEditorState(buildEmptyRootState()))
    },
  }

  return (
    <SharedHistoryProvider>
      <LexicalComposer initialConfig={initialConfig}>
        <UndoKeyboardProbeInner ref={ref} onChange={onChange} />
      </LexicalComposer>
    </SharedHistoryProvider>
  )
})
