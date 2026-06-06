import type { Editor, JSONContent } from '@tiptap/core'

import { useCallback, useRef, useState } from 'react'

import type { PmDoc } from '@/shared/pt/bridge/types'
import type { FootnoteDefinitionBlock, PortableTextBody } from '@/shared/pt/schema'

import { footnoteSyncSignature, synchronizeFootnoteIndices } from '@/shared/pt/bridge/nodes/footnote'
import { pmDocToBody } from '@/shared/pt/bridge/pm-to-pt'
import { bodyToPmDoc } from '@/shared/pt/bridge/pt-to-pm'
import {
  extractFootnoteDefinitionBlocks,
  footnoteChildrenToPlainText,
  mergeProseBodyWithFootnoteDefinitions,
  plainTextToFootnoteChildren,
  stripFootnoteDefinitionsForEditor,
} from '@/shared/pt/footnote-merge'
import { generateBlockKey } from '@/shared/pt/utils'
import {
  canInsertFootnoteMark,
  computeNextFootnoteIndex,
  insertFootnoteReferenceAtCaret,
  removeFootnoteReferencesToTargetKey,
} from '@/ui/admin/editor/tiptap/insert-inline-footnote'

export interface FootnoteItem {
  _key: string
  index: number
  children: FootnoteDefinitionBlock['children']
}

function footnoteDefsEqual(a: FootnoteDefinitionBlock[], b: FootnoteDefinitionBlock[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i]._key !== b[i]._key || a[i].index !== b[i].index) {
      return false
    }
  }
  return true
}

export interface UseEditorFootnotesResult {
  footnotes: FootnoteDefinitionBlock[]
  dialogOpen: boolean
  dialogMode: 'create' | 'edit'
  dialogInitialText: string
  editTargetKey: string | null
  openInsertDialog: () => void
  openEditDialog: (targetKey: string) => void
  setDialogOpen: (open: boolean) => void
  insertFootnote: (plainText: string) => PortableTextBody | null
  removeFootnote: (targetKey: string) => PortableTextBody | null
  reindexFootnotes: () => PortableTextBody | null
  handleEditorUpdate: (instance: Editor) => PortableTextBody
  resetFootnotes: (body: PortableTextBody) => PortableTextBody
}

interface FootnoteRenumberChange {
  from: number
  to: number
  newText: string
  attrs: Record<string, unknown>
}

function buildKeyToIndexMap(syncedBody: PortableTextBody): Map<string, number> {
  const map = new Map<string, number>()
  for (const block of syncedBody) {
    if (block._type === 'footnoteDefinition') {
      map.set(block._key, block.index)
    }
  }
  return map
}

function applyFootnoteRenumberTransaction(instance: Editor, syncedBody: PortableTextBody): boolean {
  const keyToIndex = buildKeyToIndexMap(syncedBody)
  const markType = instance.schema.marks.footnoteRef
  if (markType === undefined) {
    return false
  }

  const { doc, schema } = instance.state
  const changes: FootnoteRenumberChange[] = []

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return true
    }
    for (const mark of node.marks) {
      if (mark.type.name === 'footnoteRef') {
        const targetKey = mark.attrs.targetKey as string
        const currentIndex = mark.attrs.index as number
        const newIndex = keyToIndex.get(targetKey)
        if (newIndex !== undefined && newIndex !== currentIndex) {
          changes.push({
            from: pos,
            to: pos + node.nodeSize,
            newText: String(newIndex),
            attrs: { ...mark.attrs, index: newIndex },
          })
        }
        break
      }
    }
    return true
  })

  if (changes.length === 0) {
    return false
  }

  changes.sort((a, b) => b.from - a.from)

  let tr = instance.state.tr
  for (const c of changes) {
    tr = tr.replaceWith(c.from, c.to, schema.text(c.newText, [markType.create(c.attrs)]))
  }

  tr.setMeta('addToHistory', false)
  instance.view.dispatch(tr)
  return true
}

export function useEditorFootnotes(editor: Editor | null): UseEditorFootnotesResult {
  const [footnoteDefs, setFootnoteDefs] = useState<FootnoteDefinitionBlock[]>([])
  const footnoteDefsRef = useRef(footnoteDefs)
  footnoteDefsRef.current = footnoteDefs

  const editorFootnoteSigRef = useRef<string | null>(null)
  const isSyncingFootnotesRef = useRef(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [dialogInitialText, setDialogInitialText] = useState('')
  const footnoteEditTargetKeyRef = useRef<string | null>(null)

  const openInsertDialog = useCallback(() => {
    footnoteEditTargetKeyRef.current = null
    setDialogMode('create')
    setDialogInitialText('')
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback((targetKey: string) => {
    const def = footnoteDefsRef.current.find((d) => d._key === targetKey)
    footnoteEditTargetKeyRef.current = targetKey
    setDialogMode('edit')
    setDialogInitialText(def !== undefined ? footnoteChildrenToPlainText(def.children) : '')
    setDialogOpen(true)
  }, [])

  const syncFootnotesToEditor = useCallback((instance: Editor, merged: PortableTextBody): void => {
    if (isSyncingFootnotesRef.current) {
      return
    }
    const fp = footnoteSyncSignature(merged)
    if (fp === editorFootnoteSigRef.current) {
      return
    }
    editorFootnoteSigRef.current = fp
    isSyncingFootnotesRef.current = true
    try {
      const synced = synchronizeFootnoteIndices(merged)
      const applied = applyFootnoteRenumberTransaction(instance, synced)
      if (!applied) {
        instance.commands.setContent(bodyToPmDoc(stripFootnoteDefinitionsForEditor(synced)) as JSONContent, {
          emitUpdate: false,
        })
      }
    } finally {
      isSyncingFootnotesRef.current = false
    }
  }, [])

  const handleEditorUpdate = useCallback(
    (instance: Editor): PortableTextBody => {
      if (isSyncingFootnotesRef.current) {
        return mergeProseBodyWithFootnoteDefinitions(pmDocToBody(instance.getJSON() as PmDoc), footnoteDefsRef.current)
      }
      const merged = mergeProseBodyWithFootnoteDefinitions(
        pmDocToBody(instance.getJSON() as PmDoc),
        footnoteDefsRef.current,
      )
      const nextDefs = extractFootnoteDefinitionBlocks(merged)
      if (!footnoteDefsEqual(nextDefs, footnoteDefsRef.current)) {
        setFootnoteDefs(nextDefs)
        footnoteDefsRef.current = nextDefs
      }
      syncFootnotesToEditor(instance, merged)
      return merged
    },
    [syncFootnotesToEditor],
  )

  const insertFootnote = useCallback(
    (plainText: string): PortableTextBody | null => {
      if (editor === null) {
        return null
      }
      const editKey = footnoteEditTargetKeyRef.current
      if (editKey !== null) {
        const nextDefs = footnoteDefsRef.current.map((d) =>
          d._key === editKey ? { ...d, children: plainTextToFootnoteChildren(plainText) } : d,
        )
        setFootnoteDefs(nextDefs)
        footnoteDefsRef.current = nextDefs
        footnoteEditTargetKeyRef.current = null
        const merged = mergeProseBodyWithFootnoteDefinitions(pmDocToBody(editor.getJSON() as PmDoc), nextDefs)
        syncFootnotesToEditor(editor, merged)
        return merged
      }
      if (!canInsertFootnoteMark(editor)) {
        return null
      }
      const nextIndex = computeNextFootnoteIndex(editor, footnoteDefsRef.current)
      const defKey = generateBlockKey()
      const refMarkKey = generateBlockKey()
      const newDef: FootnoteDefinitionBlock = {
        _type: 'footnoteDefinition',
        _key: defKey,
        index: nextIndex,
        children: plainTextToFootnoteChildren(plainText),
      }
      const nextDefs = [...footnoteDefsRef.current, newDef]
      setFootnoteDefs(nextDefs)
      footnoteDefsRef.current = nextDefs
      insertFootnoteReferenceAtCaret(editor, { defKey, refMarkKey, index: nextIndex })
      const merged = mergeProseBodyWithFootnoteDefinitions(pmDocToBody(editor.getJSON() as PmDoc), nextDefs)
      syncFootnotesToEditor(editor, merged)
      return merged
    },
    [editor, syncFootnotesToEditor],
  )

  const removeFootnote = useCallback(
    (targetKey: string): PortableTextBody | null => {
      if (editor === null) {
        return null
      }
      // Update defs BEFORE deleting refs so the update handler sees the
      // correct state and avoids a second sync pass.
      const nextDefs = footnoteDefsRef.current.filter((d) => d._key !== targetKey)
      setFootnoteDefs(nextDefs)
      footnoteDefsRef.current = nextDefs

      removeFootnoteReferencesToTargetKey(editor, targetKey)
      const merged = mergeProseBodyWithFootnoteDefinitions(pmDocToBody(editor.getJSON() as PmDoc), nextDefs)
      syncFootnotesToEditor(editor, merged)
      return merged
    },
    [editor, syncFootnotesToEditor],
  )

  const reindexFootnotes = useCallback((): PortableTextBody | null => {
    if (editor === null) {
      return null
    }
    const merged = mergeProseBodyWithFootnoteDefinitions(
      pmDocToBody(editor.getJSON() as PmDoc),
      footnoteDefsRef.current,
    )
    syncFootnotesToEditor(editor, merged)
    return merged
  }, [editor, syncFootnotesToEditor])

  const resetFootnotes = useCallback(
    (body: PortableTextBody): PortableTextBody => {
      const defs = extractFootnoteDefinitionBlocks(body)
      const mergedCanon = mergeProseBodyWithFootnoteDefinitions(stripFootnoteDefinitionsForEditor(body), defs)
      const syncedDefs = extractFootnoteDefinitionBlocks(mergedCanon)
      setFootnoteDefs(syncedDefs)
      footnoteDefsRef.current = syncedDefs
      editorFootnoteSigRef.current = footnoteSyncSignature(mergedCanon)
      if (editor) {
        editor.commands.setContent(bodyToPmDoc(stripFootnoteDefinitionsForEditor(mergedCanon)) as JSONContent, {
          emitUpdate: false,
        })
      }
      return mergedCanon
    },
    [editor],
  )

  return {
    footnotes: footnoteDefs,
    dialogOpen,
    dialogMode,
    dialogInitialText,
    editTargetKey: footnoteEditTargetKeyRef.current,
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
