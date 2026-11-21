import type { LexicalEditor } from 'lexical'

import { ExtendedHeadingNode } from '@kobato/inkling-internal/nodes/base'
import { registerTableCellGuard } from '@kobato/inkling-internal/nodes/table/table-cell-guard'
import { registerDenestTransform } from '@kobato/inkling-internal/transforms/denest'
import { registerMergeListNodesTransform } from '@kobato/inkling-internal/transforms/merge-list-nodes'
import { registerRemoveAlignmentTransform } from '@kobato/inkling-internal/transforms/remove-alignment'
import { $createListItemNode, $createListNode, ListItemNode, ListNode } from '@lexical/list'
import { $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text'
import { mergeRegister, $createParagraphNode, ParagraphNode } from 'lexical'

export * from '@kobato/inkling-internal/transforms/denest'
export * from '@kobato/inkling-internal/transforms/merge-list-nodes'
export * from '@kobato/inkling-internal/transforms/remove-alignment'

export * from '@kobato/inkling-internal/transforms/remove-at-link-nodes'

export interface DefaultTransformsOptions {
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
          registerRemoveAlignmentTransform(editor, ListItemNode),
        ]
      : []),

    registerDenestTransform(editor, ParagraphNode, () => $createParagraphNode()),
    registerDenestTransform(editor, HeadingNode, (node) => $createHeadingNode(node.getTag())),
    registerDenestTransform(editor, ExtendedHeadingNode, (node) => new ExtendedHeadingNode(node.getTag())),
    registerDenestTransform(editor, QuoteNode, () => $createQuoteNode()),
    registerDenestTransform(editor, ListNode, (node) => $createListNode(node.getListType(), node.getStart())),
    registerDenestTransform(editor, ListItemNode, () => $createListItemNode()),

    registerMergeListNodesTransform(editor),

    registerTableCellGuard(editor),
  )
}
