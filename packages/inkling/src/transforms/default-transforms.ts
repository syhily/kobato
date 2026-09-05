import type { LexicalEditor } from 'lexical'

import { $createListItemNode, $createListNode, ListItemNode, ListNode } from '@lexical/list'
import { $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text'
import { mergeRegister, $createParagraphNode, ParagraphNode } from 'lexical'

import { ExtendedHeadingNode } from '@/nodes/base'
import { registerTableCellGuard } from '@/nodes/table/table-cell-guard'
import { registerDenestTransform } from '@/transforms/transforms/denest'
import { registerMergeListNodesTransform } from '@/transforms/transforms/merge-list-nodes'
import { registerRemoveAlignmentTransform } from '@/transforms/transforms/remove-alignment'

export * from '@/transforms/transforms/denest'
export * from '@/transforms/transforms/merge-list-nodes'
export * from '@/transforms/transforms/remove-alignment'

// only used when rendering so not registered by default
export * from '@/transforms/transforms/remove-at-link-nodes'

export interface DefaultTransformsOptions {
  /**
   * 'strip' (default) resets element `format` (text-align) so imported or
   * pasted alignment can't linger invisible on surfaces without alignment
   * UI; 'keep' preserves it for surfaces that expose alignment controls.
   */
  alignment?: 'strip' | 'keep'
}

export function registerDefaultTransforms(editor: LexicalEditor, options?: DefaultTransformsOptions) {
  const alignment = options?.alignment ?? 'strip'

  return mergeRegister(
    // strip unwanted alignment formats
    ...(alignment === 'strip'
      ? [
          registerRemoveAlignmentTransform(editor, ParagraphNode),
          registerRemoveAlignmentTransform(editor, HeadingNode),
          registerRemoveAlignmentTransform(editor, ExtendedHeadingNode),
          registerRemoveAlignmentTransform(editor, QuoteNode),
          // Lexical 0.46 added format support to list items; strip alignment from them too
          registerRemoveAlignmentTransform(editor, ListItemNode),
        ]
      : []),

    // fix invalid nesting of nodes
    registerDenestTransform(editor, ParagraphNode, () => $createParagraphNode()),
    registerDenestTransform(editor, HeadingNode, (node) => $createHeadingNode(node.getTag())),
    registerDenestTransform(editor, ExtendedHeadingNode, (node) => new ExtendedHeadingNode(node.getTag())),
    registerDenestTransform(editor, QuoteNode, () => $createQuoteNode()),
    registerDenestTransform(editor, ListNode, (node) => $createListNode(node.getListType(), node.getStart())),
    registerDenestTransform(editor, ListItemNode, () => $createListItemNode()),

    // merge adjacent lists of the same type
    registerMergeListNodesTransform(editor),

    // keep table cells inline-only (no-op when the table family isn't registered)
    registerTableCellGuard(editor),
  )
}
