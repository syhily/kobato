// The footnote behaviour module —
// headless; `FootnotePlugin` is only the React/DOM adapter. Four pieces:
//
// - **Caret trigger** — `^ ` at the caret tail inserts ref + definition
//   (`$insertFootnoteReference`), through the update-scan seam. The regex
//   carries kobato's backslash suppression (`\^ ` never matches: the char
//   before `^` must be whitespace or line start); the table/code-block
//   guard ports kobato's `canInsertFootnoteMark`.
// - **Renumber engine** (`$syncFootnoteIndices`) — kobato's pure-tree
//   algorithm (`footnote-sync.ts:225-247`) as a Lexical traversal: refs in
//   first-citation order, orphan definitions tailed in their stored order,
//   digits written back into the ref TEXT (the text is the index) and the
//   definition run reordered. Whole-sync is skipped when a ref targets a
//   missing definition (prose-only round-trip preservation). Gated by the
//   signature short-circuit (`footnote-sync.ts:117-127`).
// - **Removal** (`$removeFootnote`) — definition card plus every ref
//   pointing at it (`removeFootnoteReferencesToTargetKey` port). The
//   reverse is deliberately NOT done: a definition whose last ref
//   disappears becomes an orphan and is kept, tailed by the engine —
//   kobato's semantics.
// - **Doc-end run invariant** — a RootNode transform keeps the definitions
//   one contiguous run at the document end, so "the footnotes section" is
//   true while editing and at export (the string-layer wrap relies on it).
//
// Known v1 gap (reviewed): nested editors are separate LexicalEditor
// instances — the top-level walk cannot see inside them, so footnote
// insertion is disabled there (registration is skipped per editor
// instance) and numbering never descends. kobato descends into
// solution/twoColumn; the gap is documented for migration.

import type { LexicalEditor, LexicalNode, NodeKey } from 'lexical'

import { $isTableCellNode } from '@lexical/table'
import { mergeRegister } from '@lexical/utils'
import { $getRoot, $getSelection, $isElementNode, $isRangeSelection, $isTextNode, RootNode } from 'lexical'

import { $isCodeBlockNode } from '@/nodes/base/nodes/codeblock/CodeBlockNode'
import {
  $isFootnoteDefinitionNode,
  type BaseFootnoteDefinitionNode,
} from '@/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
import { createFootnoteTargetKey } from '@/nodes/footnote/footnote-keys'
import { $createFootnoteRefNode, $isFootnoteRefNode, type FootnoteRefNode } from '@/nodes/footnote/FootnoteRefNode'
import { $createFootnoteDefinitionNode } from '@/nodes/FootnoteDefinitionNode'
import { getRegisteredNodeMap, isNestedEditor } from '@/utils/lexical-internals'

import type { FootnoteHandle } from './footnoteHandle'

import { registerUpdateScan } from './update-scan'

/**
 * Caret trigger: `^ ` typed at the caret, with kobato's backslash
 * suppression built in — the character before `^` must be whitespace or
 * line start, so `\^ ` never fires. Narrower than kobato's
 * `/(^|[^\\])(\^ )$/` on purpose (any non-backslash char armed kobato's
 * trigger; the spec tightens it to a word boundary).
 */
export const FOOTNOTE_INSERT_TRIGGER_REGEX = /(\s|^)\^ $/

/** kobato's `canInsertFootnoteMark`: editable, and not inside a table cell or code block. */
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
  /** Every ref occurrence in document order (top-level walk — see the v1 nested-editor gap above). */
  refs: FootnoteRefNode[]
  /** The definition cards in document order. */
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

/** Top-level snapshot: refs in document order, definitions in document order. */
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
 * The signature short-circuit (kobato `footnoteSyncSignature`): ref
 * `targetKey:digit` occurrences in citation order, then sorted definition
 * `targetKey@rank` entries — any renumber-relevant change flips the string,
 * so an unchanged signature skips the engine entirely.
 */
export function $footnoteSyncSignature(snapshot: FootnoteSnapshot): string {
  const occurrences = snapshot.refs.map((ref) => `${ref.targetKey}:${ref.getTextContent()}`)
  const defs = snapshot.definitions.map((definition, rank) => `${definition.targetKey}@${rank + 1}`).sort()
  return `${occurrences.join('\u001f')}\u001e${defs.join('\u001f')}`
}

/** Citation order: first-citation order, then orphan definitions in their stored order. */
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

/**
 * The renumber engine (kobato `synchronizeFootnoteIndices`): number refs by
 * first-citation order, tail orphan definitions, write the digits back into
 * the ref texts, and reorder the doc-end definition run to match. Skips
 * wholesale when there are no definitions or a ref targets a missing one.
 */
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

  // digits live in the ref text — rewrite in place where renumbered
  for (const ref of refs) {
    const index = keyToIndex.get(ref.targetKey)
    if (index !== undefined && ref.getTextContent() !== String(index)) {
      ref.setTextContent(String(index))
    }
  }

  // reorder the definition run to citation order, keeping the run's anchor
  const byKey = new Map(definitions.map((definition) => [definition.targetKey, definition]))
  // every ref's targetKey resolves a definition — the sync is skipped when
  // one doesn't, so a miss here names a broken invariant, never undefined
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

/** The next visible index for a freshly inserted ref — the engine renumbers right after, so distinct-cited + 1 is enough. */
function $computeNextFootnoteIndex(): number {
  const cited = new Set($collectFootnoteSnapshot().refs.map((ref) => ref.targetKey))
  return cited.size + 1
}

/**
 * The caret-trigger insert body: consume the `^ ` trigger text, mint the
 * targetKey, append the definition card at the document end (the run
 * transform keeps it contiguous), insert the ref where the caret sat, and
 * file the focus handoff for the new definition's nested editor.
 */
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

/** kobato's `removeFootnoteReferencesToTargetKey` plus the definition card itself. */
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

/**
 * The doc-end run invariant as a RootNode transform: any non-definition
 * sitting after the run's first definition moves before the run. One
 * operation covers both directions — a definition dragged mid-document gets
 * its trailing non-definitions hoisted ahead of it (so it lands back at the
 * end), and a paragraph inserted after the run is pulled before it.
 */
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
  // the caret must sit at the very tail of the trigger text
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
  // re-snapshot after the engine's writes: the signature to remember and the
  // handle maps both describe the settled state
  const after = $collectFootnoteSnapshot()
  state.lastSignature = $footnoteSyncSignature(after)

  const { indices, definitionNodeKeys } = footnoteMapsFromSnapshot(after)
  handle.publishMaps(indices, definitionNodeKeys)
}

/** The initial publish: rows rendering preloaded footnotes need their badges before the first edit fires a scan. */
export function publishFootnoteMaps(editor: LexicalEditor, handle: FootnoteHandle): void {
  editor.read(() => {
    const { indices, definitionNodeKeys } = footnoteMapsFromSnapshot($collectFootnoteSnapshot())
    handle.publishMaps(indices, definitionNodeKeys)
  })
}

/**
 * Register the whole footnote behaviour on one editor: the caret-trigger
 * scan, the renumber scan, and the doc-end run transform. Skipped on
 * editors without the footnote node pair and on nested editors (the v1
 * gap — insertion is top-level only, guarded per editor instance).
 */
export function registerFootnotes(editor: LexicalEditor, handle: FootnoteHandle): () => void {
  if (isNestedEditor(editor)) {
    return () => {}
  }
  const registeredTypes = new Set([...getRegisteredNodeMap(editor).values()].map(({ klass }) => klass.getType()))
  if (!registeredTypes.has('footnote-ref') || !registeredTypes.has('footnotedefinition')) {
    return () => {}
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
