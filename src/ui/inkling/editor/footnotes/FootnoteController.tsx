import type { EditorState, SerializedLexicalNode } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createTextNode,
  $getEditor,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $parseSerializedNode,
} from 'lexical'
import { useCallback, useEffect } from 'react'

import type { InklingDocument, InklingNonRecursiveBlockNode } from '@/shared/inkling/schema'

import { INKLING_SCHEMA_VERSION } from '@/shared/inkling/schema'
import { registerFootnoteCaretTrigger } from '@/ui/inkling/editor/footnotes/FootnoteCaretTrigger'
import {
  $createFootnoteDefinitionNode,
  $isFootnoteDefinitionNode,
} from '@/ui/inkling/editor/footnotes/FootnoteDefinitionNode'
import { FootnoteDialog } from '@/ui/inkling/editor/footnotes/FootnoteDialog'
import { $createFootnoteRefNode, $isFootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'
import { generateFootnoteKey, useInklingFootnotes } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'
import { applyFootnoteRenumberWithHistoryMerge } from '@/ui/inkling/editor/footnotes/renumber'

function editorStateToInklingDocument(editorState: EditorState): InklingDocument {
  const serialized = editorState.toJSON()
  return {
    _type: 'inkling',
    schemaVersion: INKLING_SCHEMA_VERSION,
    lexicalVersion: '0.45.0',
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    root: serialized.root as InklingDocument['root'],
  }
}

function $appendInklingChildren(
  parent: ReturnType<typeof $createFootnoteDefinitionNode>,
  children: readonly InklingNonRecursiveBlockNode[],
): void {
  for (const child of children) {
    // $parseSerializedNode uses the editor's node registry; it expects a plain
    // Lexical-shaped JSON object, which our non-recursive blocks satisfy.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const node = $parseSerializedNode(child as unknown as SerializedLexicalNode)
    if ($isElementNode(node) || node !== null) {
      parent.append(node)
    }
  }
}

function $replaceFootnoteDefinitionChildren(
  targetKey: string,
  children: readonly InklingNonRecursiveBlockNode[],
): boolean {
  const root = $getRoot()
  for (const child of root.getChildren()) {
    if ($isFootnoteDefinitionNode(child) && child.getTargetKey() === targetKey) {
      child.clear()
      $appendInklingChildren(child, children)
      return true
    }
  }
  return false
}

function $removeFootnoteDefinition(targetKey: string): boolean {
  const root = $getRoot()
  for (const child of root.getChildren()) {
    if ($isFootnoteDefinitionNode(child) && child.getTargetKey() === targetKey) {
      child.remove()
      return true
    }
  }
  return false
}

function $removeFootnoteRefs(targetKey: string): void {
  const root = $getRoot()
  const stack: ReturnType<typeof root.getChildren> = [...root.getChildren()]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined) {
      continue
    }
    if ($isFootnoteRefNode(node) && node.getTargetKey() === targetKey) {
      node.remove()
    } else if ($isElementNode(node)) {
      stack.push(...node.getChildren())
    }
  }
}

function $insertFootnoteRefAndDefinition(
  targetKey: string,
  definitionChildren: readonly InklingNonRecursiveBlockNode[],
): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return
  }
  const refKey = generateFootnoteKey()
  const ref = $createFootnoteRefNode(targetKey, refKey, 0)
  selection.insertNodes([ref, $createTextNode(' ')])

  const root = $getRoot()
  const def = $createFootnoteDefinitionNode(targetKey, 0)
  $appendInklingChildren(def, definitionChildren)
  root.append(def)
}

function $replaceCaretWithRef(_targetKey: string): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return
  }
  const anchor = selection.anchor
  const node = anchor.getNode()
  if (!$isTextNode(node)) {
    return
  }
  const text = node.getTextContent()
  const before = text.slice(0, anchor.offset)
  const caretIndex = before.lastIndexOf('^')
  if (caretIndex === -1) {
    return
  }
  node.spliceText(caretIndex, anchor.offset - caretIndex, '')
  node.select(caretIndex, caretIndex)
}

export function FootnoteController() {
  const [editor] = useLexicalComposerContext()
  const {
    definitions,
    dialogOpen,
    dialogMode,
    dialogInitialChildren,
    editTargetKey,
    openInsertDialog,
    closeDialog,
    syncFromDocument,
  } = useInklingFootnotes()

  // Sync provider state with the editor document on every update.
  useEffect(() => {
    if (editor === null) {
      return undefined
    }
    return editor.registerUpdateListener(({ editorState }) => {
      syncFromDocument(editorStateToInklingDocument(editorState))
    })
  }, [editor, syncFromDocument])

  // ^<space> trigger.
  useEffect(() => {
    if (editor === null) {
      return undefined
    }
    return registerFootnoteCaretTrigger(editor, () => {
      const targetKey = generateFootnoteKey()
      editor.update(() => {
        $replaceCaretWithRef(targetKey)
      })
      openInsertDialog(targetKey)
    })
  }, [editor, openInsertDialog])

  const handleSave = useCallback(
    (children: InklingNonRecursiveBlockNode[]) => {
      if (editor === null) {
        return
      }
      const targetKey = editTargetKey ?? generateFootnoteKey()
      editor.update(
        () => {
          if (dialogMode === 'create') {
            $insertFootnoteRefAndDefinition(targetKey, children)
          } else {
            $replaceFootnoteDefinitionChildren(targetKey, children)
          }
          applyFootnoteRenumberWithHistoryMerge($getEditor())
        },
        { tag: 'history-merge', discrete: true },
      )
      closeDialog()
    },
    [editor, dialogMode, editTargetKey, closeDialog],
  )

  const handleDelete = useCallback(() => {
    if (editor === null || editTargetKey === null) {
      closeDialog()
      return
    }
    editor.update(
      () => {
        $removeFootnoteDefinition(editTargetKey)
        $removeFootnoteRefs(editTargetKey)
        applyFootnoteRenumberWithHistoryMerge($getEditor())
      },
      { tag: 'history-merge', discrete: true },
    )
    closeDialog()
  }, [editor, editTargetKey, closeDialog])

  // Index for the dialog title is derived from provider definitions.
  const dialogIndex = definitions.find((d) => d.targetKey === editTargetKey)?.index ?? definitions.length + 1

  return (
    <FootnoteDialog
      open={dialogOpen}
      mode={dialogMode}
      initialChildren={dialogInitialChildren}
      index={dialogIndex}
      onSave={handleSave}
      onDelete={handleDelete}
      onClose={closeDialog}
    />
  )
}
