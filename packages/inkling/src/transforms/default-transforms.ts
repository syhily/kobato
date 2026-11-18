import type { LexicalEditor } from 'lexical'

import { ExtendedHeadingNode } from '@kobato/inkling-internal/nodes/base'
import { registerTableCellGuard } from '@kobato/inkling-internal/nodes/table/table-cell-guard'
import { registerDenestTransform } from '@kobato/inkling-internal/transforms/transforms/denest'
import { registerMergeListNodesTransform } from '@kobato/inkling-internal/transforms/transforms/merge-list-nodes'
import { registerRemoveAlignmentTransform } from '@kobato/inkling-internal/transforms/transforms/remove-alignment'
import { $createListItemNode, $createListNode, ListItemNode, ListNode } from '@lexical/list'
import { $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text'
import { mergeRegister, $createParagraphNode, ParagraphNode } from 'lexical'

export * from '@kobato/inkling-internal/transforms/transforms/denest'
export * from '@kobato/inkling-internal/transforms/transforms/merge-list-nodes'
export * from '@kobato/inkling-internal/transforms/transforms/remove-alignment'

// registered only on render paths, never by default
export * from '@kobato/inkling-internal/transforms/transforms/remove-at-link-nodes'

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
    ...(alignment === 'strip'
      ? [
          registerRemoveAlignmentTransform(editor, ParagraphNode),
          registerRemoveAlignmentTransform(editor, HeadingNode),
          registerRemoveAlignmentTransform(editor, ExtendedHeadingNode),
          registerRemoveAlignmentTransform(editor, QuoteNode),
          // upstream list items support formats, so strip alignment from them too
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
