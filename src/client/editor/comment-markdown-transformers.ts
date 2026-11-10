// inkling's DEFAULT_TRANSFORMERS filtered down to the transformers whose node
// classes the comment composer registers: deriving from the classes (not names)
// keeps this in lockstep with COMMENT_EDITOR_NODES. The ``` fence captures its
// info string, so ```math is the comment formula path.

import type { Transformer } from '@/inkling'

import { COMMENT_EDITOR_NODES } from '@/client/editor/comment-editor-nodes'
import { DEFAULT_TRANSFORMERS } from '@/inkling'

const REGISTERED_NODE_CLASSES = new Set<unknown>(COMMENT_EDITOR_NODES.filter((entry) => typeof entry === 'function'))

export const COMMENT_MARKDOWN_TRANSFORMERS: Transformer[] = DEFAULT_TRANSFORMERS.filter(
  (transformer) =>
    !('dependencies' in transformer) || transformer.dependencies.every((klass) => REGISTERED_NODE_CLASSES.has(klass)),
)
