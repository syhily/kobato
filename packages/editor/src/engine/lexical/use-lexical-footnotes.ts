import type { LexicalBody, LexicalFootnoteDefinitionNode } from '@kobato/shared/lexical/schema'

import {
  createFootnoteDefinitionNode,
  extractFootnoteDefinitionBlocksLexical,
  generateFootnoteKey,
  lexicalFootnoteChildrenToPlainText,
  mergeLexicalBodyWithFootnoteDefinitions,
  plainTextToLexicalFootnoteChildren,
  stripFootnoteDefinitionsForEditorLexical,
} from '@kobato/shared/lexical/footnote-merge-lexical'
import { footnoteSyncSignatureLexical } from '@kobato/shared/lexical/footnote-sync-lexical'
import { $createFootnoteRefNode, $isFootnoteRefNode } from '@kobato/shared/lexical/nodes/footnote-ref-node'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { $dfs } from '@lexical/utils'
import { $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Footnote loop for the Lexical engine — the port of the tiptap
 * `use-editor-footnotes.ts` data flow:
 *
 *   - definitions NEVER enter the editor state; they live in this hook's
 *     state as `LexicalFootnoteDefinitionNode` JSON (`ptKey` is the refs'
 *     `targetKey` anchor, matching the R1 custom-field contract)
 *   - load: `resetFootnotes(body)` extracts the definitions from the
 *     canonical body; the editor surface renders prose only
 *   - save: `handleEditorUpdate(prose)` merges the definitions back at
 *     the end, renumbers (`synchronizeFootnoteIndicesLexical` — the
 *     shared R1 engine, via `mergeLexicalBodyWithFootnoteDefinitions`)
 *     and returns the canonical body; when the citation order changed,
 *     the in-editor `<sup>` indices are re-synced through
 *     `FootnoteRefNode.setIndex` in a history-merged update
 *   - dialog: create / edit / delete through the shared
 *     `FootnoteEditorDialog`; the dialog's plain text round-trips
 *     through `plainTextToLexicalFootnoteChildren`
 */

function footnoteDefsEqual(a: LexicalFootnoteDefinitionNode[], b: LexicalFootnoteDefinitionNode[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.ptKey !== b[i]?.ptKey || a[i]?.index !== b[i]?.index) {
      return false
    }
  }
  return true
}

export interface UseLexicalFootnotesResult {
  footnotes: LexicalFootnoteDefinitionNode[]
  dialogOpen: boolean
  dialogMode: 'create' | 'edit'
  dialogInitialText: string
  editTargetKey: string | null
  openInsertDialog: () => void
  openEditDialog: (targetKey: string) => void
  setDialogOpen: (open: boolean) => void
  insertFootnote: (plainText: string) => LexicalBody | null
  removeFootnote: (targetKey: string) => LexicalBody | null
  reindexFootnotes: () => LexicalBody | null
  /** Merge + renumber + report the canonical body for an editor update. */
  handleEditorUpdate: (prose: LexicalBody) => LexicalBody
  /** Extract defs from a body, update parallel state, return the canonical body. */
  resetFootnotes: (body: LexicalBody) => LexicalBody
}

/** Rewrite every `FootnoteRefNode` index from the key→index map (merged into the previous history entry). */
function syncFootnoteRefIndices(editor: LexicalEditor, keyToIndex: Map<string, number>): void {
  editor.update(
    () => {
      for (const { node } of $dfs()) {
        if (!$isFootnoteRefNode(node)) {
          continue
        }
        const next = keyToIndex.get(node.getTargetKey())
        if (next !== undefined && next !== node.getIndex()) {
          node.setIndex(next)
        }
      }
    },
    { tag: 'history-merge' },
  )
}

/** Read the editor's current (prose-only) body JSON. */
function readProseBody(editor: LexicalEditor): LexicalBody {
  // The runtime EditorState JSON is the isomorphic body dialect — the
  // schema's zod whitelist gate rejects anything structurally off.
  return unsafeCast<LexicalBody>(editor.getEditorState().toJSON())
}

export function useLexicalFootnotes(editor: LexicalEditor | null): UseLexicalFootnotesResult {
  const [footnoteDefs, setFootnoteDefs] = useState<LexicalFootnoteDefinitionNode[]>([])
  const footnoteDefsRef = useRef(footnoteDefs)
  useEffect(() => {
    footnoteDefsRef.current = footnoteDefs
  })

  const lastSyncSignatureRef = useRef<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [dialogInitialText, setDialogInitialText] = useState('')
  const [footnoteEditTargetKey, setFootnoteEditTargetKey] = useState<string | null>(null)

  const openInsertDialog = useCallback(() => {
    setFootnoteEditTargetKey(null)
    setDialogMode('create')
    setDialogInitialText('')
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback((targetKey: string) => {
    const def = footnoteDefsRef.current.find((d) => d.ptKey === targetKey)
    setFootnoteEditTargetKey(targetKey)
    setDialogMode('edit')
    setDialogInitialText(def !== undefined ? lexicalFootnoteChildrenToPlainText(def.children) : '')
    setDialogOpen(true)
  }, [])

  /** Merge prose + defs, renumber, sync the editor sup indices when the citation order moved. */
  const mergeAndSync = useCallback(
    (prose: LexicalBody, defs: readonly LexicalFootnoteDefinitionNode[]): LexicalBody => {
      const merged = mergeLexicalBodyWithFootnoteDefinitions(prose, defs)
      const signature = footnoteSyncSignatureLexical(merged)
      if (signature !== lastSyncSignatureRef.current) {
        lastSyncSignatureRef.current = signature
        if (editor !== null) {
          const keyToIndex = new Map<string, number>()
          for (const block of merged.root.children) {
            if (block.type === 'footnoteDefinition' && block.ptKey !== undefined) {
              keyToIndex.set(block.ptKey, block.index)
            }
          }
          syncFootnoteRefIndices(editor, keyToIndex)
        }
      }
      const nextDefs = extractFootnoteDefinitionBlocksLexical(merged)
      if (!footnoteDefsEqual(nextDefs, footnoteDefsRef.current)) {
        setFootnoteDefs(nextDefs)
      }
      return merged
    },
    [editor],
  )

  const handleEditorUpdate = useCallback(
    (prose: LexicalBody): LexicalBody => {
      return mergeAndSync(prose, footnoteDefsRef.current)
    },
    [mergeAndSync],
  )

  /** Insert a ref node at the caret (create mode) or rewrite the def children (edit mode). */
  const insertFootnote = useCallback(
    (plainText: string): LexicalBody | null => {
      const editKey = footnoteEditTargetKey
      if (editKey !== null) {
        const nextDefs = footnoteDefsRef.current.map((d) =>
          d.ptKey === editKey ? { ...d, children: plainTextToLexicalFootnoteChildren(plainText) } : d,
        )
        setFootnoteDefs(nextDefs)
        setFootnoteEditTargetKey(null)
        if (editor === null) {
          return null
        }
        return mergeAndSync(readProseBody(editor), nextDefs)
      }
      if (editor === null) {
        return null
      }
      // Next index from the parallel defs (authoritative — in-editor ref
      // indices are always synced to them by `mergeAndSync`).
      let maxIndex = 0
      for (const d of footnoteDefsRef.current) {
        maxIndex = Math.max(maxIndex, d.index)
      }
      const nextIndex = maxIndex + 1
      const defKey = generateFootnoteKey()
      const newDef = createFootnoteDefinitionNode(defKey, nextIndex, plainText)
      const nextDefs = [...footnoteDefsRef.current, newDef]
      setFootnoteDefs(nextDefs)
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          selection.insertNodes([$createFootnoteRefNode(defKey, nextIndex)])
        }
      })
      return mergeAndSync(readProseBody(editor), nextDefs)
    },
    [editor, mergeAndSync, footnoteEditTargetKey],
  )

  const removeFootnote = useCallback(
    (targetKey: string): LexicalBody | null => {
      if (editor === null || targetKey === '') {
        return null
      }
      const nextDefs = footnoteDefsRef.current.filter((d) => d.ptKey !== targetKey)
      setFootnoteDefs(nextDefs)
      editor.update(() => {
        for (const { node } of $dfs()) {
          if ($isFootnoteRefNode(node) && node.getTargetKey() === targetKey) {
            node.remove()
          }
        }
      })
      return mergeAndSync(readProseBody(editor), nextDefs)
    },
    [editor, mergeAndSync],
  )

  const reindexFootnotes = useCallback((): LexicalBody | null => {
    if (editor === null) {
      return null
    }
    return mergeAndSync(readProseBody(editor), footnoteDefsRef.current)
  }, [editor, mergeAndSync])

  const resetFootnotes = useCallback((body: LexicalBody): LexicalBody => {
    const defs = extractFootnoteDefinitionBlocksLexical(body)
    // Merge prose + defs — the input body still carries its definitions,
    // so strip them first or the merge would append duplicates.
    const prose = stripFootnoteDefinitionsForEditorLexical(body)
    const merged = mergeLexicalBodyWithFootnoteDefinitions(prose, defs)
    const syncedDefs = extractFootnoteDefinitionBlocksLexical(merged)
    setFootnoteDefs(syncedDefs)
    lastSyncSignatureRef.current = footnoteSyncSignatureLexical(merged)
    return merged
  }, [])

  return {
    footnotes: footnoteDefs,
    dialogOpen,
    dialogMode,
    dialogInitialText,
    editTargetKey: footnoteEditTargetKey,
    openInsertDialog,
    openEditDialog,
    setDialogOpen,
    insertFootnote,
    removeFootnote,
    reindexFootnotes,
    handleEditorUpdate,
    resetFootnotes,
  }
}
