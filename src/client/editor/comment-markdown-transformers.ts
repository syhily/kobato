// The comment editor's markdown shortcut set: inkling's DEFAULT_TRANSFORMERS
// filtered down to the transformers whose node classes the comment composer
// actually registers. Deriving from the registered classes (instead of naming
// transformers) keeps this list in lockstep with `COMMENT_EDITOR_NODES`:
// dropping a node class automatically drops its markdown trigger.
//
// The filter yields QUOTE / UNORDERED_LIST / ORDERED_LIST (list + quote
// classes registered), CODE_BLOCK (the ``` fence — CodeBlockNode is
// registered, and the fence captures the info string, so ```math is the
// comment formula path), the text-format and custom text-format runs (bold /
// italic / strikethrough / inline code / highlight — no node dependencies),
// and the LINK text-match transformer (LinkNode registered). HEADING and HR
// fall out because HeadingNode and HorizontalRuleNode are not mounted.

import type { Transformer } from '@/inkling'

import { COMMENT_EDITOR_NODES } from '@/client/editor/comment-editor-nodes'
import { DEFAULT_TRANSFORMERS } from '@/inkling'

const REGISTERED_NODE_CLASSES = new Set<unknown>(COMMENT_EDITOR_NODES.filter((entry) => typeof entry === 'function'))

export const COMMENT_MARKDOWN_TRANSFORMERS: Transformer[] = DEFAULT_TRANSFORMERS.filter(
  (transformer) =>
    !('dependencies' in transformer) || transformer.dependencies.every((klass) => REGISTERED_NODE_CLASSES.has(klass)),
)
