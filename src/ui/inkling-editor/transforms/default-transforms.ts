import type { LexicalEditor } from 'lexical'

import { $createListItemNode, $createListNode, ListItemNode, ListNode } from '@lexical/list'
import { $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text'
import { mergeRegister } from '@lexical/utils'
import { $createParagraphNode, ParagraphNode } from 'lexical'

import { ExtendedHeadingNode } from '@/ui/inkling-editor/nodes/base'
/* c8 ignore start */
import { registerDenestTransform } from '@/ui/inkling-editor/transforms/transforms/denest'
import { registerMergeListNodesTransform } from '@/ui/inkling-editor/transforms/transforms/merge-list-nodes'
import { registerRemoveAlignmentTransform } from '@/ui/inkling-editor/transforms/transforms/remove-alignment'

export * from '@/ui/inkling-editor/transforms/transforms/denest'
export * from '@/ui/inkling-editor/transforms/transforms/merge-list-nodes'
export * from '@/ui/inkling-editor/transforms/transforms/remove-alignment'

// only used when rendering so not registered by default
export * from '@/ui/inkling-editor/transforms/transforms/remove-at-link-nodes'
/* c8 ignore stop */

/* c8 ignore next */
export function registerDefaultTransforms(editor: LexicalEditor) {
  return mergeRegister(
    // strip unwanted alignment formats
    registerRemoveAlignmentTransform(editor, ParagraphNode),
    registerRemoveAlignmentTransform(editor, HeadingNode),
    registerRemoveAlignmentTransform(editor, ExtendedHeadingNode),
    registerRemoveAlignmentTransform(editor, QuoteNode),

    // fix invalid nesting of nodes
    registerDenestTransform(editor, ParagraphNode, () => $createParagraphNode()),
    registerDenestTransform(editor, HeadingNode, (node) => $createHeadingNode(node.getTag())),
    registerDenestTransform(editor, ExtendedHeadingNode, (node: ExtendedHeadingNode) =>
      $createHeadingNode(node.getTag()),
    ),
    registerDenestTransform(editor, QuoteNode, () => $createQuoteNode()),
    registerDenestTransform(editor, ListNode, (node) => $createListNode(node.getListType(), node.getStart())),
    registerDenestTransform(editor, ListItemNode, () => $createListItemNode()),

    // merge adjacent lists of the same type
    registerMergeListNodesTransform(editor),
  )
}
