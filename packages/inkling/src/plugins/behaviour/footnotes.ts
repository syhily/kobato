// Footnote behaviour — headless; `FootnotePlugin` is only the React/DOM adapter.
//
// Cross-cutting invariants: removal deliberately does NOT remove a definition
// whose last ref disappears — it stays as an orphan, tailed by the renumber
// engine; the doc-end run invariant (one contiguous definition run at the
// document end) is what the string-layer export wrap relies on.
//
// Known gap: nested editors are separate LexicalEditor instances — the
// top-level walk cannot see inside them, so footnote insertion is disabled
// there and numbering never descends.

import type { FootnoteHandle } from '@kobato/inkling-internal/plugins/behaviour/footnote-handle'
import type { LexicalEditor, LexicalNode, NodeKey } from 'lexical'

import { $isCodeBlockNode } from '@kobato/inkling-internal/nodes/base/nodes/codeblock/CodeBlockNode'
import {
  $isFootnoteDefinitionNode,
  type BaseFootnoteDefinitionNode,
} from '@kobato/inkling-internal/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
import { createFootnoteTargetKey } from '@kobato/inkling-internal/nodes/footnote/footnote-keys'
import {
  $createFootnoteRefNode,
  $isFootnoteRefNode,
  type FootnoteRefNode,
} from '@kobato/inkling-internal/nodes/footnote/FootnoteRefNode'
import { $createFootnoteDefinitionNode } from '@kobato/inkling-internal/nodes/FootnoteDefinitionNode'
import { registerUpdateScan } from '@kobato/inkling-internal/plugins/behaviour/update-scan'
import { getRegisteredNodeMap, isNestedEditor } from '@kobato/inkling-internal/utils/lexical-internals'
import { $isTableCellNode } from '@lexical/table'
import { mergeRegister } from '@lexical/utils'
import { $getRoot, $getSelection, $isElementNode, $isRangeSelection, $isTextNode, RootNode } from 'lexical'

export const FOOTNOTE_INSERT_TRIGGER_REGEX = /(\s|^)\^ $/
export function $canInsertFootnoteRef(editor: LexicalEditor): boolean {
  if (!editor.isEditable()) {
    return false
  }
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false
  }
  let node: LexicalNode | null = selection.anchor.getNode()
  while (node) {
    if ($isTableCellNode(node) || $isCodeBlockNode(node)) {
      return false
    }
    node = node.getParent()
  }
  return true
}

interface FootnoteSnapshot {
  refs: FootnoteRefNode[]

  definitions: BaseFootnoteDefinitionNode[]
}
function $walkFootnoteRefs(node: LexicalNode, refs: FootnoteRefNode[]): void {
  if ($isFootnoteRefNode(node)) {
    refs.push(node)
    return
  }
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      $walkFootnoteRefs(child, refs)
    }
  }
}

export function $collectFootnoteSnapshot(): FootnoteSnapshot {
  const refs: FootnoteRefNode[] = []
  const definitions: BaseFootnoteDefinitionNode[] = []
  for (const child of $getRoot().getChildren()) {
    if ($isFootnoteDefinitionNode(child)) {
      definitions.push(child)
      continue
    }
    $walkFootnoteRefs(child, refs)
  }
  return { refs, definitions }
}

/**
 * The signature short-circuit: ref `targetKey:digit` occurrences in citation
 * order, then sorted definition `targetKey@rank` entries — any
 * renumber-relevant change flips the string, so an unchanged signature skips
 * the engine entirely.
 */
export function $footnoteSyncSignature(snapshot: FootnoteSnapshot): string {
  const occurrences = snapshot.refs.map((ref) => `${ref.targetKey}:${ref.getTextContent()}`)
  const defs = snapshot.definitions.map((definition, rank) => `${definition.targetKey}@${rank + 1}`).sort()
  return `${occurrences.join('\u001f')}\u001e${defs.join('\u001f')}`
}

function collectCitationOrder(snapshot: FootnoteSnapshot): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const ref of snapshot.refs) {
    if (!seen.has(ref.targetKey)) {
      seen.add(ref.targetKey)
      order.push(ref.targetKey)
    }
  }
  for (const definition of snapshot.definitions) {
    if (!seen.has(definition.targetKey)) {
      seen.add(definition.targetKey)
      order.push(definition.targetKey)
    }
  }
  return order
}

export function $syncFootnoteIndices(snapshot: FootnoteSnapshot = $collectFootnoteSnapshot()): void {
  const { refs, definitions } = snapshot
  if (definitions.length === 0) {
    return
  }
  const definitionKeys = new Set(definitions.map((definition) => definition.targetKey))
  for (const ref of refs) {
    if (!definitionKeys.has(ref.targetKey)) {
      return
    }
  }

  const order = collectCitationOrder(snapshot)
  if (order.length === 0) {
    return
  }
  const keyToIndex = new Map(order.map((key, index) => [key, index + 1]))

  for (const ref of refs) {
    const index = keyToIndex.get(ref.targetKey)
    if (index !== undefined && ref.getTextContent() !== String(index)) {
      ref.setTextContent(String(index))
    }
  }

  const byKey = new Map(definitions.map((definition) => [definition.targetKey, definition]))

  const desired = order.map((key) => {
    const definition = byKey.get(key)
    if (!definition) {
      throw new Error(`[footnotes] ref targets missing definition '${key}' during reorder`)
    }
    return definition
  })
  if (desired.every((definition, index) => definition === definitions[index])) {
    return
  }
  let anchor: LexicalNode | null = definitions[0].getPreviousSibling()
  for (const definition of desired) {
    definition.remove()
    if (anchor === null) {
      const first = $getRoot().getFirstChild()
      if (first) {
        first.insertBefore(definition)
      } else {
        $getRoot().append(definition)
      }
    } else {
      anchor.insertAfter(definition)
    }
    anchor = definition
  }
}

function $computeNextFootnoteIndex(): number {
  const cited = new Set($collectFootnoteSnapshot().refs.map((ref) => ref.targetKey))
  return cited.size + 1
}

export function $insertFootnoteReference(handle: FootnoteHandle): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return
  }
  const anchorNode = selection.anchor.getNode()
  if (!$isTextNode(anchorNode)) {
    return
  }
  const text = anchorNode.getTextContent()
  const triggerStart = text.length - 2
  const targetKey = createFootnoteTargetKey()
  const ref = $createFootnoteRefNode(String($computeNextFootnoteIndex()), targetKey)
  const definition = $createFootnoteDefinitionNode({ targetKey, content: '' })

  anchorNode.setTextContent(text.slice(0, triggerStart))
  anchorNode.select(triggerStart, triggerStart)
  const caretSelection = $getSelection()
  if ($isRangeSelection(caretSelection)) {
    caretSelection.insertNodes([ref])
  }
  $getRoot().append(definition)

  handle.requestFocus(targetKey)
}

export function $removeFootnote(targetKey: string): boolean {
  if (targetKey === '') {
    return false
  }
  const snapshot = $collectFootnoteSnapshot()
  let removed = false
  for (const ref of snapshot.refs) {
    if (ref.targetKey === targetKey) {
      ref.remove()
      removed = true
    }
  }
  for (const definition of snapshot.definitions) {
    if (definition.targetKey === targetKey) {
      definition.remove()
      removed = true
    }
  }
  return removed
}

function $guardFootnoteDefinitionRun(root: RootNode): void {
  const children = root.getChildren()
  const firstDefinitionIndex = children.findIndex((child) => $isFootnoteDefinitionNode(child))
  if (firstDefinitionIndex === -1) {
    return
  }
  const firstDefinition = children[firstDefinitionIndex]
  for (const child of children.slice(firstDefinitionIndex + 1)) {
    if ($isFootnoteDefinitionNode(child)) {
      continue
    }
    child.remove()
    firstDefinition.insertBefore(child)
  }
}
interface FootnoteScanState {
  lastSignature: string | undefined
}
function $scanFootnoteCaretTrigger(editor: LexicalEditor, handle: FootnoteHandle): void {
  if (!$canInsertFootnoteRef(editor)) {
    return
  }
  // $canInsertFootnoteRef just proved range+collapsed, but the compiler
  // can't see it — guard locally instead of asserting
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return
  }
  const anchorNode = selection.anchor.getNode()
  if (!$isTextNode(anchorNode) || $isFootnoteRefNode(anchorNode)) {
    return
  }
  const text = anchorNode.getTextContent()

  if (selection.anchor.offset !== text.length || !FOOTNOTE_INSERT_TRIGGER_REGEX.test(text)) {
    return
  }
  $insertFootnoteReference(handle)
}

function footnoteMapsFromSnapshot(snapshot: FootnoteSnapshot): {
  indices: Record<string, number>
  definitionNodeKeys: Record<string, NodeKey>
} {
  const indices: Record<string, number> = {}
  const definitionNodeKeys: Record<string, NodeKey> = {}
  snapshot.definitions.forEach((definition, rank) => {
    indices[definition.targetKey] = rank + 1
    definitionNodeKeys[definition.targetKey] = definition.getKey()
  })
  return { indices, definitionNodeKeys }
}

function $scanFootnoteRenumber(handle: FootnoteHandle, state: FootnoteScanState): void {
  const before = $collectFootnoteSnapshot()
  if ($footnoteSyncSignature(before) === state.lastSignature) {
    return
  }
  $syncFootnoteIndices(before)

  const after = $collectFootnoteSnapshot()
  state.lastSignature = $footnoteSyncSignature(after)

  const { indices, definitionNodeKeys } = footnoteMapsFromSnapshot(after)
  handle.publishMaps(indices, definitionNodeKeys)
}

export function publishFootnoteMaps(editor: LexicalEditor, handle: FootnoteHandle): void {
  editor.read(() => {
    const { indices, definitionNodeKeys } = footnoteMapsFromSnapshot($collectFootnoteSnapshot())
    handle.publishMaps(indices, definitionNodeKeys)
  })
}

export function registerFootnotes(editor: LexicalEditor, handle: FootnoteHandle): () => void {
  if (isNestedEditor(editor)) {
    return () => {
      /* noop */
    }
  }
  const registeredTypes = new Set([...getRegisteredNodeMap(editor).values()].map(({ klass }) => klass.getType()))
  if (!registeredTypes.has('footnote-ref') || !registeredTypes.has('footnotedefinition')) {
    return () => {
      /* noop */
    }
  }
  const scanState: FootnoteScanState = { lastSignature: undefined }

  return mergeRegister(
    registerUpdateScan(editor, {
      dirty: 'leaves',
      scan: () => $scanFootnoteCaretTrigger(editor, handle),
    }),
    registerUpdateScan(editor, {
      dirty: 'leaves-or-elements',
      scan: () => $scanFootnoteRenumber(handle, scanState),
    }),
    editor.registerNodeTransform(RootNode, $guardFootnoteDefinitionRun),
  )
}
