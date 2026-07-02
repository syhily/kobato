import type { LexicalNode } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createTextNode, $getRoot, $getSelection, $isElementNode, $isRangeSelection, $isTextNode } from 'lexical'
import { useCallback, useEffect, useRef } from 'react'

import type { InklingFootnoteRefEntry } from '@/shared/inkling/footnotes'
import type { InklingNonRecursiveBlockNode } from '@/shared/inkling/schema'

import { createEmptyInklingParagraph } from '@/shared/inkling/empty'
import { collectFootnoteRefs } from '@/shared/inkling/footnotes'
import { registerFootnoteCaretTrigger } from '@/ui/inkling/editor/footnotes/FootnoteCaretTrigger'
import { FootnoteDialog } from '@/ui/inkling/editor/footnotes/FootnoteDialog'
import { $createFootnoteRefNode, $isFootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'
import { generateFootnoteKey, useInklingFootnotes } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'
import {
  applyFootnoteRenumberWithHistoryMerge,
  buildFootnoteIndexMap,
  footnoteSyncSignature,
} from '@/ui/inkling/editor/footnotes/renumber'
import { editorStateToInklingDocument } from '@/ui/inkling/editor/serialize'

/**
 * Remove every `FootnoteRefNode` whose `targetKey` matches. Used by the delete
 * handler to clear superscripts when a definition is removed. Must run inside
 * an active update.
 */
function $removeFootnoteRefsByTargetKey(targetKey: string): void {
  const root = $getRoot()
  const stack = [...root.getChildren()]
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

/**
 * Insert a `FootnoteRefNode` at the caret, followed by a space so the user
 * can keep typing. Must run inside an active update with a collapsed range
 * selection.
 */
function $insertFootnoteRefAtCaret(targetKey: string): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return
  }
  const refKey = generateFootnoteKey()
  const ref = $createFootnoteRefNode(targetKey, refKey, 0)
  selection.insertNodes([ref, $createTextNode(' ')])
}

/**
 * Delete the `^ ` trigger text immediately before the caret. Must run inside
 * an active update.
 */
function $replaceCaretWithRef(): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return
  }
  const anchor = selection.anchor
  // Explicit annotation + suppression: Lexical 0.13's `PointType.getNode()`
  // d.ts uses a self-import (`import { TextNode } from '.'`) that oxlint's
  // type-aware checker fails to resolve, yielding an error-typed value. tsc
  // resolves it fine; the annotation restores the type downstream.
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- false positive, see above
  const node: LexicalNode = anchor.getNode()
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
    getDefinitions,
    openInsertDialog,
    closeDialog,
    replaceDefinition,
    removeDefinition,
    renumberDefinitions,
  } = useInklingFootnotes()

  // Re-entrancy guard: the renumber update re-fires this listener, so without
  // a guard we'd loop. Mirrors the Tiptap-era `isSyncingFootnotesRef` pattern.
  const isSyncingRef = useRef(false)
  // Last-seen signature. When an editor-update produces the same signature
  // we skip renumber entirely — this bounds the loop to one extra update.
  // The signature includes BOTH ref indices and definition indices, so once
  // the provider's parallel definition state is renumbered to match the
  // in-tree ref indices, the next listener fire matches and short-circuits.
  const lastSignatureRef = useRef<string>('')

  // Core footnote lifecycle hook. Fires on every editor update:
  //   1. Read refs from the editor tree.
  //   2. Compute a signature covering refs + provider definitions; if it
  //      changed, renumber BOTH the in-tree refs (history-merged) and the
  //      provider's definition indices so the two stay in sync.
  //   3. The next listener fire (with corrected indices on both sides)
  //      matches the stored signature and short-circuits.
  useEffect(() => {
    if (editor === null) {
      return undefined
    }
    return editor.registerUpdateListener(({ editorState }) => {
      if (isSyncingRef.current) {
        return
      }
      let refs: InklingFootnoteRefEntry[] = []
      editorState.read(() => {
        refs = collectFootnoteRefs(editorStateToInklingDocument(editorState))
      })

      // Orphan definitions are NOT silently auto-removed here.  The user
      // may still be editing a definition that temporarily has no refs
      // (e.g. they just deleted the last ref and plan to insert a new one).
      // Explicit deletion is available via the delete button in FootnoteDialog.

      const currentDefinitions = getDefinitions()
      const preSignature = footnoteSyncSignature(refs, currentDefinitions)
      if (preSignature === lastSignatureRef.current) {
        return
      }

      // Compute the signature we expect AFTER renumber lands. Both the
      // in-tree refs and the provider definitions will be rewritten to
      // match `buildFootnoteIndexMap`, so we store the projected signature
      // (using that same index map on both sides) so the next listener fire
      // matches and short-circuits.
      const indexMap = buildFootnoteIndexMap(refs, currentDefinitions)
      const projectedRefs = refs.map((r) => ({ ...r, index: indexMap.get(r.targetKey) ?? r.index }))
      const projectedDefinitions = currentDefinitions.map((d) => ({
        ...d,
        index: indexMap.get(d.targetKey) ?? d.index,
      }))
      lastSignatureRef.current = footnoteSyncSignature(projectedRefs, projectedDefinitions)

      // Renumber the provider's parallel definition state so it agrees with
      // the in-tree ref indices. Without this, the projected signature would
      // never match the actual state on the next fire and we'd renumber
      // (no-op for refs but still a discrete history-merged update) on every
      // keystroke for the life of the editor session.
      renumberDefinitions(refs)

      isSyncingRef.current = true
      try {
        applyFootnoteRenumberWithHistoryMerge(editor, refs, currentDefinitions)
      } finally {
        // Re-arm on the next microtask so the renumber's own listener fire
        // (which will short-circuit via the signature gate) lands first.
        queueMicrotask(() => {
          isSyncingRef.current = false
        })
      }
    })
  }, [editor, getDefinitions, renumberDefinitions])

  // `^<space>` trigger. Suppressed while the dialog is open so typing `^ `
  // inside the footnote body editor doesn't reopen an insert dialog.
  useEffect(() => {
    if (editor === null || dialogOpen) {
      return undefined
    }
    return registerFootnoteCaretTrigger(editor, () => {
      const targetKey = generateFootnoteKey()
      editor.update(
        () => {
          $replaceCaretWithRef()
          $insertFootnoteRefAtCaret(targetKey)
        },
        { tag: 'history-merge', discrete: true },
      )
      replaceDefinition(targetKey, [createEmptyInklingParagraph()])
      openInsertDialog(targetKey)
    })
  }, [editor, dialogOpen, openInsertDialog, replaceDefinition])

  const handleSave = useCallback(
    (children: InklingNonRecursiveBlockNode[]) => {
      if (editor === null) {
        return
      }
      const targetKey = editTargetKey ?? generateFootnoteKey()
      if (dialogMode === 'create') {
        // The ref was already inserted by the caret trigger. If the dialog
        // was opened from a toolbar button instead (no ref yet), insert one
        // now so the definition is not orphaned immediately.
        editor.update(
          () => {
            const doc = editorStateToInklingDocument(editor.getEditorState())
            const hasRef = collectFootnoteRefs(doc).some((r) => r.targetKey === targetKey)
            if (!hasRef) {
              $insertFootnoteRefAtCaret(targetKey)
            }
          },
          { tag: 'history-merge', discrete: true },
        )
      }
      replaceDefinition(targetKey, children)
      // Force the next update-listener pass to recompute (the new/edited
      // definition may shift indices or change the signature).
      lastSignatureRef.current = ''
      closeDialog()
    },
    [editor, dialogMode, editTargetKey, replaceDefinition, closeDialog],
  )

  const handleDelete = useCallback(() => {
    if (editor === null || editTargetKey === null) {
      closeDialog()
      return
    }
    editor.update(
      () => {
        $removeFootnoteRefsByTargetKey(editTargetKey)
      },
      { tag: 'history-merge', discrete: true },
    )
    removeDefinition(editTargetKey)
    lastSignatureRef.current = ''
    closeDialog()
  }, [editor, editTargetKey, removeDefinition, closeDialog])

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
