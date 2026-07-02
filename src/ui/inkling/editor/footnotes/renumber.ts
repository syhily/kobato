import type { LexicalEditor, LexicalNode } from 'lexical'

import { $getRoot, $isElementNode } from 'lexical'

import type { InklingFootnoteRefEntry } from '@/shared/inkling/footnotes'
import type { FootnoteDefinitionItem } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'

import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'

/**
 * Build a `targetKey → 1-based index` map in first-reference order, then
 * append any unreferenced definitions at the tail (preserving their relative
 * order). This is the parallel-state analogue of the `buildTargetKeyToIndexMap`
 * helper that used to live here, but it no longer reads definitions from the
 * editor tree — the caller passes them from the provider.
 */
export function buildFootnoteIndexMap(
  refs: readonly InklingFootnoteRefEntry[],
  definitions: readonly FootnoteDefinitionItem[],
): Map<string, number> {
  const seen = new Set<string>()
  const keyToIndex = new Map<string, number>()

  for (const ref of refs) {
    if (seen.has(ref.targetKey)) {
      continue
    }
    seen.add(ref.targetKey)
    keyToIndex.set(ref.targetKey, seen.size)
  }
  // Definitions without a ref keep their place at the end so the dialog can
  // still edit them transiently (e.g. during create-before-ref-insert).
  for (const def of definitions) {
    if (seen.has(def.targetKey)) {
      continue
    }
    seen.add(def.targetKey)
    keyToIndex.set(def.targetKey, seen.size)
  }

  return keyToIndex
}

/**
 * Apply a `targetKey → index` map to every `FootnoteRefNode` currently in the
 * editor tree. Must run inside an active `editor.update`. Only touches refs
 * whose index actually changed.
 */
export function $applyFootnoteRefIndices(keyToIndex: Map<string, number>): void {
  const root = $getRoot()
  const stack: LexicalNode[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined) {
      continue
    }
    if (node instanceof FootnoteRefNode) {
      const newIndex = keyToIndex.get(node.getTargetKey())
      if (newIndex !== undefined && newIndex !== node.getIndex()) {
        node.setIndex(newIndex)
      }
      continue
    }
    if ($isElementNode(node)) {
      stack.push(...node.getChildren())
    }
  }
}

/**
 * Renumber the editor's `FootnoteRefNode`s in place. Definitions live in the
 * provider and are renumbered by the provider itself (see
 * `InklingFootnoteProvider.removeOrphans` + `replaceDefinition`); this function
 * only touches the editor tree.
 *
 * Must be called inside an `editor.update`. Pair with
 * `applyFootnoteRenumberWithHistoryMerge` for the standard history-merge
 * dispatch.
 */
export function $renumberFootnotes(
  refs: readonly InklingFootnoteRefEntry[],
  definitions: readonly FootnoteDefinitionItem[],
): void {
  const keyToIndex = buildFootnoteIndexMap(refs, definitions)
  $applyFootnoteRefIndices(keyToIndex)
}

/**
 * Dispatch `$renumberFootnotes` as a history-merged update so it doesn't push
 * a separate undo entry (U4 gate). The `discrete: true` flag forces a
 * synchronous commit so callers reading the editor state immediately after
 * see the new indices.
 */
export function applyFootnoteRenumberWithHistoryMerge(
  editor: LexicalEditor,
  refs: readonly InklingFootnoteRefEntry[],
  definitions: readonly FootnoteDefinitionItem[],
): void {
  editor.update(() => $renumberFootnotes(refs, definitions), {
    tag: 'history-merge',
    discrete: true,
  })
}

/**
 * Stable signature of the current ref→index assignment. Used by the editor
 * update listener to detect whether renumber actually needs to run — without
 * this gate, the renumber update would re-fire the listener and loop.
 *
 * Mirrors the Tiptap-era `footnoteSyncSignature` pattern.
 */
export function footnoteSyncSignature(
  refs: readonly InklingFootnoteRefEntry[],
  definitions: readonly FootnoteDefinitionItem[],
): string {
  // CRITICAL: refs must be joined in DOCUMENT ORDER (no sort). The first-
  // reference order determines index assignment, so swapping two refs' positions
  // changes their target indices even though the multiset is identical. Sorting
  // here would make the signature insensitive to reordering and the renumber
  // listener would skip legitimate renumbers after cut/paste/drag.
  const refParts = refs.map((r) => `${r.targetKey}@${r.index}`)
  // Definitions are order-insensitive for signature purposes (their indices are
  // derived from refs), so sorting them is fine and keeps the signature stable
  // across provider-state reshuffles that don't affect refs.
  const defParts = definitions.map((d) => `${d.targetKey}@${d.index}`).sort()
  return `r:${refParts.join(',')}|d:${defParts.join(',')}`
}
